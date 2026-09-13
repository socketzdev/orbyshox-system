/**
 * Formas de pagamento canônicas do PDV.
 *
 * Motivação: o sistema tinha DOIS vocabulários em produção para o mesmo
 * conceito, e o backend grava a string crua no banco:
 *
 *   pos-terminal-page.tsx  → CASH, CREDIT_CARD, DEBIT_CARD, ON_CREDIT
 *   supermarket-pos-page.tsx → DINHEIRO, CARTAO_CREDITO, CARTAO_DEBITO, FIADO
 *
 * Como o relatório agrupa por `paymentMethod` cru (tenant-app.service.ts),
 * "Dinheiro" aparecia como duas linhas distintas — o mesmo método era
 * contado em buckets separados. Este módulo é a única fonte de verdade.
 */

/** Valores gravados no banco a partir de agora. */
export const PAYMENT_METHODS = [
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
  'VALE',
  'FIADO',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'DINHEIRO';

/** Rótulos exibidos ao operador de caixa. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  VALE: 'Vale',
  FIADO: 'Fiado (a prazo)',
};

/** Ícone sugerido por método — o consumidor decide qual biblioteca usar. */
export const PAYMENT_METHOD_ICON: Record<PaymentMethod, string> = {
  DINHEIRO: 'banknote',
  PIX: 'qrcode',
  CARTAO_DEBITO: 'credit-card',
  CARTAO_CREDITO: 'credit-card',
  VALE: 'ticket',
  FIADO: 'user-check',
};

/**
 * Aliases legados → canônico. Cobre o que já foi gravado e o que os dois
 * frontends enviavam, para que nada quebre durante a transição.
 */
const ALIASES: Record<string, PaymentMethod> = {
  // Dinheiro
  DINHEIRO: 'DINHEIRO',
  CASH: 'DINHEIRO',
  MONEY: 'DINHEIRO',
  ESPECIE: 'DINHEIRO',
  // Pix
  PIX: 'PIX',
  // Débito
  CARTAO_DEBITO: 'CARTAO_DEBITO',
  CARTAO_DEB: 'CARTAO_DEBITO',
  DEBIT_CARD: 'CARTAO_DEBITO',
  DEBITO: 'CARTAO_DEBITO',
  DEBIT: 'CARTAO_DEBITO',
  // Crédito
  CARTAO_CREDITO: 'CARTAO_CREDITO',
  CARTAO_CRED: 'CARTAO_CREDITO',
  CREDIT_CARD: 'CARTAO_CREDITO',
  CREDITO: 'CARTAO_CREDITO',
  CREDIT: 'CARTAO_CREDITO',
  // Vale
  VALE: 'VALE',
  VOUCHER: 'VALE',
  // Fiado
  FIADO: 'FIADO',
  ON_CREDIT: 'FIADO',
  CREDITO_LOJA: 'FIADO',
  STORE_CREDIT: 'FIADO',
  PRAZO: 'FIADO',
};

/**
 * Converte qualquer variante conhecida no valor canônico.
 * Retorna `fallback` quando o valor não é reconhecido, em vez de propagar
 * lixo para o banco — valores desconhecidos viram `OTHER` nos relatórios.
 */
export function normalizePaymentMethod(
  value: string | null | undefined,
  fallback: PaymentMethod = DEFAULT_PAYMENT_METHOD,
): PaymentMethod {
  if (!value) return fallback;

  const key = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ALIASES[key] ?? fallback;
}

/** Lista ordenada para seletores, já com rótulo. */
export function listPaymentMethods(): Array<{
  value: PaymentMethod;
  label: string;
  icon: string;
}> {
  return PAYMENT_METHODS.map((value) => ({
    value,
    label: PAYMENT_METHOD_LABEL[value],
    icon: PAYMENT_METHOD_ICON[value],
  }));
}

/** true quando a venda gera dívida para o cliente. */
export function isCreditSale(method: PaymentMethod | string | null | undefined): boolean {
  return normalizePaymentMethod(method) === 'FIADO';
}
