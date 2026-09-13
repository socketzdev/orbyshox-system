import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

type VerificationKind = 'email' | 'password-reset';

@Injectable()
export class VerificationService {
  private readonly ttlMinutes: Record<VerificationKind, number> = {
    email: 60 * 24,
    'password-reset': 60,
  };

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  private secret() {
    // Segredo derivado, não o de acesso: um token de reset de senha não deve
    // ser aceito como access token nem vice-versa. O valor de assinatura dos
    // JWTs de sessão continua vindo de `resolveJwtSecret`.
    const base = this.config.get<string>('JWT_SECRET') || this.config.get<string>('JWT_ACCESS_SECRET');
    if (!base) {
      throw new Error(
        '[VerificationService] JWT_SECRET ausente — impossível assinar tokens de verificação.',
      );
    }
    return crypto.createHmac('sha256', base).update('verification-v1').digest('hex');
  }

  private async writeToken(kind: VerificationKind, email: string) {
    const jwt = this.jwtService.sign(
      { kind, sub: email.toLowerCase() },
      { secret: this.secret(), expiresIn: `${this.ttlMinutes[kind]}m` },
    );
    return { token: jwt };
  }

  async issueEmailVerification(email: string) {
    return this.writeToken('email', email);
  }

  async issuePasswordReset(email: string) {
    // Constant-time guard: return a fake token when the e-mail is unknown so
    // we do not leak which addresses are registered.
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return { token: this.jwtService.sign({ kind: 'password-reset', sub: email.toLowerCase() }, { secret: this.secret(), expiresIn: '60m' }) };
    return this.writeToken('password-reset', email);
  }

  private async decode(kind: VerificationKind, token: string) {
    try {
      const payload: any = this.jwtService.verify(token, { secret: this.secret() });
      if (payload.kind !== kind) throw new BadRequestException('Token inv\u00e1lido');
      return payload;
    } catch {
      throw new BadRequestException('Token expirado ou inv\u00e1lido');
    }
  }

  async confirmEmail(token: string) {
    const payload = await this.decode('email', token);
    const user = await this.prisma.user.findUnique({ where: { email: payload.sub } });
    if (!user) throw new BadRequestException('Conta n\u00e3o encontrada');
    if (!user.isActive) return { alreadyVerified: true };
    return { alreadyVerified: false };
  }

  async activateEmail(token: string) {
    const payload = await this.decode('email', token);
    const result = await this.prisma.user.updateMany({
      where: { email: payload.sub, isActive: false },
      data: { isActive: true },
    });
    return { activated: result.count > 0 };
  }

  async consumePasswordReset(token: string, password: string) {
    const payload = await this.decode('password-reset', token);
    const user = await this.prisma.user.findUnique({ where: { email: payload.sub } });
    if (!user) throw new UnauthorizedException();
    const hash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { ok: true };
  }

  generateOpaqueToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }
}
