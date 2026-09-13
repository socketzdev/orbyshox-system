import { Injectable, UnauthorizedException, Inject, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  private async validateUser(identifier: string, pass: string) {
    if (!identifier || !pass) return null;
    const raw = identifier.trim();
    const cleanPhone = raw.replace(/\D/g, '');
    const withoutCountryCode = cleanPhone.startsWith('55') && cleanPhone.length > 10 ? cleanPhone.slice(2) : cleanPhone;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: raw.toLowerCase() },
          { phone: raw },
          cleanPhone ? { phone: cleanPhone } : undefined,
          cleanPhone ? { phone: `+${cleanPhone}` } : undefined,
          cleanPhone ? { phone: `+55${withoutCountryCode}` } : undefined,
          withoutCountryCode ? { phone: withoutCountryCode } : undefined,
          withoutCountryCode ? { email: `${withoutCountryCode}@projetosaas.com` } : undefined,
        ].filter(Boolean) as any,
      },
      // Whitelist: sem `select`, a linha inteira (passwordHash, twoFactorSecret)
      // era carregada e circulava pelo escopo do serviço.
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        tenantId: true,
        companyId: true,
        isActive: true,
        is2faEnabled: true,
        passwordHash: true,
        tenant: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            tradeName: true,
            status: true,
            niche: true,
          },
        },
      },
    });

    if (!user) return null;

    // A senha é verificada ANTES de qualquer checagem de estado, por dois
    // motivos que se somam:
    //  1. Não vazar que a conta existe (se respondêssemos "conta desativada"
    //     sem checar a senha, qualquer um enumeraria contas com uma tentativa).
    //  2. Tempo de resposta uniforme — argon2 é caro e, se fosse pulado para
    //     contas desativadas, a diferença de latência denunciaria o estado.
    const passwordMatches = await argon2.verify(user.passwordHash, pass).catch(() => false);
    if (!passwordMatches) return null;

    // Conta desativada: credenciais corretas, mas sem acesso. A mensagem aqui
    // é genérica de propósito — quem sabe a senha já conhece a conta, então não
    // há vazamento, e o usuário legítimo recebe orientação em vez de um erro
    // enigmático.
    if (!user.isActive) {
      throw new UnauthorizedException('Esta conta está desativada. Fale com o administrador.');
    }

    return user;
  }

  async login(loginDto: any) {
    const user = await this.validateUser(loginDto?.email, loginDto?.password);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    if (user.is2faEnabled) {
      // TTL curto e explícito: este token é uma passagem de mão única para
      // concluir o 2FA, não uma sessão. Os 15 min herdados do módulo eram uma
      // janela generosa demais para um token que já provou a senha.
      const tempToken = this.jwtService.sign(
        { sub: user.id, mfa_pending: true },
        { expiresIn: '5m' },
      );
      return { mfaRequired: true as const, tempToken };
    }

    const accessToken = await this.generateAccessToken(user);
    const { token: refreshToken } = await this.generateRefreshToken(user.id);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        companyId: user.companyId,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              slug: user.tenant.slug,
              companyName: user.tenant.companyName,
              tradeName: user.tenant.tradeName,
              status: user.tenant.status,
              niche: user.tenant.niche,
            }
          : null,
      },
    };
  }

  async refresh(token: string | null | undefined, userId?: string) {
    if (!token) throw new UnauthorizedException('Refresh token ausente.');

    // O token tem o formato `<refreshId>.<segredo>`. O id resolve a linha
    // diretamente, evitando varrer a tabela inteira e comparar hash por hash.
    const [refreshId, secret] = token.split('.');
    if (!refreshId || !secret) throw new UnauthorizedException('Refresh token inválido');

    const candidate = await this.prisma.refreshToken.findUnique({
      where: { id: refreshId },
    });

    // Sem registro correspondente → token inválido/forjado.
    if (!candidate) throw new UnauthorizedException('Refresh token inválido');

    // Se o cookie de contexto indicar outro usuário, recusa antes de verificar
    // o hash (defesa em profundidade contra troca de token entre contas).
    if (userId && candidate.userId !== userId) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    let hashMatches = false;
    try {
      hashMatches = await argon2.verify(candidate.tokenHash, secret);
    } catch {
      hashMatches = false;
    }
    if (!hashMatches) throw new UnauthorizedException('Refresh token inválido');

    // Reuso de token já rotacionado: revoga a família inteira (possível roubo).
    if (candidate.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: candidate.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão comprometida. Faça login novamente.');
    }

    // Expirado (não foi filtrado na query, então checamos explicitamente).
    if (candidate.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const user = await this.prisma.user.findUnique({ where: { id: candidate.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();

    // Rotação: revoga o atual e emite um novo na mesma família, encadeando
    // replacedByTokenId para rastreabilidade.
    const { token: newRefresh, id: newRefreshId } = await this.generateRefreshToken(
      user.id,
      candidate.familyId,
    );

    await this.prisma.refreshToken.update({
      where: { id: candidate.id },
      data: { revokedAt: new Date(), replacedByTokenId: newRefreshId },
    });

    const accessToken = await this.generateAccessToken(user);

    return { accessToken, refreshToken: newRefresh };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async setup2fa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuário não encontrado');

    const secret = authenticator.generateSecret();
    const appName = this.config.get('TWO_FACTOR_APP_NAME') || 'ProjetoSaaS';
    const qrCodeUrl = authenticator.keyuri(user.email || user.phone || user.id, appName, secret);

    const rawCodes = Array.from({ length: 8 }).map(() => crypto.randomBytes(4).toString('hex'));
    const recoveryCodes = await Promise.all(
      rawCodes.map(async (code) => ({
        userId,
        codeHash: await argon2.hash(code),
      })),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.recoveryCode.createMany({ data: recoveryCodes });
    });

    return { qrCodeUrl, secret, recoveryCodes: rawCodes };
  }

  async verify2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            tradeName: true,
            status: true,
            niche: true,
          },
        },
      },
    });
    if (!user || !user.twoFactorSecret) throw new BadRequestException('Autenticação em duas etapas não configurada');

    const isValid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!isValid) throw new UnauthorizedException('Código de verificação inválido ou expirado');

    if (!user.is2faEnabled) {
      await this.prisma.user.update({ where: { id: userId }, data: { is2faEnabled: true } });
    }

    const accessToken = await this.generateAccessToken(user, true);
    const { token: refreshToken } = await this.generateRefreshToken(user.id);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        companyId: user.companyId,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              slug: user.tenant.slug,
              companyName: user.tenant.companyName,
              tradeName: user.tenant.tradeName,
              status: user.tenant.status,
              niche: user.tenant.niche,
            }
          : null,
      },
    };
  }

  async verifyTemp2fa(tempToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }
    if (!payload?.mfa_pending) {
      throw new UnauthorizedException('Token inválido para validação 2FA');
    }
    return this.verify2fa(payload.sub, code);
  }

  async recovery2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { recoveryCodes: true },
    });
    if (!user || !user.is2faEnabled) throw new BadRequestException('Autenticação em duas etapas não está ativada nesta conta');

    let validCode = null;
    for (const rc of user.recoveryCodes) {
      if (!rc.usedAt && (await argon2.verify(rc.codeHash, code))) {
        validCode = rc;
        break;
      }
    }

    if (!validCode) throw new UnauthorizedException('Código de recuperação inválido');

    await this.prisma.recoveryCode.update({
      where: { id: validCode.id },
      data: { usedAt: new Date() },
    });

    const accessToken = await this.generateAccessToken(user, true);
    const { token: refreshToken } = await this.generateRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  private async generateAccessToken(user: any, is2faAuthenticated: boolean = false) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: user.tenant?.slug || null,
      companyId: user.companyId || user.tenantId || null,
      is2faAuthenticated: user.is2faEnabled ? is2faAuthenticated : true,
    };
    return this.jwtService.sign(payload);
  }

  private async generateRefreshToken(userId: string, existingFamilyId?: string) {
    const familyId = existingFamilyId || crypto.randomUUID();
    const secret = crypto.randomBytes(48).toString('hex');
    const tokenHash = await argon2.hash(secret);

    // O id é gerado aqui para compor o token (`<id>.<segredo>`), permitindo
    // que o refresh o encontre por chave primária — sem varrer a tabela.
    const id = crypto.randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash,
        familyId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return { token: `${id}.${secret}`, id };
  }
}
