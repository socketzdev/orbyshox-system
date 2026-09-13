import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const RESERVED_SLUGS = new Set<string>([
  'admin', 'login', 'logout', 'dashboard', 'tenants', 'plans', 'coupons',
  'billing', 'invoices', 'tickets', 'knowledge', 'staff', 'settings',
  'audit', 'agendar', 'app', 'api', 'public', 'static', 'assets', 'docs',
  'help', 'support', 'about', 'pricing', 'contact', 'terms', 'privacy',
  'coss', 'coss-ui', 'components', 'favicon.ico', 'robots.txt',
  'sitemap.xml', 'manifest.json', 'sw.js', 'service-worker.js',
  'new', 'edit', 'create', 'delete', 'update', 'list', 'search',
  'undefined', 'null', 'true', 'false', 'system', 'root', 'super',
  'master', 'owner', 'demo', 'test', 'dev', 'staging', 'prod',
  'www', 'mail', 'ftp', 'cdn', 'media', 'uploads',
  'site', 'loja', 'carrinho', 'cart', 'checkout', 'order', 'orders',
  'tenant-app', 'super-admin', 'supermarket', 'restaurant', 'barbershop',
]);

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;

export interface SlugValidationResult {
  slug: string;
  available: boolean;
  reason?: string;
}

@Injectable()
export class SlugService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  normalize(input: string): string {
    return (input || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  validateFormat(slug: string): void {
    if (!slug) {
      throw new BadRequestException('Slug é obrigatório');
    }
    if (slug.length < 3) {
      throw new BadRequestException('Slug precisa ter pelo menos 3 caracteres');
    }
    if (slug.length > 48) {
      throw new BadRequestException('Slug pode ter no máximo 48 caracteres');
    }
    if (!SLUG_REGEX.test(slug)) {
      throw new BadRequestException(
        'Slug inválido: use apenas letras minúsculas, números e hífens, começando e terminando com letra ou número',
      );
    }
  }

  isReserved(slug: string): boolean {
    return RESERVED_SLUGS.has(slug);
  }

  async isTaken(slug: string, excludeId?: string): Promise<boolean> {
    const found = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!found) return false;
    return found.id !== excludeId;
  }

  async generateAvailable(preferred: string, excludeId?: string): Promise<string> {
    this.validateFormat(preferred);
    if (this.isReserved(preferred)) {
      throw new BadRequestException(`"${preferred}" é uma palavra reservada do sistema`);
    }
    if (!(await this.isTaken(preferred, excludeId))) {
      return preferred;
    }
    for (let i = 1; i < 50; i++) {
      const candidate = `${preferred}-${i}`;
      if (!(await this.isTaken(candidate, excludeId))) {
        return candidate;
      }
    }
    throw new BadRequestException(`Não foi possível gerar slug a partir de "${preferred}"`);
  }

  async validateForCreate(rawInput: string): Promise<SlugValidationResult> {
    const normalized = this.normalize(rawInput);
    if (!normalized) {
      return { slug: '', available: false, reason: 'Slug vazio após normalização' };
    }
    try {
      this.validateFormat(normalized);
    } catch (err: any) {
      return { slug: normalized, available: false, reason: err.message };
    }
    if (this.isReserved(normalized)) {
      return {
        slug: normalized,
        available: false,
        reason: 'Esta palavra é reservada pelo sistema (rotas internas)',
      };
    }
    const taken = await this.isTaken(normalized);
    return taken
      ? { slug: normalized, available: false, reason: 'Este slug já está em uso' }
      : { slug: normalized, available: true };
  }
}
