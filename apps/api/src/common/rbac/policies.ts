import { Action } from '../casl/casl-ability.factory';
import type { PolicyHandler } from '../casl/policy-handler.interface';
import type { Subject } from './subjects';

/**
 * Fábricas de política para uso com `@CheckPolicies(...)`.
 *
 * Existem para que a intenção fique legível no controller:
 *
 *   @CheckPolicies(canDelete('Supplier'))
 *   @Delete(':id')
 *   remove(...) { ... }
 *
 * Em vez de:
 *
 *   @CheckPolicies((ability) => ability.can('delete', 'Supplier'))
 *
 * O guard só decide se a rota passa. Regras que dependem do *registro* (autor
 * do lançamento, janela de tempo, estado do pedido) não cabem aqui — elas
 * vivem no serviço, porque o guard não carrega a entidade.
 */

export const canRead = (subject: Subject): PolicyHandler => (ability) =>
  ability.can(Action.Read, subject);

export const canCreate = (subject: Subject): PolicyHandler => (ability) =>
  ability.can(Action.Create, subject);

/**
 * Verifica permissão de alteração.
 *
 * `field` é o campo sendo alterado (ou lista deles). Sem ele, o CASL responde
 * apenas "pode alterar este recurso?" — e as regras por campo declaradas no
 * factory (`cannot(Action.Update, 'Order', ['discountCents', ...])`) **nunca
 * eram avaliadas**. Passe o campo sempre que a rota alterar algo sensível.
 */
export const canUpdate = (subject: Subject, field?: string | string[]): PolicyHandler => (
  ability,
) => ability.can(Action.Update, subject, field);

export const canDelete = (subject: Subject): PolicyHandler => (ability) =>
  ability.can(Action.Delete, subject);

export const canManage = (subject: Subject): PolicyHandler => (ability) =>
  ability.can(Action.Manage, subject);

/**
 * Operação sensível que gera efeito em lote e não é reversível por um update
 * comum. Hoje só `Nfe` (finalizar lança estoque + contas a pagar).
 */
export const canFinalize = (subject: Subject): PolicyHandler => (ability) =>
  ability.can(Action.Finalize, subject);

/** Aprovação por PIN de gerente (regra R3). */
export const canApprove = (subject: Subject): PolicyHandler => (ability) =>
  ability.can(Action.Approve, subject);

/**
 * Exige que TODAS as políticas passem.
 *
 * `@CheckPolicies(a, b)` já é um E lógico, mas compor explicitamente evita
 * ambiguidade quando a lista é montada dinamicamente.
 */
export const allOf = (...handlers: PolicyHandler[]): PolicyHandler => (ability) =>
  handlers.every((handler) =>
    typeof handler === 'function' ? handler(ability) : handler.handle(ability),
  );

/** Exige que PELO MENOS UMA das políticas passe. */
export const anyOf = (...handlers: PolicyHandler[]): PolicyHandler => (ability) =>
  handlers.some((handler) =>
    typeof handler === 'function' ? handler(ability) : handler.handle(ability),
  );
