import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Cabeçalho que o front do Super Admin envia ao visualizar outra empresa. */
export const VIEWING_SLUG_HEADER = 'x-viewing-slug';

/**
 * Suporte cross-tenant do Super Admin ("Acessar painel da empresa").
 *
 * As rotas `/tenant-app/:slug/*` já isolam pelo slug da URL, mas as rotas do
 * restaurante (`/restaurant/*`) isolam pela empresa DO TOKEN. Sem isto, o
 * suporte via o catálogo da empresa X com as mesas da empresa Y.
 *
 * Quando o cabeçalho vem com slug válido E o usuário é SUPER_ADMIN (papel
 * vindo do banco via JwtStrategy), o contexto da requisição passa a ser a
 * empresa alvo. Qualquer outra combinação passa direto, sem tocar em nada.
 */
@Injectable()
export class ImpersonationInterceptor implements NestInterceptor {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const wanted = String(req?.headers?.[VIEWING_SLUG_HEADER] || '')
      .toLowerCase()
      .trim();

    if (user?.role === 'SUPER_ADMIN' && wanted) {
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: wanted },
          select: { id: true, slug: true },
        });
        if (tenant) {
          user.tenantId = tenant.id;
          user.tenantSlug = tenant.slug;
          user.companyId = tenant.id;
        }
      } catch {
        // Alvo inválido: mantém o contexto original.
      }
    }

    return next.handle();
  }
}
