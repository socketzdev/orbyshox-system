/**
 * Taxonomia canônica de papéis — fonte única da verdade para RBAC.
 *
 * Antes deste arquivo existiam duas listas que não se falavam:
 *  1. `roles.guard.ts` — papéis de plataforma (equipe interna);
 *  2. `packages/shared-types/src/erp.ts` (`EMPLOYEE_ROLES`) — papéis de
 *     funcionário do cliente, aceitos no cadastro mas ignorados por qualquer
 *     checagem de permissão.
 *
 * Além disso, "garçom" e "cozinha" não existiam como papel: o frontend os
 * inferia de texto livre em `User.position` (`role-routing.ts`). Uma regra de
 * segurança não pode depender de um campo digitado à mão — um erro de
 * digitação viraria bloqueio indevido ou escalada de privilégio. Por isso
 * `WAITER` e `KITCHEN` passam a ser papéis de primeira classe (decisão D1).
 *
 * `User.role` é uma coluna String (não enum do Prisma), então acrescentar
 * valores aqui NÃO exige migração de banco — só o backfill dos usuários que
 * hoje têm `position` de garçom/cozinha (ver proposta B4).
 */

// ─── Plataforma (equipe interna do SaaS) ────────────────────────────────────

export const PLATFORM_ROLES = [
  'SUPER_ADMIN',
  'SUPPORT_MANAGER',
  'SUPPORT_AGENT',
  'FINANCE',
  'DEV',
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ─── Tenant (funcionários da loja cliente) ─────────────────────────────────

export const TENANT_ROLES = [
  'TENANT_ADMIN',
  /**
   * Legado: existe em `User.role` no banco (1 usuário) mas em NENHUMA das
   * listas do projeto — nem em `USER_ROLE`, nem em `EMPLOYEE_ROLES`. O front
   * já o trata como administrador (`role-routing.ts`). Sem reconhecê-lo aqui,
   * ligar o RBAC deixaria esse usuário sem nenhuma permissão. Fica como
   * equivalente a `TENANT_ADMIN` até a normalização da migração B4.
   */
  'TENANT_OWNER',
  'STORE_MANAGER',
  'CASHIER',
  'STOCKIST',
  'WAITER',
  'KITCHEN',
  // Limpeza/serviços gerais: cargo próprio ou acúmulo via `User.tags`.
  'CLEANING',
  'TENANT_EMPLOYEE',
] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

export type AppRole = PlatformRole | TenantRole;

export const APP_ROLES = [...PLATFORM_ROLES, ...TENANT_ROLES] as const;

/**
 * Papéis que podem aprovar uma correção fora da janela normal.
 *
 * Usado na regra R3 (edição de pedido fechado/pago/fora do prazo): a operação
 * só passa com o PIN do gerente. NÃO confundir com `DESTRUCTIVE_ROLES` — um
 * gerente aprova uma correção, mas não apaga um lote.
 */
export const TENANT_SUPERVISOR_ROLES = [
  'STORE_MANAGER',
  'TENANT_ADMIN',
  'TENANT_OWNER',
  'SUPER_ADMIN',
] as const;

/**
 * Papéis que podem executar exclusões irreversíveis (apagar lote, fornecedor,
 * conta a pagar/receber).
 *
 * Deliberadamente restrito: `STORE_MANAGER` NÃO entra. Essas exclusões são as
 * que a auditoria sinalizou como críticas (C8, H6, M7) e não podem ser
 * desfeitas — não é o momento de afrouxar.
 */
export const TENANT_DESTRUCTIVE_ROLES = ['TENANT_ADMIN', 'TENANT_OWNER', 'SUPER_ADMIN'] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normaliza o papel vindo do banco/token. Retorna `null` se desconhecido. */
export function normalizeRole(role: unknown): AppRole | null {
  if (typeof role !== 'string') return null;
  const value = role.trim().toUpperCase();
  if (!value) return null;
  return (APP_ROLES as readonly string[]).includes(value)
    ? (value as AppRole)
    : null;
}

export function isPlatformRole(role: unknown): role is PlatformRole {
  const normalized = normalizeRole(role);
  return normalized !== null && (PLATFORM_ROLES as readonly string[]).includes(normalized);
}

export function isTenantRole(role: unknown): role is TenantRole {
  const normalized = normalizeRole(role);
  return normalized !== null && (TENANT_ROLES as readonly string[]).includes(normalized);
}

/** Pode aprovar correção fora da janela (R3). */
export function canApproveCorrection(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized !== null &&
    (TENANT_SUPERVISOR_ROLES as readonly string[]).includes(normalized)
  );
}

/** Pode executar exclusões irreversíveis. */
export function canDestroyRecords(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized !== null &&
    (TENANT_DESTRUCTIVE_ROLES as readonly string[]).includes(normalized)
  );
}

/**
 * Acúmulos de função válidos (`User.tags`). Só valores conhecidos entram —
 * qualquer outra coisa é descartada em vez de gravada.
 */
export const EMPLOYEE_TAGS = ['CLEANING'] as const;

/** Normaliza `tags` vindas do cadastro para JSON seguro de gravar. */
export function normalizeEmployeeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => (EMPLOYEE_TAGS as readonly string[]).includes(t)),
  )];
}
