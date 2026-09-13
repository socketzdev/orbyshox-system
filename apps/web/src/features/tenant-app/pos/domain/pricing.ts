/**
 * Cálculos de precificação do PDV: desconto, totais e troco.
 *
 * Motivação: cada PDV recalculava subtotal/desconto/total com regras próprias
 * e tipos diferentes — `pos-terminal` guardava desconto em centavos,
 * `supermarket-pos` em percentual sobre reais. Centralizar aqui garante que
 * "total = subtotal − desconto, nunca negativo" valha para os dois.
 */

import {
  cartItemCount,
  cartSubtotalCents,
  type CartLine,
} from './cart';
import { calculateSmartChange } from '../../supermarket/smart-change';

/** Desconto em percentual (0–100) ou valor absoluto em centavos. */
export type Discount =
  | { type: 'PERCENT'; value: number }
  | { type: 'ABSOLUTE'; valueCents: number }
  | null;

export interface SaleTotals {
  subtotalCents: number;
  discountCents: number;
  /** Nunca negativo. */
  totalCents: number;
  itemCount: number;
  lineCount: number;
}

/** Percentual máximo aceito, para travar digitação errada do operador. */
export const MAX_DISCOUNT_PERCENT = 100;

/**
 * Converte o desconto em centavos, já limitado ao subtotal.
 * Valores inválidos (NaN, negativo, percentual acima do teto) viram zero —
 * o PDV não deve quebrar nem gerar total negativo por digitação.
 */
export function discountToCents(subtotalCents: number, discount: Discount): number {
  if (!discount || subtotalCents <= 0) return 0;

  if (discount.type === 'PERCENT') {
    const percent = Number(discount.value);
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    const capped = Math.min(percent, MAX_DISCOUNT_PERCENT);
    return Math.min(Math.round((subtotalCents * capped) / 100), subtotalCents);
  }

  const cents = Math.round(Number(discount.valueCents));
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.min(cents, subtotalCents);
}

/** Totais consolidados da venda. */
export function computeTotals(cart: CartLine[], discount: Discount = null): SaleTotals {
  const subtotalCents = cartSubtotalCents(cart);
  const discountCents = discountToCents(subtotalCents, discount);

  return {
    subtotalCents,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    itemCount: cartItemCount(cart),
    lineCount: cart.length,
  };
}

/**
 * Troco para pagamento em dinheiro.
 * Delega a `smart-change` (que já faz a decomposição em cédulas e a dica de
 * "troco facilitado") para não duplicar a regra.
 */
export function computeChange(totalCents: number, cashGivenCents: number) {
  return calculateSmartChange(totalCents, cashGivenCents);
}

/**
 * Presets de valor recebido (exato, próximo múltiplo de 5/10/20/50/100).
 * Síncrono de propósito: é usado durante o render e não deve introduzir
 * estado assíncrono no meio do fluxo de pagamento.
 */
export function buildQuickCashPresets(
  totalCents: number,
): Array<{ label: string; amountCents: number; isExact?: boolean }> {
  if (totalCents <= 0) return [];

  const total = totalCents / 100;
  const presets: Array<{ label: string; amountCents: number; isExact?: boolean }> = [
    {
      label: `Exato (${formatBrl(total)})`,
      amountCents: totalCents,
      isExact: true,
    },
  ];

  const candidates = [
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
  ];

  const uniques = Array.from(new Set(candidates))
    .filter((value) => value > total)
    .sort((a, b) => a - b)
    .slice(0, 4);

  for (const value of uniques) {
    presets.push({
      label: formatBrl(value),
      amountCents: Math.round(value * 100),
    });
  }

  return presets;
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
