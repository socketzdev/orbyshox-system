/**
 * Regra dos 10% (taxa de serviço) — funções puras.
 *
 * - Sugerido: `total × taxa`, arredondado (R$ 134,00 → R$ 13,40).
 * - Status DERIVADO no backend a partir dos valores (a tela sugere, o servidor
 *   decide — ninguém "marca" pago a mais sem ter pago a mais):
 *   0 ............ NOT_PAID · == sugerido .. PAID
 *   \> sugerido ... OVER .... < sugerido .. UNDER
 * - Divisão igualitária com sobra de centavos: o resto permanece no caixa.
 */

/** Taxa padrão: 1000 bps = 10%. */
export const DEFAULT_TIP_PERCENT_BPS = 1000;

export type TipStatus = 'NOT_PAID' | 'PAID' | 'OVER' | 'UNDER';

export const TIP_STATUS_LABEL: Record<TipStatus, string> = {
  NOT_PAID: 'Não pagou',
  PAID: 'Pagou',
  OVER: 'Pagou a mais',
  UNDER: 'Pagou a menos',
};

/** Cargos que podem participar da divisão (códigos de `User.role`). */
export const TIP_ELIGIBLE_ROLE_CODES = [
  'WAITER',
  'KITCHEN',
  'CLEANING',
  'CASHIER',
  'STORE_MANAGER',
  'TENANT_ADMIN',
] as const;

export const TIP_ROLE_LABELS: Record<string, string> = {
  WAITER: 'Garçom',
  KITCHEN: 'Cozinheiro/Chapista',
  CLEANING: 'Limpeza/Auxiliar',
  CASHIER: 'Operador de Caixa',
  STORE_MANAGER: 'Gerente',
  TENANT_ADMIN: 'Administrador',
};

export function suggestedTipCents(billTotalCents: number, percentBps: number = DEFAULT_TIP_PERCENT_BPS): number {
  const total = Math.max(0, Math.round(Number(billTotalCents) || 0));
  const bps = Math.max(0, Math.round(Number(percentBps) || 0));
  return Math.round((total * bps) / 10000);
}

export function deriveTipStatus(paidCents: number, suggestedCents: number): TipStatus {
  const paid = Math.max(0, Math.round(Number(paidCents) || 0));
  const suggested = Math.max(0, Math.round(Number(suggestedCents) || 0));
  if (paid <= 0) return 'NOT_PAID';
  if (paid === suggested) return 'PAID';
  return paid > suggested ? 'OVER' : 'UNDER';
}

export interface PayoutShare {
  amountEachCents: number;
  remainderCents: number;
}

/** Divide igualmente; a sobra de centavos fica no caixa (transparência). */
export function splitPayout(totalCents: number, participantCount: number): PayoutShare {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const n = Math.floor(Number(participantCount) || 0);
  if (total <= 0 || n <= 0) return { amountEachCents: 0, remainderCents: total };
  const each = Math.floor(total / n);
  return { amountEachCents: each, remainderCents: total - each * n };
}

/** Normaliza a lista de cargos elegíveis vinda do JSON gravado. */
export function parseEligibleRoles(raw: unknown, fallback: string[] = ['WAITER', 'KITCHEN', 'CLEANING']): string[] {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [...fallback];
    const known = arr
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim().toUpperCase())
      .filter((r) => (TIP_ELIGIBLE_ROLE_CODES as readonly string[]).includes(r));
    return [...new Set(known)];
  } catch {
    return [...fallback];
  }
}
