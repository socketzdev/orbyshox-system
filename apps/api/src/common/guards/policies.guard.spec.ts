import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliciesGuard } from './policies.guard';
import { CaslAbilityFactory, Action } from '../casl/casl-ability.factory';
import { CHECK_POLICIES_KEY } from '../decorators/check-policies.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { PolicyHandler } from '../casl/policy-handler.interface';

/**
 * O guard passou a ser global (`APP_GUARD`), então estes testes cobrem os
 * casos que, se errados, derrubam a aplicação inteira — rota pública, rota sem
 * política e ausência de usuário.
 */
describe('PoliciesGuard', () => {
  const factory = new CaslAbilityFactory();

  function makeGuard(options: {
    isPublic?: boolean;
    handlers?: PolicyHandler[];
    user?: any;
  }) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) return options.isPublic;
        if (key === CHECK_POLICIES_KEY) return options.handlers;
        return undefined;
      }),
    } as unknown as Reflector;

    const guard = new PoliciesGuard(reflector, factory);

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: options.user }) }),
    } as unknown as ExecutionContext;

    return { guard, context };
  }

  it('libera rota @Public() mesmo sem usuário e com política declarada', async () => {
    const { guard, context } = makeGuard({
      isPublic: true,
      handlers: [(ability) => ability.can(Action.Manage, 'all')],
      user: undefined,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('libera rota sem @CheckPolicies (a autenticação é do JwtAuthGuard)', async () => {
    const { guard, context } = makeGuard({ handlers: [], user: undefined });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('libera quando o usuário tem a permissão exigida', async () => {
    const { guard, context } = makeGuard({
      handlers: [(ability) => ability.can(Action.Delete, 'Supplier')],
      user: { id: 'u-1', role: 'TENANT_ADMIN' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('nega quando o usuário não tem a permissão exigida', async () => {
    const { guard, context } = makeGuard({
      handlers: [(ability) => ability.can(Action.Delete, 'Supplier')],
      user: { id: 'u-2', role: 'CASHIER' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nega quando há política declarada mas não há usuário (fail-closed)', async () => {
    const { guard, context } = makeGuard({
      handlers: [(ability) => ability.can(Action.Read, 'Order')],
      user: undefined,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nega papel desconhecido, sem cair em "todo mundo pode"', async () => {
    const { guard, context } = makeGuard({
      handlers: [(ability) => ability.can(Action.Read, 'Order')],
      user: { id: 'u-3', role: 'ADMIN' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige TODAS as políticas declaradas (E lógico)', async () => {
    const handlers: PolicyHandler[] = [
      (ability) => ability.can(Action.Read, 'Supplier'),
      (ability) => ability.can(Action.Delete, 'Supplier'),
    ];

    const manager = makeGuard({ handlers, user: { id: 'u-4', role: 'STORE_MANAGER' } });
    await expect(manager.guard.canActivate(manager.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const admin = makeGuard({ handlers, user: { id: 'u-5', role: 'TENANT_ADMIN' } });
    await expect(admin.guard.canActivate(admin.context)).resolves.toBe(true);
  });

  it('aceita handler no formato IPolicyHandler (objeto com handle)', async () => {
    const { guard, context } = makeGuard({
      handlers: [{ handle: (ability: any) => ability.can(Action.Read, 'Nfe') }],
      user: { id: 'u-6', role: 'STOCKIST' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('menciona o papel do usuário na mensagem de erro', async () => {
    const { guard, context } = makeGuard({
      handlers: [(ability) => ability.can(Action.Manage, 'Employee')],
      user: { id: 'u-7', role: 'STORE_MANAGER' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(/STORE_MANAGER/);
  });
});
