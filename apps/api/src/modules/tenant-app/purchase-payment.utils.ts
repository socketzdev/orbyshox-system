import { normalizePaymentMethodOrOther } from './payment-method';

/** Canais aceitos na compra de insumos (especificação do módulo). */
export const PURCHASE_PAYMENT_METHODS = [
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
] as const;

export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number];

export interface PurchasePaymentSplit {
  method: string;
  amountCents: number;
}

/**
 * Valida o pagamento da nota de compra. Regras:
 * - total > 0;
 * - ao menos 1 parcela, tudo em canal conhecido (DINHEIRO/PIX/CARTAO_*);
 * - a soma das parcelas == total (nem a mais, nem a menos — centavo conta).
 *
 * Devolve as parcelas normalizadas ou lança `Error` com a mensagem pronta
 * para a tela (o service converte em BadRequestException).
 */
export function validatePurchasePayment(
  totalCents: unknown,
  payments: unknown,
): { totalCents: number; payments: { method: PurchasePaymentMethod; amountCents: number }[] } {
  const total = Math.round(Number(totalCents) || 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('Informe o valor total gasto na compra.');
  }
  if (!Array.isArray(payments) || payments.length === 0) {
    throw new Error('Informe ao menos uma forma de pagamento.');
  }
  const normalized = (payments as PurchasePaymentSplit[]).map((p) => {
    const method = normalizePaymentMethodOrOther((p as any)?.method);
    if (!(PURCHASE_PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new Error(`Forma de pagamento inválida: ${String((p as any)?.method || '—')}.`);
    }
    const amountCents = Math.round(Number((p as any)?.amountCents) || 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error('Toda parcela precisa de valor maior que zero.');
    }
    return { method: method as PurchasePaymentMethod, amountCents };
  });
  const sum = normalized.reduce((s, p) => s + p.amountCents, 0);
  if (sum !== total) {
    throw new Error(
      `A soma das parcelas precisa fechar no total da nota (parcelas: ${sum}, total: ${total}).`,
    );
  }
  return { totalCents: total, payments: normalized };
}

/**
 * Agrupa o rateio por item em parcelas por canal — o "espelho" do pagamento
 * combinado (ex.: arroz no dinheiro + ovo no pix vira 2 parcelas).
 */
export function groupItemPayments(
  items: { priceCents?: unknown; paymentMethod?: unknown }[],
): { method: PurchasePaymentMethod; amountCents: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const price = Math.round(Number(it.priceCents) || 0);
    if (price <= 0) continue;
    const method = normalizePaymentMethodOrOther(it.paymentMethod as string);
    if (!(PURCHASE_PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new Error('Todo item com valor precisa de um canal válido.');
    }
    map.set(method, (map.get(method) || 0) + price);
  }
  return [...map.entries()].map(([method, amountCents]) => ({
    method: method as PurchasePaymentMethod,
    amountCents,
  }));
}
