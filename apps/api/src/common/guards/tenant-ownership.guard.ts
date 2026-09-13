import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class TenantOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    const userId = user?.sub || user?.id;
    if (!user || !userId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // SUPER_ADMIN has cross-tenant access for support/management
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    const slug = req.params?.slug;
    if (!slug) return true;

    const tokenSlug = (user.tenantSlug || user.tenant?.slug || '').toLowerCase();
    const urlSlug = String(slug).toLowerCase();
    if (tokenSlug !== urlSlug) {
      throw new ForbiddenException(
        `Token pertence a outro tenant (${tokenSlug || 'n/a'}), acesso negado a ${urlSlug}`,
      );
    }
    return true;
  }
}
