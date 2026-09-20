import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { CHECK_POLICIES_KEY } from '../decorators/check-policies.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PolicyHandler } from '../casl/policy-handler.interface';

/**
 * Aplica os `@CheckPolicies(...)` declarados nas rotas.
 *
 * Registrado como `APP_GUARD` em `app.module.ts`, logo depois do
 * `JwtAuthGuard` (que popula `request.user`).
 *
 * Três correções em relação à versão anterior, todas necessárias para o guard
 * poder ser ligado globalmente sem quebrar a aplicação:
 *
 * 1. **Rota sem `@CheckPolicies` passa.** A versão antiga devolvia `false`
 *    quando não havia política — como guard global, isso derrubaria toda a
 *    API, inclusive rotas que não pedem permissão nenhuma.
 * 2. **`@Public()` é respeitado.** Sem isso, login, refresh, QR code de mesa e
 *    tablet seriam bloqueados por não terem usuário.
 * 3. **Metadata lida do handler E da classe.** Permite decorar o controller
 *    inteiro, não só cada rota.
 *
 * O guard é fail-closed: com política declarada e sem usuário, nega.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const policyHandlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(CHECK_POLICIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    // Sem política declarada não há o que checar: a autenticação continua
    // sendo responsabilidade do JwtAuthGuard.
    if (policyHandlers.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const ability = this.caslAbilityFactory.createForUser(user);
    const passed = policyHandlers.every((handler) =>
      this.execPolicyHandler(handler, ability),
    );

    if (!passed) {
      throw new ForbiddenException(
        `Acesso negado: o perfil "${user.role ?? 'desconhecido'}" não tem permissão para esta operação`,
      );
    }

    return true;
  }

  private execPolicyHandler(handler: PolicyHandler, ability: unknown): boolean {
    if (typeof handler === 'function') {
      return handler(ability);
    }
    return handler.handle(ability);
  }
}
