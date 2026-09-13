import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_STATUS } from '@projeto-saas/shared-types';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { isCreditSale, normalizePaymentMethod } from './payment-method';
import {
  CreateEmployeeInput,
  NICHE_DEFAULT_CATEGORIES,
  NICHE_DEFAULT_PRODUCTS,
  UpdateEmployeeInput,
  UpsertBarberProfileInput,
  calculateBarberCommissions,
} from '@projeto-saas/shared-types';

const EMPLOYEE_SELECT_SAFE = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  position: true,
  isActive: true,
  is2faEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TTL = '15m';

@Injectable()
export class TenantAppService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
  ) {}

  private async getTenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
      include: { site: true },
    });
    if (!tenant) throw new NotFoundException(`Empresa "${slug}" não encontrada`);
    if (tenant.status === TENANT_STATUS.SUSPENDED) {
      throw new UnauthorizedException('Esta empresa está suspensa. Entre em contato com o suporte.');
    }
    if (tenant.status === TENANT_STATUS.CANCELED) {
      throw new UnauthorizedException('Esta empresa foi cancelada.');
    }
    return tenant;
  }

  async getPublicInfo(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const adminUser = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'TENANT_ADMIN' },
      select: { email: true, phone: true },
    });
    return {
      id: tenant.id,
      companyName: tenant.companyName,
      tradeName: tenant.tradeName,
      slug: tenant.slug,
      niche: tenant.niche,
      status: tenant.status,
      adminEmail: adminUser?.email || null,
      adminPhone: adminUser?.phone || null,
      site: tenant.site
        ? {
            templateKey: tenant.site.templateKey,
            theme: tenant.site.theme,
            content: tenant.site.content,
          }
        : null,
    };
  }

  async login(slug: string, loginDto: { email: string; password: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const raw = (loginDto.email || '').trim();
    const cleanPhone = raw.replace(/\D/g, '');
    const withoutCountryCode = cleanPhone.startsWith('55') && cleanPhone.length > 10 ? cleanPhone.slice(2) : cleanPhone;

    const user = await this.prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { tenantId: tenant.id },
              { role: 'SUPER_ADMIN' },
            ],
          },
          {
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
        ],
      },
      // Sem `select`, a linha inteira do User vinha do banco (incluindo
      // passwordHash e twoFactorSecret) e trafegava pelo escopo do serviço.
      select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
    });

    // Mensagem única para conta inexistente E para credenciais inválidas:
    // distinguir os casos permitia enumerar quais contas existem.
    const invalidCredentials = new UnauthorizedException('Credenciais inválidas');

    if (!user) throw invalidCredentials;

    // A verificação da senha roda ANTES da checagem de `isActive` para que o
    // tempo de resposta não revele se a conta existe mas está desativada.
    // Argon2 é caro; sem isso, um atacante distingue os dois estados pelo tempo.
    const isValidPassword = await argon2.verify(user.passwordHash, loginDto.password || '');
    if (!isValidPassword) throw invalidCredentials;

    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada. Procure o administrador da sua empresa.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
      { expiresIn: ACCESS_TTL },
    );

    const refreshToken = await this.issueRefreshToken(user.id, `tenant-${tenant.id}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        slug: tenant.slug,
        niche: tenant.niche,
      },
    };
  }

  async getCurrentUser(slug: string, userId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        OR: [
          { tenantId: tenant.id },
          { role: 'SUPER_ADMIN' },
        ],
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: tenant.id },
    });

    return {
      user,
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        slug: tenant.slug,
        niche: tenant.niche,
        status: tenant.status,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
    };
  }

  /**
   * Conclui o Assistente de Primeiro Acesso (Onboarding Wizard):
   * Grava setupCompleted: true, atualiza preferências e gera as mesas do salão.
   */
  async completeSetup(
    userId: string,
    dto: {
      tradeName?: string;
      phone?: string;
      category?: string;
      tableCount?: number;
      tableCapacity?: number;
      tableCapacities?: number[];
      capacityDistribution?: any;
      enableQrCode?: boolean;
      enableTablet?: boolean;
      enableWaiterCall?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário inválido ou inativo');
    }

    const companyId = user.companyId || user.tenantId;
    if (!companyId) {
      throw new BadRequestException('Usuário não vinculado a uma empresa');
    }

    // 1. Atualizar Company (Branding, Nome, Categoria)
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
    });

    let currentBranding: any = {};
    if (company?.branding) {
      try {
        currentBranding = JSON.parse(company.branding);
      } catch {
        currentBranding = {};
      }
    }

    const updatedBranding = {
      ...currentBranding,
      setupCompleted: true,
      setupCompletedAt: new Date().toISOString(),
      enableQrCode: dto.enableQrCode ?? true,
      enableTablet: dto.enableTablet ?? true,
      enableWaiterCall: dto.enableWaiterCall ?? true,
      tableCapacity: dto.tableCapacity || 4,
      tableCapacities: dto.tableCapacities || undefined,
      capacityDistribution: dto.capacityDistribution || undefined,
      configuredTableCount: dto.tableCount || 0,
    };

    if (company) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: {
          branding: JSON.stringify(updatedBranding),
          ...(dto.tradeName ? { name: dto.tradeName } : {}),
          ...(dto.category ? { category: dto.category } : {}),
        },
      });
    }

    // 2. Atualizar StoreSetting se existir
    if (user.tenantId) {
      const storeSetting = await this.prisma.storeSetting.findUnique({
        where: { tenantId: user.tenantId },
      });
      if (storeSetting) {
        await this.prisma.storeSetting.update({
          where: { tenantId: user.tenantId },
          data: {
            ...(dto.tradeName ? { storeName: dto.tradeName } : {}),
            ...(dto.phone ? { phone: dto.phone } : {}),
          },
        });
      }
    }

    // 3. Criar mesas em lote se tableCount > 0
    let createdTables: any[] = [];
    if (dto.tableCount && dto.tableCount > 0) {
      const count = Math.min(Math.max(1, dto.tableCount), 100);
      const defaultCapacity = Math.max(1, dto.tableCapacity || 4);
      const capacitiesArray = Array.isArray(dto.tableCapacities) && dto.tableCapacities.length > 0
        ? dto.tableCapacities
        : null;

      for (let i = 1; i <= count; i++) {
        const capacity = capacitiesArray && capacitiesArray[i - 1]
          ? Math.max(1, Number(capacitiesArray[i - 1]))
          : defaultCapacity;

        const rawToken = crypto.randomBytes(24).toString('hex');
        const qrTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const label = `Mesa ${String(i).padStart(2, '0')}`;

        const table = await this.prisma.table.upsert({
          where: { companyId_number: { companyId, number: i } },
          create: {
            companyId,
            number: i,
            label,
            capacity,
            status: 'FREE',
            qrTokenHash,
          },
          update: {
            label,
            capacity,
          },
        });

        createdTables.push({
          id: table.id,
          number: table.number,
          label: table.label,
          qrToken: rawToken,
        });
      }
    }

    return {
      success: true,
      message: 'Configuração inicial concluída com sucesso!',
      setupCompleted: true,
      tablesCount: createdTables.length,
      tables: createdTables,
    };
  }

  async universalAppLogin(loginDto: { email: string; password: string }) {
    const raw = (loginDto.email || '').trim();
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
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        tenantId: true,
        companyId: true,
      },
    });

    const invalidCredentials = new UnauthorizedException('Credenciais inválidas');
    if (!user) throw invalidCredentials;

    const isValidPassword = await argon2.verify(user.passwordHash, loginDto.password || '');
    if (!isValidPassword) throw invalidCredentials;

    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada. Procure o administrador.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    let tenant: any = null;
    if (user.tenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
    }

    const companyIdToFind = user.companyId || user.tenantId;
    let company: any = null;
    if (companyIdToFind) {
      company = await this.prisma.company.findFirst({
        where: { id: companyIdToFind },
      });
    }

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant?.id || null,
        tenantSlug: tenant?.slug || null,
        companyId: company?.id || tenant?.id || null,
      },
      { expiresIn: ACCESS_TTL },
    );

    const refreshToken = await this.issueRefreshToken(user.id, `app-${user.id}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            companyName: tenant.companyName,
            tradeName: tenant.tradeName,
            slug: tenant.slug,
            niche: tenant.niche,
            status: tenant.status,
          }
        : company
        ? {
            id: company.id,
            companyName: company.name,
            tradeName: company.name,
            slug: company.slug || company.id,
            niche: (company.category as any) || 'RESTAURANT',
            status: 'ACTIVE',
          }
        : null,
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
    };
  }

  async getUniversalMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        companyId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    let tenant: any = null;
    if (user.tenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
    }

    const companyIdToFind = user.companyId || user.tenantId;
    let company: any = null;
    if (companyIdToFind) {
      company = await this.prisma.company.findFirst({
        where: { id: companyIdToFind },
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            companyName: tenant.companyName,
            tradeName: tenant.tradeName,
            slug: tenant.slug,
            niche: tenant.niche,
            status: tenant.status,
          }
        : company
        ? {
            id: company.id,
            companyName: company.name,
            tradeName: company.name,
            slug: company.slug || company.id,
            niche: (company.category as any) || 'RESTAURANT',
            status: 'ACTIVE',
          }
        : null,
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
    };
  }

  /**
   * Emite um refresh token no formato `<refreshId>.<segredo>`.
   *
   * Antes o token era só um segredo opaco, e o refresh precisava varrer a
   * tabela e rodar `argon2.verify` em cada linha até achar (ou desistir).
   * Argon2 é caro por design — 25 hashes por requisição derrubam a CPU sob
   * concorrência moderada. Prefixar com o id transforma a busca em consulta
   * por chave primária: uma única verificação de hash por refresh.
   */
  private async issueRefreshToken(userId: string, familyId: string) {
    const secret = crypto.randomBytes(48).toString('hex');
    const tokenHash = await argon2.hash(secret);
    const id = crypto.randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return `${id}.${secret}`;
  }

  async logoutSession(slug: string, refreshToken?: string) {
    if (!refreshToken) return;
    const [refreshId] = refreshToken.split('.');
    if (!refreshId) return;

    const tenant = await this.getTenantBySlug(slug).catch(() => null);
    if (!tenant) return;

    // Revoga apenas o token apresentado, e sempre dentro do tenant informado —
    // um slug diferente não pode derrubar a sessão de outro inquilino.
    await this.prisma.refreshToken.updateMany({
      where: {
        id: refreshId,
        revokedAt: null,
        user: { tenantId: tenant.id },
      },
      data: { revokedAt: new Date() },
    });
  }

  async refreshSession(slug: string, refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token ausente.');
    const tenant = await this.getTenantBySlug(slug);

    const [refreshId, secret] = refreshToken.split('.');
    if (!refreshId || !secret) throw new UnauthorizedException('Refresh token inválido.');

    const candidate = await this.prisma.refreshToken.findUnique({
      where: { id: refreshId },
      include: { user: { select: { id: true, tenantId: true } } },
    });

    // Defesa em profundidade: o token tem de pertencer a um usuário do tenant
    // do slug informado. Sem isso, um token válido de outro inquilino seria
    // aceito ao trocar o slug na URL.
    const belongsToTenant =
      candidate?.user &&
      (candidate.user.tenantId === tenant.id || (await this.isSuperAdmin(candidate.user.id)));

    if (!candidate || !belongsToTenant) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    let hashMatches = false;
    try {
      hashMatches = await argon2.verify(candidate.tokenHash, secret);
    } catch {
      hashMatches = false;
    }
    if (!hashMatches) throw new UnauthorizedException('Refresh token inválido.');

    // Reuso de um token já rotacionado: possível roubo. Revogamos a família
    // inteira do usuário, encerrando todas as sessões derivadas.
    if (candidate.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: candidate.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão comprometida. Faça login novamente.');
    }

    if (candidate.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: candidate.userId },
      select: EMPLOYEE_SELECT_SAFE,
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Sessão inválida.');

    // Também barramos tenant suspenso/cancelado: antes só o usuário era
    // revalidado, então um inquilino bloqueado continuava renovando sessão.
    if (tenant.status === TENANT_STATUS.SUSPENDED || tenant.status === TENANT_STATUS.CANCELED) {
      throw new UnauthorizedException('Conta da empresa inativa. Verifique a situação do plano.');
    }

    const newAccessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
      { expiresIn: ACCESS_TTL },
    );

    const newRefreshToken = await this.issueRefreshToken(user.id, `tenant-${tenant.id}`);

    await this.prisma.refreshToken.update({
      where: { id: candidate.id },
      data: { revokedAt: new Date() },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        slug: tenant.slug,
        niche: tenant.niche,
      },
    };
  }

  /** O SUPER_ADMIN tem acesso cross-tenant (suporte); os demais não. */
  private async isSuperAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return u?.role === 'SUPER_ADMIN';
  }

  async getDashboard(slug: string) {
    const tenant = await this.getTenantBySlug(slug);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [todayOrders, lowStockProducts, totalCustomers, unreadNotifications, recentOrders] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            tenantId: tenant.id,
            createdAt: { gte: startOfDay },
            status: { not: 'CANCELED' },
          },
          select: { totalCents: true, paymentMethod: true },
        }),
        this.prisma.product.findMany({
          where: {
            tenantId: tenant.id,
            isActive: true,
            stockQuantity: { lte: 5 },
          },
          take: 8,
          include: { category: true },
        }),
        this.prisma.customer.count({ where: { tenantId: tenant.id } }),
        this.prisma.automationNotification.findMany({
          where: { tenantId: tenant.id, isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.order.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { customer: true, items: { include: { product: true } } },
        }),
      ]);

    const totalSalesCents = todayOrders.reduce((acc, order) => acc + order.totalCents, 0);

    return {
      kpis: {
        totalSalesCents,
        orderCount: todayOrders.length,
        lowStockCount: lowStockProducts.length,
        totalCustomers,
      },
      lowStockProducts,
      unreadNotifications,
      recentOrders,
    };
  }

  async getSupermarketDashboard(slug: string) {
    const tenant = await this.getTenantBySlug(slug);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [todayOrders, monthOrders, products, categories, recentOrders, receiveToday, payToday, expiringSoon] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { tenantId: tenant.id, createdAt: { gte: startOfDay }, status: { not: 'CANCELED' } },
          select: { id: true, totalCents: true, createdAt: true, items: { select: { quantity: true, unitPrice: true, totalPrice: true, productId: true } } },
        }),
        this.prisma.order.findMany({
          where: { tenantId: tenant.id, createdAt: { gte: startOfMonth } },
          select: { totalCents: true },
        }),
        this.prisma.product.findMany({ where: { tenantId: tenant.id, isActive: true }, include: { category: true } }),
        this.prisma.productCategory.findMany({ where: { tenantId: tenant.id } }),
        this.prisma.order.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { customer: true, items: { include: { product: true } } },
        }),
        this.prisma.billReceivable.findMany({
          where: { tenantId: tenant.id, status: 'PENDING', dueDate: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) } },
          select: { amountCents: true },
        }),
        this.prisma.billPayable.findMany({
          where: { tenantId: tenant.id, status: 'PENDING', dueDate: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) } },
          select: { amountCents: true },
        }),
        this.prisma.stockBatch.findMany({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            quantity: { gt: 0 },
            expiryDate: { gte: now, lte: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { expiryDate: 'asc' },
          take: 6,
          include: { product: true },
        }),
      ]);

    const salesToday = todayOrders.reduce((a, o) => a + o.totalCents, 0);
    const salesMonth = monthOrders.reduce((a, o) => a + o.totalCents, 0);

    const productsSoldToday = todayOrders.reduce(
      (a, o) => a + o.items.reduce((x, i) => x + i.quantity, 0),
      0,
    );

    const avgTicket = todayOrders.length ? salesToday / todayOrders.length : 0;

    // Lucro bruto estimado do dia (diferença entre venda e custo)
    const grossProfitToday = todayOrders.reduce((acc, o) => {
      const productIds = [...new Set(o.items.map((i) => i.productId as string))];
      const costByProduct = new Map<string, number>();
      for (const p of products) costByProduct.set(p.id, p.costPriceCents);
      const costSum = o.items.reduce((c, i) => c + (costByProduct.get(i.productId as string) || 0) * i.quantity, 0);
      return acc + (o.totalCents - costSum);
    }, 0);

    const lowStock = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minStockAlert);
    const zeroStock = products.filter((p) => p.stockQuantity <= 0);

    // Vendas dos últimos 14 dias (agrupadas por dia)
    const orders14d = await this.prisma.order.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: start14d }, status: { not: 'CANCELED' } },
      select: { totalCents: true, createdAt: true },
    });
    const dailySales = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(startOfDay.getTime() - i * 24 * 60 * 60 * 1000);
      dailySales.set(d.toISOString().slice(0, 10), 0);
    }
    for (const o of orders14d) {
      const key = o.createdAt.toISOString().slice(0, 10);
      dailySales.set(key, (dailySales.get(key) || 0) + o.totalCents);
    }
    const salesLast14Days = [...dailySales.entries()].map(([date, cents]) => ({ date, totalCents: cents }));

    // Vendas por categoria (últimos 30 dias)
    const orders30d = await this.prisma.order.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, status: { not: 'CANCELED' } },
      include: { items: { select: { productId: true, totalPrice: true } } },
    });
    const salesByCat = new Map<string, number>();
    for (const o of orders30d) {
      for (const i of o.items) {
        const p = products.find((x) => x.id === i.productId);
        const catName = p?.category?.name || 'Sem categoria';
        salesByCat.set(catName, (salesByCat.get(catName) || 0) + i.totalPrice);
      }
    }
    const salesByCategory = [...salesByCat.entries()].map(([category, totalCents]) => ({ category, totalCents }));

    // Top produtos (30 dias)
    const soldQty = new Map<string, number>();
    const soldRevenue = new Map<string, number>();
    for (const o of orders30d) {
      for (const i of o.items) {
        soldQty.set(i.productId, (soldQty.get(i.productId) || 0) + 1);
      }
    }
    const topProducts = products
      .filter((p) => soldQty.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, quantity: soldQty.get(p.id) || 0 }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const alerts = [];
    for (const p of lowStock) alerts.push({ type: 'LOW_STOCK', message: `${p.name} está com estoque baixo (${p.stockQuantity} ${p.unit})` });
    for (const p of zeroStock) alerts.push({ type: 'ZERO_STOCK', message: `${p.name} está zerado` });

    return {
      kpis: {
        salesTodayCents: salesToday,
        salesMonthCents: salesMonth,
        orderCount: todayOrders.length,
        avgTicketCents: Math.round(avgTicket),
        grossProfitTodayCents: grossProfitToday,
        productsSoldToday,
        lowStockCount: lowStock.length,
        zeroStockCount: zeroStock.length,
        receivableTodayCents: receiveToday.reduce((a, b) => a + b.amountCents, 0),
        payableTodayCents: payToday.reduce((a, b) => a + b.amountCents, 0),
        productCount: products.length,
      },
      salesLast14Days,
      salesByCategory,
      topProducts,
      alerts,
      expiringSoon,
      recentOrders,
    };
  }

  async getProducts(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const [categories, products] = await Promise.all([
      this.prisma.productCategory.findMany({
        where: { tenantId: tenant.id },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { tenantId: tenant.id },
        include: {
          category: true,
          barcodes: true,
          recipeItems: { include: { ingredient: true } },
          modifierGroups: {
            include: { items: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { categories, products };
  }

  async createCategory(slug: string, data: { name: string; color?: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;

    return this.prisma.productCategory.create({
      data: {
        tenantId: tenant.id,
        companyId,
        name: data.name.trim(),
        color: data.color || '#f59e0b',
        active: true,
      },
    });
  }

  async createProduct(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;

    const modifierGroupsCreate = (data.modifierGroups && Array.isArray(data.modifierGroups))
      ? data.modifierGroups
          .filter((g: any) => g && g.name && String(g.name).trim().length > 0)
          .map((group: any) => ({
            name: String(group.name).trim(),
            minSelectable: Number(group.minSelectable ?? (group.isRequired ? 1 : 0)),
            maxSelectable: Number(group.maxSelectable ?? 1),
            isRequired: Boolean(group.isRequired),
            items: {
              create: (group.items || [])
                .filter((i: any) => i && i.name && String(i.name).trim().length > 0)
                .map((item: any) => ({
                  name: String(item.name).trim(),
                  priceCents: Math.round(Number(item.priceCents || 0)),
                })),
            },
          }))
      : undefined;

    return this.prisma.product.create({
      data: {
        tenantId: tenant.id,
        companyId,
        categoryId: data.categoryId || null,
        name: data.name.trim(),
        description: data.description || null,
        sku: data.sku || null,
        barcode: data.barcode || null,
        brand: data.brand || null,
        ncm: data.ncm || null,
        cest: data.cest || null,
        origin: Number(data.origin) || 0,
        csosn: data.csosn || '102',
        cstIcms: data.cstIcms || null,
        cstPis: data.cstPis || '01',
        cstCofins: data.cstCofins || '01',
        cfopDefault: data.cfopDefault || '5102',
        packQuantity: Number(data.packQuantity) || 1,
        imageUrl: data.imageUrl || null,
        salePriceCents: Number(data.salePriceCents) || 0,
        costPriceCents: Number(data.costPriceCents) || 0,
        stockQuantity: Number(data.stockQuantity) || 0,
        minStockAlert: Number(data.minStockAlert) || 5,
        unit: data.unit || 'UN',
        isActive: data.isActive ?? true,
        isRecipe: Boolean(data.isRecipe),
        modifierGroups: modifierGroupsCreate && modifierGroupsCreate.length > 0 ? { create: modifierGroupsCreate } : undefined,
      },
      include: {
        category: true,
        barcodes: true,
        modifierGroups: {
          include: { items: true },
        },
      },
    });
  }

  async updateProduct(slug: string, productId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.product.update({
      where: { id: productId, tenantId: tenant.id },
      data: {
        categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
        name: data.name !== undefined ? data.name : undefined,
        description: data.description !== undefined ? data.description : undefined,
        sku: data.sku !== undefined ? data.sku : undefined,
        barcode: data.barcode !== undefined ? data.barcode : undefined,
        brand: data.brand !== undefined ? data.brand : undefined,
        ncm: data.ncm !== undefined ? data.ncm : undefined,
        cest: data.cest !== undefined ? data.cest : undefined,
        origin: data.origin !== undefined ? Number(data.origin) : undefined,
        csosn: data.csosn !== undefined ? data.csosn : undefined,
        cstIcms: data.cstIcms !== undefined ? data.cstIcms : undefined,
        cstPis: data.cstPis !== undefined ? data.cstPis : undefined,
        cstCofins: data.cstCofins !== undefined ? data.cstCofins : undefined,
        cfopDefault: data.cfopDefault !== undefined ? data.cfopDefault : undefined,
        packQuantity: data.packQuantity !== undefined ? Number(data.packQuantity) : undefined,
        imageUrl: data.imageUrl !== undefined ? data.imageUrl : undefined,
        salePriceCents: data.salePriceCents !== undefined ? Number(data.salePriceCents) : undefined,
        costPriceCents: data.costPriceCents !== undefined ? Number(data.costPriceCents) : undefined,
        stockQuantity: data.stockQuantity !== undefined ? Number(data.stockQuantity) : undefined,
        minStockAlert: data.minStockAlert !== undefined ? Number(data.minStockAlert) : undefined,
        unit: data.unit !== undefined ? data.unit : undefined,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
        isRecipe: data.isRecipe !== undefined ? Boolean(data.isRecipe) : undefined,
      },
      include: { category: true, barcodes: true },
    });
  }

  async createOrder(slug: string, orderInput: any) {
    const tenant = await this.getTenantBySlug(slug);

    if (!orderInput.items || orderInput.items.length === 0) {
      throw new BadRequestException('A venda deve conter pelo menos 1 item');
    }

    return this.prisma.$transaction(async (tx) => {
      // Get highest order number
      const lastOrder = await tx.order.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber || 100) + 1;

      let subtotalCents = 0;
      const preparedItems = [];
      const stockAlerts = [];

      for (const item of orderInput.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId, tenantId: tenant.id },
          include: { recipeItems: true },
        });

        if (!product) throw new NotFoundException(`Produto ${item.productId} não encontrado`);

        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice || product.salePriceCents);
        const totalPrice = Math.round(unitPrice * quantity);
        subtotalCents += totalPrice;

        preparedItems.push({
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice,
        });

        // Decrement stock or recipe ingredients
        if (product.isRecipe && product.recipeItems.length > 0) {
          for (const ing of product.recipeItems) {
            const needed = Number(ing.quantityNeeded) * quantity;
            const updatedIng = await tx.product.update({
              where: { id: ing.ingredientId },
              data: { stockQuantity: { decrement: needed } },
            });
            if (Number(updatedIng.stockQuantity) <= Number(updatedIng.minStockAlert)) {
              stockAlerts.push(updatedIng);
            }
          }
        } else {
          const updatedProduct = await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } },
          });
          if (Number(updatedProduct.stockQuantity) <= Number(updatedProduct.minStockAlert)) {
            stockAlerts.push(updatedProduct);
          }

          // Registrar movimentação de estoque
          await tx.stockMovement.create({
            data: {
              tenantId: tenant.id,
              productId: product.id,
              type: 'SALE_POS',
              quantity: -quantity,
              balanceAfter: Number(updatedProduct.stockQuantity),
              notes: `Venda #${orderNumber}`,
            },
          });
        }
      }

      const discountCents = Number(orderInput.discountCents) || 0;
      const totalCents = Math.max(0, subtotalCents - discountCents);

      // Normalizado: sem isso, "Dinheiro" era gravado como CASH por um PDV e
      // DINHEIRO por outro, e o relatório (que agrupa pelo valor cru) mostrava
      // o mesmo método em duas linhas.
      const normalizedPaymentMethod = normalizePaymentMethod(
        orderInput.paymentMethod,
        'PIX',
      );

      const createdOrder = await tx.order.create({
        data: {
          tenantId: tenant.id,
          orderNumber,
          customerId: orderInput.customerId || null,
          status: 'COMPLETED',
          paymentMethod: normalizedPaymentMethod,
          subtotalCents,
          discountCents,
          totalCents,
          notes: orderInput.notes || null,
          items: {
            create: preparedItems,
          },
        },
        include: { items: { include: { product: true } }, customer: true },
      });

      // Update customer stats if customer is attached
      if (orderInput.customerId) {
        const isFiado = isCreditSale(normalizedPaymentMethod);
        await tx.customer.update({
          where: { id: orderInput.customerId },
          data: {
            orderCount: { increment: 1 },
            totalSpent: { increment: totalCents },
            loyaltyPoints: { increment: Math.max(1, Math.floor(totalCents / 100)) },
            currentDebtCents: isFiado ? { increment: totalCents } : undefined,
            lastOrderAt: new Date(),
          },
        });

        if (isFiado) {
          await tx.billReceivable.create({
            data: {
              tenantId: tenant.id,
              customerId: orderInput.customerId,
              orderId: createdOrder.id,
              description: `Fiado - Venda #${orderNumber}`,
              amountCents: totalCents,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              type: 'FIADO',
              status: 'PENDING',
            },
          });
        }
      }

      // Generate automation notifications for stock alerts
      for (const lowProduct of stockAlerts) {
        await tx.automationNotification.create({
          data: {
            tenantId: tenant.id,
            type: 'STOCK_ALERT',
            title: `Alerta de Estoque: ${lowProduct.name}`,
            content: `O item "${lowProduct.name}" atingiu o estoque mínimo de segurança (${lowProduct.stockQuantity} ${lowProduct.unit} restantes). Recomendamos repor.`,
          },
        });
      }

      return createdOrder;
    });
  }

  async getOrders(slug: string, limit = 50) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.order.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
  }

  async getCustomers(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.customer.findMany({
      where: { tenantId: tenant.id },
      orderBy: { totalSpent: 'desc' },
    });
  }

  async createCustomer(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        document: data.document || null,
        notes: data.notes || null,
        creditLimitCents: Number(data.creditLimitCents) || 0,
        currentDebtCents: Number(data.currentDebtCents) || 0,
        loyaltyPoints: Number(data.loyaltyPoints) || 0,
      },
    });
  }

  async updateCustomer(slug: string, customerId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.customer.update({
      where: { id: customerId, tenantId: tenant.id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        email: data.email !== undefined ? data.email : undefined,
        document: data.document !== undefined ? data.document : undefined,
        notes: data.notes !== undefined ? data.notes : undefined,
        creditLimitCents: data.creditLimitCents !== undefined ? Number(data.creditLimitCents) : undefined,
        currentDebtCents: data.currentDebtCents !== undefined ? Number(data.currentDebtCents) : undefined,
        loyaltyPoints: data.loyaltyPoints !== undefined ? Number(data.loyaltyPoints) : undefined,
      },
    });
  }

  async getCashRegister(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      include: { openedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { openedAt: 'desc' },
    });

    if (!openRegister) return { isOpen: false, register: null };

    // Get orders and cash movements since opened
    const [ordersSince, movements] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: openRegister.openedAt },
          status: { not: 'CANCELED' },
        },
        select: { totalCents: true, paymentMethod: true },
      }),
      this.prisma.cashMovement.findMany({
        where: {
          tenantId: tenant.id,
          cashRegisterId: openRegister.id,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalSales = ordersSince.reduce((sum, o) => sum + o.totalCents, 0);
    const byMethod: Record<string, number> = {};
    for (const o of ordersSince) {
      byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] || 0) + o.totalCents;
    }

    const totalSangriaCents = movements
      .filter((m) => m.type === 'SANGRIA')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const totalSuprimentoCents = movements
      .filter((m) => m.type === 'SUPRIMENTO')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const cashSalesCents = (byMethod['CASH'] || 0) + (byMethod['DINHEIRO'] || 0);
    const cashInDrawerCents = Math.max(
      0,
      openRegister.initialBalanceCents + cashSalesCents - totalSangriaCents + totalSuprimentoCents,
    );

    return {
      isOpen: true,
      register: openRegister,
      metrics: {
        orderCount: ordersSince.length,
        totalSalesCents: totalSales,
        byMethod,
        totalSangriaCents,
        totalSuprimentoCents,
        cashInDrawerCents,
      },
      movements,
    };
  }

  async addCashMovement(slug: string, userId: string, data: { type: string; amountCents: number; reason: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    if (!openRegister) {
      throw new BadRequestException('Nenhum caixa aberto para registrar sangria ou suprimento');
    }

    if (!['SANGRIA', 'SUPRIMENTO'].includes(data.type)) {
      throw new BadRequestException('Tipo inválido. Use SANGRIA ou SUPRIMENTO');
    }

    const amountCents = Number(data.amountCents) || 0;
    if (amountCents <= 0) {
      throw new BadRequestException('Valor deve ser maior que zero');
    }

    return this.prisma.cashMovement.create({
      data: {
        tenantId: tenant.id,
        cashRegisterId: openRegister.id,
        type: data.type,
        amountCents,
        reason: data.reason || (data.type === 'SANGRIA' ? 'Sangria de caixa' : 'Reforço de troco'),
        operatorId: userId,
      },
    });
  }

  async openCashRegister(slug: string, userId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    const existing = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
    });
    if (existing) throw new ConflictException('Já existe um caixa aberto no momento');

    return this.prisma.cashRegister.create({
      data: {
        tenantId: tenant.id,
        openedById: userId,
        initialBalanceCents: Number(data.initialBalanceCents) || 0,
        notes: data.notes || null,
        status: 'OPEN',
      },
      include: { openedBy: { select: { id: true, name: true } } },
    });
  }

  async closeCashRegister(slug: string, userId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    if (!openRegister) throw new BadRequestException('Nenhum caixa está aberto para ser fechado');

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: openRegister.openedAt },
        status: { not: 'CANCELED' },
      },
      select: { totalCents: true },
    });

    const totalSales = orders.reduce((sum, o) => sum + o.totalCents, 0);
    const finalBalanceCents = openRegister.initialBalanceCents + totalSales;
    const actualBalanceCents = Number(data.actualBalanceCents) || finalBalanceCents;

    const closed = await this.prisma.cashRegister.update({
      where: { id: openRegister.id },
      data: {
        closedAt: new Date(),
        status: 'CLOSED',
        finalBalanceCents,
        actualBalanceCents,
        notes: data.notes || null,
      },
    });

    // Create automation notification for DRE / Closing report
    await this.prisma.automationNotification.create({
      data: {
        tenantId: tenant.id,
        type: 'DRE_REPORT',
        title: 'Fechamento de Caixa Concluído',
        content: `Caixa fechado com ${orders.length} vendas totalizando R$ ${(totalSales / 100).toFixed(2)}. Fundo inicial: R$ ${(openRegister.initialBalanceCents / 100).toFixed(2)}.`,
      },
    });

    return closed;
  }

  async getAutomations(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const [rules, notifications] = await Promise.all([
      this.prisma.automationRule.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.automationNotification.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    return { rules, notifications };
  }

  async markNotificationRead(slug: string, notificationId: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.automationNotification.update({
      where: { id: notificationId, tenantId: tenant.id },
      data: { isRead: true },
    });
  }

  async getAppointments(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.appointment.findMany({
      where: { tenantId: tenant.id },
      include: { customer: true, staff: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async createAppointment(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    let customerId = data.customerId;
    if (!customerId) {
      const customerName = data.customerName || data.name || 'Cliente';
      const customerPhone = data.customerPhone || data.phone || null;
      let cust = await this.prisma.customer.findFirst({
        where: { tenantId: tenant.id, phone: customerPhone || undefined, name: customerName },
      });
      if (!cust) {
        cust = await this.prisma.customer.create({
          data: {
            tenantId: tenant.id,
            name: customerName,
            phone: customerPhone,
          },
        });
      }
      customerId = cust.id;
    }

    let staffId = data.staffId;
    if (!staffId && data.staffName) {
      const matched = await this.prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          isActive: true,
          name: String(data.staffName).trim(),
        },
      });
      if (matched) staffId = matched.id;
    }
    if (!staffId) {
      const firstStaff = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      staffId = firstStaff?.id;
    }

    if (!staffId) {
      const fallbackStaff = await this.prisma.user.create({
        data: {
          tenantId: tenant.id,
          name: 'Barbeiro da Casa',
          email: `barbeiro@${tenant.slug || 'barbearia'}.com`,
          passwordHash: 'placeholder',
          role: 'TENANT_EMPLOYEE',
        },
      });
      staffId = fallbackStaff.id;
    }

    return this.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        customerId,
        staffId,
        serviceName: data.serviceName || 'Corte de Cabelo',
        priceCents: Number(data.priceCents) || 0,
        scheduledAt: new Date(data.scheduledAt || Date.now()),
        durationMin: Number(data.durationMin) || 30,
        status: data.status || 'CONFIRMED',
      },
      include: { customer: true, staff: { select: { id: true, name: true } } },
    });
  }

  async updateAppointmentStatus(
    slug: string,
    appointmentId: string,
    status: string,
    paymentMethod?: string,
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const data: any = { status };
    if (status === 'COMPLETED' && paymentMethod) {
      data.paymentMethod = paymentMethod;
    }
    return this.prisma.appointment.update({
      where: { id: appointmentId, tenantId: tenant.id },
      data,
      include: { customer: true, staff: { select: { id: true, name: true } } },
    });
  }

  // ─── Funcionários (Equipe do Painel do Cliente) ────────────────────────────

  private async getTenantUserContext(slug: string, userId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.tenantId !== tenant.id && user.role !== 'SUPER_ADMIN')) {
      throw new ForbiddenException('Usuário não pertence a esta empresa');
    }
    return { tenant, user };
  }

  async getEmployees(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const employees = await this.prisma.user.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: EMPLOYEE_SELECT_SAFE,
    });
    return { employees };
  }

  async getEmployee(slug: string, employeeId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
      select: EMPLOYEE_SELECT_SAFE,
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');
    return employee;
  }

  async createEmployee(slug: string, data: CreateEmployeeInput) {
    const tenant = await this.getTenantBySlug(slug);
    const email = data.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe um usuário com esse e-mail');
    }

    let normalizedPhone: string | null = null;
    if (data.phone) {
      const digits = data.phone.replace(/\D/g, '');
      if (digits) {
        const without55 = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
        normalizedPhone = `+55${without55}`;
        const phoneClash = await this.prisma.user.findFirst({
          where: {
            OR: [
              { phone: normalizedPhone },
              { phone: digits },
              { phone: without55 },
              { phone: data.phone.trim() },
            ],
          },
        });
        if (phoneClash) {
          throw new ConflictException('Já existe um usuário cadastrado com esse telefone');
        }
      }
    }

    const company = await this.prisma.company.findUnique({ where: { slug: tenant.slug } });
    const passwordHash = await argon2.hash(data.password);

    return this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        companyId: company?.id || null,
        email,
        name: data.name.trim(),
        role: data.role,
        phone: normalizedPhone,
        position: data.position?.trim() || null,
        isActive: data.isActive ?? true,
        passwordHash,
      },
      select: EMPLOYEE_SELECT_SAFE,
    });
  }

  async updateEmployee(slug: string, employeeId: string, data: UpdateEmployeeInput) {
    const tenant = await this.getTenantBySlug(slug);

    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    if (data.email) {
      const newEmail = data.email.trim().toLowerCase();
      if (newEmail !== employee.email) {
        const clash = await this.prisma.user.findUnique({ where: { email: newEmail } });
        if (clash && clash.id !== employee.id) {
          throw new ConflictException('Já existe um usuário com esse e-mail');
        }
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
    if (data.role !== undefined) updateData.role = data.role;
    if (data.position !== undefined) updateData.position = data.position?.trim() || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) updateData.passwordHash = await argon2.hash(data.password);

    if (data.phone !== undefined) {
      if (!data.phone) {
        updateData.phone = null;
      } else {
        const digits = data.phone.replace(/\D/g, '');
        if (digits) {
          const without55 = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
          const normalized = `+55${without55}`;
          const phoneClash = await this.prisma.user.findFirst({
            where: {
              id: { not: employeeId },
              OR: [
                { phone: normalized },
                { phone: digits },
                { phone: without55 },
                { phone: data.phone.trim() },
              ],
            },
          });
          if (phoneClash) {
            throw new ConflictException('Já existe um usuário cadastrado com esse telefone');
          }
          updateData.phone = normalized;
        } else {
          updateData.phone = null;
        }
      }
    }

    return this.prisma.user.update({
      where: { id: employeeId },
      data: updateData,
      select: EMPLOYEE_SELECT_SAFE,
    });
  }

  async setEmployeeActive(slug: string, employeeId: string, isActive: boolean) {
    const tenant = await this.getTenantBySlug(slug);
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');
    return this.prisma.user.update({
      where: { id: employeeId },
      data: { isActive },
      select: EMPLOYEE_SELECT_SAFE,
    });
  }

  async deleteEmployee(slug: string, employeeId: string, actorId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    if (employee.id === actorId) {
      throw new BadRequestException('Você não pode remover o seu próprio usuário');
    }

    if (employee.role === 'TENANT_ADMIN') {
      const otherAdmins = await this.prisma.user.count({
        where: {
          tenantId: tenant.id,
          role: 'TENANT_ADMIN',
          isActive: true,
          id: { not: employee.id },
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException(
          'Não é possível remover o único administrador ativo da empresa',
        );
      }
    }

    await this.prisma.user.delete({ where: { id: employeeId } });
    return { ok: true, id: employeeId };
  }

  // ─── Barbeiros (Equipe + Comissões Reais) ─────────────────────────────────

  private async computeBarberMetrics(
    tenantId: string,
    userId: string,
    serviceRate: number,
    productRate: number,
    releaseOnFiadoPaid: boolean,
  ) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [completedMonth, pendingMonth, recentAppointments] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          staffId: userId,
          status: 'COMPLETED',
          scheduledAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
          id: true,
          priceCents: true,
          paymentMethod: true,
          scheduledAt: true,
          serviceName: true,
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          staffId: userId,
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          scheduledAt: { gte: monthStart, lt: monthEnd },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          staffId: userId,
          status: 'COMPLETED',
        },
        select: {
          id: true,
          priceCents: true,
          scheduledAt: true,
          serviceName: true,
        },
        orderBy: { scheduledAt: 'desc' },
        take: 5,
      }),
    ]);

    const sales = completedMonth.map((apt) => {
      const isFiado = (apt.paymentMethod || '').toUpperCase() === 'ON_CREDIT';
      return {
        type: 'SERVICE' as const,
        amount: apt.priceCents / 100,
        isFiado,
        isFiadoPaid: !isFiado,
      };
    });

    const commission = calculateBarberCommissions(sales, {
      serviceCommissionRate: serviceRate / 100,
      productCommissionRate: productRate / 100,
      releaseCommissionOnFiadoPaidOnly: releaseOnFiadoPaid,
    });

    return {
      commission,
      cutsCount: completedMonth.length,
      pendingAppointmentsCount: pendingMonth,
      recentAppointments: recentAppointments.map((apt) => ({
        id: apt.id,
        serviceName: apt.serviceName,
        scheduledAt: apt.scheduledAt,
        priceCents: apt.priceCents,
      })),
    };
  }

  private async enrichBarbers(tenantId: string, users: any[]) {
    return Promise.all(
      users.map(async (user) => {
        const profile = user.barberProfile;
        const serviceRate = profile?.serviceCommissionPct ?? 50;
        const productRate = profile?.productCommissionPct ?? 15;
        const releaseOnFiadoPaid = (profile?.commissionOnFiado ?? 'UPON_PAYMENT') === 'UPON_PAYMENT';
        const monthlyGoalCents = profile?.monthlyGoalCents ?? 0;

        const metrics = await this.computeBarberMetrics(
          tenantId,
          user.id,
          serviceRate,
          productRate,
          releaseOnFiadoPaid,
        );

        const revenueCents = Math.round(metrics.commission.totalRevenue * 100);
        const commissionCents = Math.round(metrics.commission.totalCommissionPaid * 100);
        const pendingCommissionCents = Math.round(metrics.commission.pendingFiadoCommission * 100);
        const progressPct =
          monthlyGoalCents > 0
            ? Math.min(100, Math.round((revenueCents / monthlyGoalCents) * 100))
            : 0;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          position: user.position,
          isActive: user.isActive,
          profile: profile
            ? {
                nickname: profile.nickname,
                specialty: profile.specialty,
                avatarColor: profile.avatarColor,
                serviceCommissionPct: serviceRate,
                productCommissionPct: productRate,
                commissionOnFiado: profile.commissionOnFiado,
                monthlyGoalCents,
                workingHoursLabel: profile.workingHoursLabel,
                status: profile.status,
              }
            : null,
          metrics: {
            cutsCount: metrics.cutsCount,
            pendingAppointmentsCount: metrics.pendingAppointmentsCount,
            currentMonthRevenueCents: revenueCents,
            currentMonthCommissionCents: commissionCents,
            pendingCommissionCents,
            serviceRevenueCents: Math.round(metrics.commission.serviceRevenue * 100),
            productRevenueCents: Math.round(metrics.commission.productRevenue * 100),
            progressPct,
            recentAppointments: metrics.recentAppointments,
          },
        };
      }),
    );
  }

  async getBarbers(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const users = await this.prisma.user.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { name: 'asc' },
      include: { barberProfile: true },
    });
    const barbers = await this.enrichBarbers(tenant.id, users);

    const totals = barbers.reduce(
      (acc, b) => ({
        revenueCents: acc.revenueCents + b.metrics.currentMonthRevenueCents,
        commissionCents: acc.commissionCents + b.metrics.currentMonthCommissionCents,
        cutsCount: acc.cutsCount + b.metrics.cutsCount,
        pendingCommissionCents:
          acc.pendingCommissionCents + b.metrics.pendingCommissionCents,
      }),
      { revenueCents: 0, commissionCents: 0, cutsCount: 0, pendingCommissionCents: 0 },
    );

    const houseProfitCents = totals.revenueCents - totals.commissionCents;
    const averageCommissionRate =
      totals.revenueCents > 0
        ? Number(((totals.commissionCents / totals.revenueCents) * 100).toFixed(1))
        : 0;

    return {
      barbers,
      totals: {
        ...totals,
        houseProfitCents,
        averageCommissionRate,
      },
    };
  }

  async getBarber(slug: string, barberId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findFirst({
      where: { id: barberId, tenantId: tenant.id },
      include: { barberProfile: true },
    });
    if (!user) throw new NotFoundException('Profissional não encontrado');
    const [barber] = await this.enrichBarbers(tenant.id, [user]);
    return barber;
  }

  async upsertBarberProfile(
    slug: string,
    barberId: string,
    data: UpsertBarberProfileInput,
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findFirst({
      where: { id: barberId, tenantId: tenant.id },
    });
    if (!user) throw new NotFoundException('Profissional não encontrado');

    const existing = await this.prisma.barberProfile.findUnique({
      where: { userId: barberId },
    });

    const payload = {
      nickname: data.nickname ?? null,
      specialty: data.specialty ?? null,
      avatarColor: data.avatarColor ?? existing?.avatarColor ?? '#10b981',
      serviceCommissionPct: data.serviceCommissionPct,
      productCommissionPct: data.productCommissionPct,
      commissionOnFiado: data.commissionOnFiado,
      monthlyGoalCents: data.monthlyGoalCents,
      workingHoursLabel: data.workingHoursLabel ?? null,
      status: data.status,
    };

    const profile = existing
      ? await this.prisma.barberProfile.update({
          where: { userId: barberId },
          data: payload,
        })
      : await this.prisma.barberProfile.create({
          data: { userId: barberId, ...payload },
        });

    return profile;
  }

  // ─── Supermercado: Estoque & Inventário ────────────────────────────────────

  async adjustStock(slug: string, productId: string, data: { newQuantity: number; reason: string }, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const product = await this.prisma.product.findUnique({
      where: { id: productId, tenantId: tenant.id },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const newQty = Number(data.newQuantity);
    const diff = newQty - Number(product.stockQuantity);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: newQty },
    });

    await this.prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId,
        type: 'ADJUSTMENT',
        quantity: diff,
        balanceAfter: newQty,
        notes: data.reason || 'Ajuste manual de estoque',
        operatorId: operatorId || null,
      },
    });

    return updated;
  }

  async getStockOverview(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    const totalProducts = products.length;
    let totalStockValueCents = 0;
    let totalSaleValueCents = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const p of products) {
      const qty = Number(p.stockQuantity);
      const cost = Number(p.costPriceCents) || 0;
      const sale = Number(p.salePriceCents) || 0;
      totalStockValueCents += Math.round(qty * cost);
      totalSaleValueCents += Math.round(qty * sale);
      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= Number(p.minStockAlert)) {
        lowStockCount++;
      }
    }

    return {
      products,
      summary: {
        totalProducts,
        totalStockValueCents,
        totalSaleValueCents,
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  async getStockLosses(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.stockLoss.findMany({
      where: { tenantId: tenant.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createStockLoss(
    slug: string,
    reportedById: string | undefined,
    data: { productId: string; quantity: number; reason: string; costCents?: number; notes?: string },
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const product = await this.prisma.product.findUnique({
      where: { id: data.productId, tenantId: tenant.id },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const qty = Number(data.quantity);
    const costCents = data.costCents ?? Math.round((Number(product.costPriceCents) || 0) * qty);

    const updatedProduct = await this.prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: { decrement: qty } },
    });

    const stockLoss = await this.prisma.stockLoss.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        quantity: qty,
        reason: data.reason,
        costCents,
        notes: data.notes || null,
        reportedById: reportedById || null,
      },
      include: { product: true },
    });

    await this.prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        type: 'LOSS_AVARIA',
        quantity: -qty,
        balanceAfter: Number(updatedProduct.stockQuantity),
        notes: `Perda (${data.reason}): ${data.notes || 'Sem observação'}`,
        referenceId: stockLoss.id,
        operatorId: reportedById || null,
      },
    });

    return stockLoss;
  }

  async getStockMovements(slug: string, productId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.stockMovement.findMany({
      where: {
        tenantId: tenant.id,
        ...(productId ? { productId } : {}),
      },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getInventoryAudits(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.inventoryAudit.findMany({
      where: { tenantId: tenant.id },
      include: {
        items: {
          include: { product: true },
          orderBy: { diffQty: 'asc' },
        },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async createInventoryAudit(slug: string, notes?: string) {
    const tenant = await this.getTenantBySlug(slug);

    // Se já houver um aberto, reaproveita
    const openAudit = await this.prisma.inventoryAudit.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      include: { items: { include: { product: true } } },
    });
    if (openAudit) return openAudit;

    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id, isActive: true },
    });

    const audit = await this.prisma.inventoryAudit.create({
      data: {
        tenantId: tenant.id,
        status: 'OPEN',
        notes: notes || 'Inventário Geral de Estoque',
        items: {
          create: products.map((p) => ({
            productId: p.id,
            systemQty: Number(p.stockQuantity),
            countedQty: Number(p.stockQuantity),
            diffQty: 0,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    return audit;
  }

  async countInventoryItem(slug: string, auditId: string, data: { productId: string; countedQty: number }) {
    const tenant = await this.getTenantBySlug(slug);
    const audit = await this.prisma.inventoryAudit.findFirst({
      where: { id: auditId, tenantId: tenant.id, status: 'OPEN' },
    });
    if (!audit) throw new BadRequestException('Inventário não está aberto ou não foi encontrado');

    const item = await this.prisma.inventoryAuditItem.findFirst({
      where: { inventoryId: audit.id, productId: data.productId },
    });
    if (!item) throw new NotFoundException('Item não encontrado neste inventário');

    const counted = Number(data.countedQty);
    const diff = counted - Number(item.systemQty);

    return this.prisma.inventoryAuditItem.update({
      where: { id: item.id },
      data: {
        countedQty: counted,
        diffQty: diff,
      },
      include: { product: true },
    });
  }

  async reconcileInventory(slug: string, auditId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const audit = await this.prisma.inventoryAudit.findFirst({
      where: { id: auditId, tenantId: tenant.id, status: 'OPEN' },
      include: { items: true },
    });
    if (!audit) throw new BadRequestException('Inventário não encontrado ou já concluído');

    return this.prisma.$transaction(async (tx) => {
      for (const item of audit.items) {
        if (item.diffQty !== 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: item.countedQty },
          });

          await tx.stockMovement.create({
            data: {
              tenantId: tenant.id,
              productId: item.productId,
              type: 'ADJUSTMENT',
              quantity: item.diffQty,
              balanceAfter: item.countedQty,
              referenceId: audit.id,
              notes: `Conciliação de Inventário #${audit.id.slice(0, 8)}`,
              operatorId: operatorId || null,
            },
          });
        }
      }

      return tx.inventoryAudit.update({
        where: { id: audit.id },
        data: {
          status: 'COMPLETED',
          closedAt: new Date(),
        },
        include: { items: { include: { product: true } } },
      });
    });
  }

  // ─── Supermercado: Financeiro (Contas a Pagar & Receber) ────────────────────

  async getBillsPayable(slug: string, status?: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.billPayable.findMany({
      where: {
        tenantId: tenant.id,
        ...(status ? { status } : {}),
      },
      include: { supplier: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createBillPayable(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.billPayable.create({
      data: {
        tenantId: tenant.id,
        supplierId: data.supplierId || null,
        description: data.description,
        category: data.category || 'FORNECEDOR',
        amountCents: Number(data.amountCents) || 0,
        dueDate: new Date(data.dueDate),
        notes: data.notes || null,
        status: 'PENDING',
      },
      include: { supplier: true },
    });
  }

  async payBill(slug: string, billId: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.billPayable.update({
      where: { id: billId, tenantId: tenant.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  }

  async deleteBillPayable(slug: string, billId: string) {
    const tenant = await this.getTenantBySlug(slug);
    await this.prisma.billPayable.delete({
      where: { id: billId, tenantId: tenant.id },
    });
    return { ok: true, id: billId };
  }

  async getBillsReceivable(slug: string, status?: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.billReceivable.findMany({
      where: {
        tenantId: tenant.id,
        ...(status ? { status } : {}),
      },
      include: { customer: true, order: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createBillReceivable(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const amountCents = Number(data.amountCents) || 0;
    const bill = await this.prisma.billReceivable.create({
      data: {
        tenantId: tenant.id,
        customerId: data.customerId || null,
        orderId: data.orderId || null,
        description: data.description,
        amountCents,
        dueDate: new Date(data.dueDate),
        type: data.type || 'FIADO',
        notes: data.notes || null,
        status: 'PENDING',
      },
      include: { customer: true },
    });

    if (data.customerId) {
      await this.prisma.customer.update({
        where: { id: data.customerId },
        data: { currentDebtCents: { increment: amountCents } },
      });
    }

    return bill;
  }

  async receiveBill(slug: string, billId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const bill = await this.prisma.billReceivable.findFirst({
      where: { id: billId, tenantId: tenant.id },
    });
    if (!bill) throw new NotFoundException('Conta a receber não encontrada');

    const updated = await this.prisma.billReceivable.update({
      where: { id: billId },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
      },
    });

    if (bill.customerId) {
      await this.prisma.customer.update({
        where: { id: bill.customerId },
        data: { currentDebtCents: { decrement: bill.amountCents } },
      });
    }

    return updated;
  }

  async deleteBillReceivable(slug: string, billId: string) {
    const tenant = await this.getTenantBySlug(slug);
    await this.prisma.billReceivable.delete({
      where: { id: billId, tenantId: tenant.id },
    });
    return { ok: true, id: billId };
  }

  async getCashFlow(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [orders, receivedBills, paidBills, pendingReceivables, pendingPayables] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId: tenant.id, createdAt: { gte: startOfMonth }, status: { not: 'CANCELED' } },
        select: { totalCents: true, createdAt: true, paymentMethod: true },
      }),
      this.prisma.billReceivable.findMany({
        where: { tenantId: tenant.id, status: 'RECEIVED', receivedAt: { gte: startOfMonth } },
        select: { amountCents: true, receivedAt: true },
      }),
      this.prisma.billPayable.findMany({
        where: { tenantId: tenant.id, status: 'PAID', paidAt: { gte: startOfMonth } },
        select: { amountCents: true, paidAt: true, category: true },
      }),
      this.prisma.billReceivable.findMany({
        where: { tenantId: tenant.id, status: 'PENDING' },
        select: { amountCents: true, dueDate: true },
      }),
      this.prisma.billPayable.findMany({
        where: { tenantId: tenant.id, status: 'PENDING' },
        select: { amountCents: true, dueDate: true },
      }),
    ]);

    const isFiado = (method: string) => ['FIADO', 'ON_CREDIT'].includes((method || '').toUpperCase());

    // Vendas à vista entram no caixa imediatamente.
    const immediateSalesTotalCents = orders
      .filter((o) => !isFiado(o.paymentMethod))
      .reduce((sum, o) => sum + o.totalCents, 0);

    const fiadoSalesTotalCents = orders
      .filter((o) => isFiado(o.paymentMethod))
      .reduce((sum, o) => sum + o.totalCents, 0);

    // Vendas a prazo (fiado) só geram entrada de caixa real quando o título é liquidado (RECEIVED):
    const receivedBillsTotalCents = receivedBills.reduce((sum, b) => sum + b.amountCents, 0);
    const totalInflowCents = immediateSalesTotalCents + receivedBillsTotalCents;

    const paidBillsTotalCents = paidBills.reduce((sum, b) => sum + b.amountCents, 0);
    const totalOutflowCents = paidBillsTotalCents;

    const netBalanceCents = totalInflowCents - totalOutflowCents;
    const pendingInflowCents = pendingReceivables.reduce((sum, b) => sum + b.amountCents, 0);
    const pendingOutflowCents = pendingPayables.reduce((sum, b) => sum + b.amountCents, 0);

    return {
      totalInflowCents,
      totalOutflowCents,
      netBalanceCents,
      pendingInflowCents,
      pendingOutflowCents,
      projectedBalanceCents: netBalanceCents + pendingInflowCents - pendingOutflowCents,
      immediateSalesTotalCents,
      fiadoSalesTotalCents,
      recentTransactions: [
        ...orders.slice(-10).map((o) => ({
          type: 'INFLOW',
          description: isFiado(o.paymentMethod) ? `Venda a Prazo (Fiado)` : `Venda no PDV (${o.paymentMethod})`,
          amountCents: o.totalCents,
          date: o.createdAt,
        })),
        ...paidBills.slice(-10).map((b) => ({
          type: 'OUTFLOW',
          description: `Pagamento: ${b.category}`,
          amountCents: b.amountCents,
          date: b.paidAt,
        })),
      ].sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime()),
    };
  }

  // ─── Supermercado: Operação PDV & Devoluções ───────────────────────────────

  async authorizeManager(slug: string, pin: string) {
    const tenant = await this.getTenantBySlug(slug);
    const setting = await this.prisma.storeSetting.findUnique({
      where: { tenantId: tenant.id },
    });
    const validPin = setting?.managerPin || '1234';

    if (pin === validPin) {
      return { authorized: true };
    }
    throw new UnauthorizedException('PIN de gerente inválido');
  }

  async cancelOrder(slug: string, orderId: string, reason: string, authorizedById?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId: tenant.id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Venda não encontrada');
    if (order.status === 'CANCELED') throw new BadRequestException('Esta venda já está cancelada');

    return this.prisma.$transaction(async (tx) => {
      // Devolver itens ao estoque
      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: item.productId,
            type: 'RETURN',
            quantity: item.quantity,
            balanceAfter: Number(updated.stockQuantity),
            referenceId: order.id,
            notes: `Cancelamento de Venda #${order.orderNumber}: ${reason}`,
            operatorId: authorizedById || null,
          },
        });
      }

      // Estornar dados do cliente
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            orderCount: { decrement: 1 },
            totalSpent: { decrement: order.totalCents },
          },
        });

        // Se era fiado pendente, cancela
        const receivable = await tx.billReceivable.findFirst({
          where: { orderId: order.id, status: 'PENDING' },
        });
        if (receivable) {
          await tx.billReceivable.update({
            where: { id: receivable.id },
            data: { status: 'CANCELED' },
          });
          await tx.customer.update({
            where: { id: order.customerId },
            data: { currentDebtCents: { decrement: receivable.amountCents } },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELED',
          notes: `${order.notes || ''} [CANCELADA: ${reason}]`,
        },
      });
    });
  }

  async getOrderReturns(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.orderReturn.findMany({
      where: { tenantId: tenant.id },
      include: { order: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createOrderReturn(slug: string, data: any, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const orderReturn = await this.prisma.orderReturn.create({
      data: {
        tenantId: tenant.id,
        orderId: data.orderId || null,
        customerId: data.customerId || null,
        reason: data.reason,
        refundMethod: data.refundMethod || 'CREDIT',
        totalRefundCents: Number(data.totalRefundCents) || 0,
        itemsSummary: data.itemsSummary || null,
        authorizedById: operatorId || null,
      },
      include: { order: true, customer: true },
    });

    // Se itens foram devolvidos ao estoque
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.productId && item.quantity > 0) {
          const updated = await this.prisma.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: Number(item.quantity) } },
          });

          await this.prisma.stockMovement.create({
            data: {
              tenantId: tenant.id,
              productId: item.productId,
              type: 'RETURN',
              quantity: Number(item.quantity),
              balanceAfter: Number(updated.stockQuantity),
              referenceId: orderReturn.id,
              notes: `Devolução PDV: ${data.reason}`,
              operatorId: operatorId || null,
            },
          });
        }
      }
    }

    return orderReturn;
  }

  // ─── Supermercado: Relatórios Consolidados ─────────────────────────────────

  async getReportsSummary(slug: string, period = 'today') {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'yesterday') {
      startDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [orders, losses, products] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: startDate },
          status: { not: 'CANCELED' },
        },
        include: { items: { include: { product: true } } },
      }),
      this.prisma.stockLoss.findMany({
        where: { tenantId: tenant.id, createdAt: { gte: startDate } },
      }),
      this.prisma.product.findMany({
        where: { tenantId: tenant.id },
      }),
    ]);

    const totalSalesCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const totalOrdersCount = orders.length;
    const averageTicketCents = totalOrdersCount > 0 ? Math.round(totalSalesCents / totalOrdersCount) : 0;

    // Por forma de pagamento
    const paymentMethods: Record<string, { count: number; totalCents: number }> = {};
    for (const o of orders) {
      const pm = o.paymentMethod || 'OTHER';
      if (!paymentMethods[pm]) paymentMethods[pm] = { count: 0, totalCents: 0 };
      paymentMethods[pm].count++;
      paymentMethods[pm].totalCents += o.totalCents;
    }

    // Ranking de produtos
    const productStats: Record<string, { name: string; quantity: number; revenueCents: number; costCents: number }> = {};
    for (const o of orders) {
      for (const item of o.items) {
        const pid = item.productId;
        if (!productStats[pid]) {
          productStats[pid] = {
            name: item.product?.name || 'Item',
            quantity: 0,
            revenueCents: 0,
            costCents: 0,
          };
        }
        productStats[pid].quantity += item.quantity;
        productStats[pid].revenueCents += item.totalPrice;
        productStats[pid].costCents += Math.round((Number(item.product?.costPriceCents) || 0) * item.quantity);
      }
    }

    const sortedProducts = Object.values(productStats).sort((a, b) => b.revenueCents - a.revenueCents);
    const topProducts = sortedProducts.slice(0, 10);
    const bottomProducts = Object.values(productStats).sort((a, b) => a.quantity - b.quantity).slice(0, 5);

    const totalCostCents = sortedProducts.reduce((s, p) => s + p.costCents, 0);
    const grossProfitCents = totalSalesCents - totalCostCents;
    const profitMarginPct = totalSalesCents > 0 ? Number(((grossProfitCents / totalSalesCents) * 100).toFixed(1)) : 0;
    const totalLossesCents = losses.reduce((s, l) => s + l.costCents, 0);

    return {
      period,
      totalSalesCents,
      totalOrdersCount,
      averageTicketCents,
      grossProfitCents,
      profitMarginPct,
      totalLossesCents,
      paymentMethods,
      topProducts,
      bottomProducts,
    };
  }

  // ─── Supermercado: Configurações da Loja ───────────────────────────────────

  async getStoreSettings(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    let settings = await this.prisma.storeSetting.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!settings) {
      settings = await this.prisma.storeSetting.create({
        data: {
          tenantId: tenant.id,
          storeName: tenant.companyName,
          legalName: tenant.companyName,
          cnpj: tenant.cnpj || null,
          thermalPrinter: '80mm',
          fiscalType: 'SIMPLES_NACIONAL',
          nfceEnvironment: 'HOMOLOGATION',
          maxCashierDiscount: 10,
          managerPin: '1234',
          enabledPaymentMethods: 'DINHEIRO,PIX,CARTAO_DEBITO,CARTAO_CREDITO,VALE,FIADO',
        },
      });
    }

    return settings;
  }

  async updateStoreSettings(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.storeSetting.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        storeName: data.storeName ?? tenant.companyName,
        legalName: data.legalName ?? tenant.companyName,
        cnpj: data.cnpj ?? tenant.cnpj,
        stateRegistration: data.stateRegistration ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        thermalPrinter: data.thermalPrinter ?? '80mm',
        fiscalType: data.fiscalType ?? 'SIMPLES_NACIONAL',
        nfceEnvironment: data.nfceEnvironment ?? 'HOMOLOGATION',
        nfceCscId: data.nfceCscId ?? null,
        nfceCscToken: data.nfceCscToken ?? null,
        maxCashierDiscount: data.maxCashierDiscount !== undefined ? Number(data.maxCashierDiscount) : 10,
        managerPin: data.managerPin ?? '1234',
        enabledPaymentMethods: data.enabledPaymentMethods ?? 'DINHEIRO,PIX,CARTAO_DEBITO,CARTAO_CREDITO,VALE,FIADO',
      },
      update: {
        storeName: data.storeName,
        legalName: data.legalName,
        cnpj: data.cnpj,
        stateRegistration: data.stateRegistration,
        address: data.address,
        phone: data.phone,
        thermalPrinter: data.thermalPrinter,
        fiscalType: data.fiscalType,
        nfceEnvironment: data.nfceEnvironment,
        nfceCscId: data.nfceCscId,
        nfceCscToken: data.nfceCscToken,
        maxCashierDiscount: data.maxCashierDiscount !== undefined ? Number(data.maxCashierDiscount) : undefined,
        managerPin: data.managerPin,
        enabledPaymentMethods: data.enabledPaymentMethods,
      },
    });
  }

  // ─── Central de Personalização & Modais de Pedido ─────────────────────────

  async getModifierGroups(slug: string, productId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const where: any = {
      product: {
        OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
      },
    };
    if (productId) {
      where.productId = productId;
    }

    const groups = await this.prisma.productModifierGroup.findMany({
      where,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        product: {
          select: { id: true, name: true, categoryId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { groups };
  }

  async createModifierGroup(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    let targetProductId = data.productId;
    if (targetProductId) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: targetProductId,
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      });
      if (!product) {
        throw new NotFoundException('Produto de destino não encontrado');
      }
    } else {
      const anyProduct = await this.prisma.product.findFirst({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      });
      if (!anyProduct) {
        throw new BadRequestException('Cadastre pelo menos um produto no cardápio antes de configurar grupos de personalização');
      }
      targetProductId = anyProduct.id;
    }

    const group = await this.prisma.productModifierGroup.create({
      data: {
        productId: targetProductId,
        name: data.name.trim(),
        minSelectable: Number(data.minSelectable ?? 0),
        maxSelectable: Number(data.maxSelectable ?? 1),
        isRequired: Boolean(data.isRequired),
        items: Array.isArray(data.items) && data.items.length > 0 ? {
          create: data.items.map((item: any) => ({
            name: item.name.trim(),
            priceCents: Math.round(Number(item.priceCents || 0)),
          })),
        } : undefined,
      },
      include: {
        items: true,
        product: { select: { id: true, name: true } },
      },
    });

    if (Array.isArray(data.additionalProductIds) && data.additionalProductIds.length > 0) {
      for (const extraProdId of data.additionalProductIds) {
        if (extraProdId !== targetProductId) {
          await this.prisma.productModifierGroup.create({
            data: {
              productId: extraProdId,
              name: data.name.trim(),
              minSelectable: Number(data.minSelectable ?? 0),
              maxSelectable: Number(data.maxSelectable ?? 1),
              isRequired: Boolean(data.isRequired),
              items: Array.isArray(data.items) && data.items.length > 0 ? {
                create: data.items.map((item: any) => ({
                  name: item.name.trim(),
                  priceCents: Math.round(Number(item.priceCents || 0)),
                })),
              } : undefined,
            },
          });
        }
      }
    }

    return group;
  }

  async updateModifierGroup(slug: string, groupId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const existing = await this.prisma.productModifierGroup.findFirst({
      where: {
        id: groupId,
        product: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Grupo de modificadores não encontrado');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.minSelectable !== undefined) updateData.minSelectable = Number(data.minSelectable);
    if (data.maxSelectable !== undefined) updateData.maxSelectable = Number(data.maxSelectable);
    if (data.isRequired !== undefined) updateData.isRequired = Boolean(data.isRequired);
    if (data.productId !== undefined) updateData.productId = data.productId;

    return this.prisma.productModifierGroup.update({
      where: { id: groupId },
      data: updateData,
      include: {
        items: true,
        product: { select: { id: true, name: true } },
      },
    });
  }

  async deleteModifierGroup(slug: string, groupId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const existing = await this.prisma.productModifierGroup.findFirst({
      where: {
        id: groupId,
        product: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Grupo de modificadores não encontrado');
    }

    await this.prisma.productModifierGroup.delete({
      where: { id: groupId },
    });

    return { success: true };
  }

  async addModifierItem(slug: string, groupId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const group = await this.prisma.productModifierGroup.findFirst({
      where: {
        id: groupId,
        product: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo de modificadores não encontrado');
    }

    return this.prisma.productModifierItem.create({
      data: {
        groupId: group.id,
        name: data.name.trim(),
        priceCents: Math.round(Number(data.priceCents || 0)),
      },
    });
  }

  async deleteModifierItem(slug: string, groupId: string, itemId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const item = await this.prisma.productModifierItem.findFirst({
      where: {
        id: itemId,
        groupId,
        group: {
          product: {
            OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Opção de modificador não encontrada');
    }

    await this.prisma.productModifierItem.delete({
      where: { id: itemId },
    });

    return { success: true };
  }

  // ─── Módulo de Notas de Compra (ERP & Gastro) ─────────────────────────────

  private async getEntityIds(slug: string) {
    const s = slug.toLowerCase();
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: s },
    });
    const company = await this.prisma.company.findFirst({
      where: { slug: s },
    });
    if (!tenant && !company) {
      throw new NotFoundException(`Estabelecimento "${slug}" não encontrado`);
    }
    return {
      tenantId: tenant?.id || null,
      companyId: company?.id || null,
    };
  }

  async listPurchaseNotes(slug: string, status?: string) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const notes = await this.prisma.purchaseNote.findMany({
      where: {
        OR: orConditions,
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((note) => {
      const total = note.items.length;
      const bought = note.items.filter((i) => i.status === 'BOUGHT').length;
      const notBought = note.items.filter((i) => i.status === 'NOT_BOUGHT').length;
      const pending = note.items.filter((i) => i.status === 'PENDING').length;

      return {
        ...note,
        stats: {
          total,
          bought,
          notBought,
          pending,
        },
      };
    });
  }

  async getPurchaseNote(slug: string, id: string) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: {
        id,
        OR: orConditions,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Nota de compra não encontrada');
    }

    const total = note.items.length;
    const bought = note.items.filter((i) => i.status === 'BOUGHT').length;
    const notBought = note.items.filter((i) => i.status === 'NOT_BOUGHT').length;
    const pending = note.items.filter((i) => i.status === 'PENDING').length;

    return {
      ...note,
      stats: {
        total,
        bought,
        notBought,
        pending,
      },
    };
  }

  async createPurchaseNote(slug: string, data: any) {
    const { tenantId, companyId } = await this.getEntityIds(slug);

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('A nota deve conter pelo menos um item');
    }

    const validItems = data.items
      .filter((i: any) => i && i.itemName && String(i.itemName).trim().length > 0)
      .map((i: any) => ({
        itemName: String(i.itemName).trim(),
        quantity: String(i.quantity || '1 un').trim(),
        status: 'PENDING',
      }));

    if (validItems.length === 0) {
      throw new BadRequestException('Adicione itens válidos com nome e quantidade');
    }

    const note = await this.prisma.purchaseNote.create({
      data: {
        tenantId,
        companyId,
        title: (data.title || 'Nota de Compra').trim(),
        createdByName: data.createdByName ? String(data.createdByName).trim() : 'Cozinha',
        notes: data.notes ? String(data.notes).trim() : null,
        status: 'PENDING',
        items: {
          create: validItems,
        },
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const total = note.items.length;
    return {
      ...note,
      stats: {
        total,
        bought: 0,
        notBought: 0,
        pending: total,
      },
    };
  }

  async updatePurchaseNoteStatus(slug: string, id: string, data: any) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id, OR: orConditions },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    const updateData: any = {};
    if (data.status) {
      const allowed = ['PENDING', 'IN_PROGRESS', 'CONFIRMED', 'PARTIAL'];
      if (!allowed.includes(data.status)) {
        throw new BadRequestException(`Status inválido: ${data.status}`);
      }
      updateData.status = data.status;
    }
    if (data.buyerName !== undefined) {
      updateData.buyerName = data.buyerName ? String(data.buyerName).trim() : null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes ? String(data.notes).trim() : null;
    }

    const updated = await this.prisma.purchaseNote.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const total = updated.items.length;
    const bought = updated.items.filter((i) => i.status === 'BOUGHT').length;
    const notBought = updated.items.filter((i) => i.status === 'NOT_BOUGHT').length;
    const pending = updated.items.filter((i) => i.status === 'PENDING').length;

    return {
      ...updated,
      stats: {
        total,
        bought,
        notBought,
        pending,
      },
    };
  }

  async updatePurchaseNoteItem(slug: string, noteId: string, itemId: string, data: any) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id: noteId, OR: orConditions },
      include: { items: true },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    const existingItem = note.items.find((i) => i.id === itemId);
    if (!existingItem) throw new NotFoundException('Item da nota não encontrado');

    const allowedStatuses = ['PENDING', 'BOUGHT', 'NOT_BOUGHT'];
    if (data.status && !allowedStatuses.includes(data.status)) {
      throw new BadRequestException(`Status de item inválido: ${data.status}`);
    }

    // Atualiza o item
    await this.prisma.purchaseNoteItem.update({
      where: { id: itemId },
      data: {
        status: data.status,
        buyerNotes: data.buyerNotes !== undefined ? (data.buyerNotes ? String(data.buyerNotes).trim() : null) : existingItem.buyerNotes,
      },
    });

    // Recalcula o status geral da nota
    const allItems = await this.prisma.purchaseNoteItem.findMany({
      where: { purchaseNoteId: noteId },
    });

    const total = allItems.length;
    const bought = allItems.filter((i) => i.status === 'BOUGHT').length;
    const notBought = allItems.filter((i) => i.status === 'NOT_BOUGHT').length;
    const pending = allItems.filter((i) => i.status === 'PENDING').length;

    let computedStatus = note.status;

    if (total > 0) {
      if (pending === 0) {
        if (notBought === 0 && bought === total) {
          computedStatus = 'CONFIRMED'; // 🟢 Confirmada (100% comprado)
        } else {
          computedStatus = 'PARTIAL'; // 🟠 Parcial (algum item não foi comprado)
        }
      } else {
        if (bought > 0 || notBought > 0) {
          computedStatus = 'IN_PROGRESS'; // 🔵 Em compra (responsável em andamento)
        }
      }
    }

    const updatedNote = await this.prisma.purchaseNote.update({
      where: { id: noteId },
      data: {
        status: computedStatus,
        buyerName: data.buyerName ? String(data.buyerName).trim() : note.buyerName,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      ...updatedNote,
      stats: {
        total,
        bought,
        notBought,
        pending,
      },
    };
  }

  async addItemsToPurchaseNote(slug: string, noteId: string, items: Array<{ itemName: string; quantity: string }>) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id: noteId, OR: orConditions },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    const validItems = items
      .filter((i) => i && i.itemName && String(i.itemName).trim().length > 0)
      .map((i) => ({
        purchaseNoteId: noteId,
        itemName: String(i.itemName).trim(),
        quantity: String(i.quantity || '1 un').trim(),
        status: 'PENDING',
      }));

    if (validItems.length > 0) {
      await this.prisma.purchaseNoteItem.createMany({
        data: validItems,
      });
    }

    return this.getPurchaseNote(slug, noteId);
  }

  async deletePurchaseNote(slug: string, id: string) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id, OR: orConditions },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    await this.prisma.purchaseNote.delete({
      where: { id },
    });

    return { success: true };
  }
}

