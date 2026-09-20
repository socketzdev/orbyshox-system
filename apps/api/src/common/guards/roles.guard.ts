import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_ROLES as CANONICAL_PLATFORM_ROLES, type PlatformRole } from '../rbac/roles';

/**
 * Papéis do painel administrativo (plataforma + admin do cliente).
 *
 * Fonte da verdade: `common/rbac/roles.ts`. As listas estavam duplicadas aqui
 * e divergiam do que existe em `User.role` — a validação anterior aceitava
 * `ADMIN`/`SUPPORT`/`VIEWER`, que não existem em uso e teriam bloqueado todos
 * os operadores reais. Centralizar evita que a divergência volte.
 *
 * `TENANT_ADMIN` é o administrador de uma empresa cliente: tem poder total
 * dentro do próprio tenant, mas nenhum acesso a rotas de plataforma.
 */
export type AdminRole = PlatformRole | 'TENANT_ADMIN';

/** Papéis com acesso ao painel de plataforma (equipe interna). */
export const PLATFORM_ROLES: AdminRole[] = [...CANONICAL_PLATFORM_ROLES];

/** Papéis que podem executar operações destrutivas/de alto privilégio. */
export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'DEV'];

export const ROLES_KEY = 'admin_roles';

/**
 * Restringe uma rota aos papéis informados.
 *
 * Uso: `@Roles('SUPER_ADMIN', 'ADMIN')`.
 *
 * O papel vem SEMPRE do usuário recarregado do banco pela JwtStrategy
 * (`validate()` faz `findUnique`), e não do claim do token — assim uma
 * mudança de papel tem efeito imediato e um token antigo não preserva
 * privilégios revogados.
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sem @Roles(...) a rota não exige papel específico: a autenticação
    // continua sendo garantida pelo JwtAuthGuard global.
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!required.includes(user.role as AdminRole)) {
      throw new ForbiddenException(
        `Acesso negado: esta operação exige um dos perfis ${required.join(', ')}`,
      );
    }

    return true;
  }
}
