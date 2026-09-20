import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_SITE_CONTENT_BY_NICHE,
  DEFAULT_SITE_THEME,
  SITE_RESERVED_SLUGS,
  SITE_TEMPLATE_CATALOG,
  TENANT_STATUS,
  type ClientSiteNiche,
  type SiteContent,
  type SiteTheme,
} from '@projeto-saas/shared-types';

type SitePayload = {
  niche?: ClientSiteNiche;
  slug?: string;
  templateKey?: string;
  theme?: Partial<SiteTheme>;
  content?: Partial<SiteContent>;
  isPublished?: boolean;
};

const TEMPLATE_BY_NICHE: Record<ClientSiteNiche, string> = {
  RESTAURANT: 'bistro',
  BARBERSHOP: 'studio',
  SUPERMARKET: 'market',
  UNIVERSAL: 'minimal',
};

const NICHE_VALUES = new Set<ClientSiteNiche>(['RESTAURANT', 'BARBERSHOP', 'SUPERMARKET', 'UNIVERSAL']);

function toNiche(value: unknown): ClientSiteNiche {
  if (typeof value === 'string' && NICHE_VALUES.has(value as ClientSiteNiche)) {
    return value as ClientSiteNiche;
  }
  throw new BadRequestException('Nicho inválido');
}

function makeSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function mergeContent(niche: ClientSiteNiche, content?: Partial<SiteContent>): SiteContent {
  const fallback = DEFAULT_SITE_CONTENT_BY_NICHE[niche];
  return {
    ...fallback,
    ...content,
    services: Array.isArray(content?.services) ? content.services : fallback.services,
  };
}

function mergeTheme(theme?: Partial<SiteTheme>): SiteTheme {
  return {
    ...DEFAULT_SITE_THEME,
    ...theme,
  };
}

@Injectable()
export class ClientSitesService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private ensureSuperAdmin(user: any) {
    if (user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Somente o super administrador pode personalizar o site do cliente');
    }
  }

  private getTemplateKey(niche: ClientSiteNiche, requested?: string) {
    const template = SITE_TEMPLATE_CATALOG.find((item) => item.key === requested);
    if (template && (template.niches as readonly string[]).includes(niche)) return template.key;
    return TEMPLATE_BY_NICHE[niche];
  }

  private serialize(tenant: any, site: any, niche: ClientSiteNiche) {
    const theme = mergeTheme(this.parseJson<Partial<SiteTheme>>(site?.theme, {}));
    const content = mergeContent(niche, this.parseJson<Partial<SiteContent>>(site?.content, {}));

    return {
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        niche,
        status: tenant.status,
      },
      site: {
        slug: tenant.slug || '',
        templateKey: site?.templateKey || TEMPLATE_BY_NICHE[niche],
        theme,
        content,
        isPublished: site?.isPublished ?? false,
      },
    };
  }

  private parseJson<T>(value: any, fallback: T): T {
    if (!value) return fallback;
    if (typeof value === 'object') return value as T;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  async getTemplates(niche?: string) {
    const normalizedNiche = niche ? toNiche(niche) : undefined;
    return SITE_TEMPLATE_CATALOG.filter(
      (template) => !normalizedNiche || (template.niches as readonly string[]).includes(normalizedNiche),
    );
  }

  async getForAdmin(tenantId: string, user: any) {
    this.ensureSuperAdmin(user);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { site: true } });
    if (!tenant) throw new NotFoundException('Cliente não encontrado');

    return this.serialize(tenant, tenant.site, tenant.niche as ClientSiteNiche);
  }

  async save(tenantId: string, payload: SitePayload, user: any) {
    this.ensureSuperAdmin(user);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { site: true } });
    if (!tenant) throw new NotFoundException('Cliente não encontrado');

    const niche = payload.niche ? toNiche(payload.niche) : (tenant.niche as ClientSiteNiche);
    const rawSlug = payload.slug?.trim() || tenant.slug || tenant.tradeName || tenant.companyName;
    const slug = makeSlug(rawSlug);
    if (slug.length < 3) throw new BadRequestException('O endereço precisa ter pelo menos 3 caracteres válidos');
    if ((SITE_RESERVED_SLUGS as readonly string[]).includes(slug)) {
      throw new BadRequestException('Este endereço é reservado pela plataforma');
    }

    const duplicate = await this.prisma.tenant.findFirst({ where: { slug, id: { not: tenantId } }, select: { id: true } });
    if (duplicate) throw new ConflictException('Este endereço já está sendo usado por outra empresa');

    const templateKey = this.getTemplateKey(niche, payload.templateKey || tenant.site?.templateKey);
    const theme = mergeTheme({
      ...this.parseJson<Partial<SiteTheme>>(tenant.site?.theme, {}),
      ...(payload.theme || {}),
    });
    const content = mergeContent(niche, {
      ...this.parseJson<Partial<SiteContent>>(tenant.site?.content, {}),
      ...(payload.content || {}),
    });

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { slug, niche },
      include: { site: true },
    });

    const site = await this.prisma.tenantSite.upsert({
      where: { tenantId },
      create: {
        tenantId,
        templateKey,
        theme: JSON.stringify(theme),
        content: JSON.stringify(content),
        isPublished: payload.isPublished ?? true,
      },
      update: {
        templateKey,
        theme: JSON.stringify(theme),
        content: JSON.stringify(content),
        ...(payload.isPublished === undefined ? {} : { isPublished: payload.isPublished }),
      },
    });

    return this.serialize(updatedTenant, site, niche);
  }

  async getPublic(slug: string) {
    const normalizedSlug = makeSlug(slug);
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: normalizedSlug }, include: { site: true } });
    if (!tenant || !tenant.site || !tenant.site.isPublished) throw new NotFoundException('Site não encontrado');
    if (tenant.status === TENANT_STATUS.SUSPENDED || tenant.status === TENANT_STATUS.CANCELED) {
      throw new NotFoundException('Site não encontrado');
    }

    return this.serialize(tenant, tenant.site, tenant.niche as ClientSiteNiche);
  }
}
