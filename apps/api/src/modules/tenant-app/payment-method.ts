/**
 * Formas de pagamento canônicas (espelho do frontend).
 *
 * O sistema cresceu com dois vocabulários para o mesmo conceito:
 *   - terminal genérico ....... CASH, CREDIT_CARD, DEBIT_CARD, ON_CREDIT
 *   - PDV de supermercado ..... DINHEIRO, CARTAO_CREDITO, CARTAO_DEBITO, FIADO
 *
 * O `paymentMethod` era gravado cru e os relatórios agrupam por esse campo,
 * então "Dinheiro" aparecia em duas linhas distintas. Normalizar na escrita
 * unifica o histórico futuro sem migração; a leitura continua aceitando os
 * aliases gravados antes desta mudança.
 */

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

const ALIASES: Record<string, PaymentMethod> = {
  DINHEIRO: 'DINHEIRO',
  CASH: 'DINHEIRO',
  MONEY: 'DINHEIRO',
  ESPECIE: 'DINHEIRO',

  PIX: 'PIX',

  CARTAO_DEBITO: 'CARTAO_DEBITO',
  CARTAO_DEB: 'CARTAO_DEBITO',
  DEBIT_CARD: 'CARTAO_DEBITO',
  DEBITO: 'CARTAO_DEBITO',
  DEBIT: 'CARTAO_DEBITO',

  CARTAO_CREDITO: 'CARTAO_CREDITO',
  CARTAO_CRED: 'CARTAO_CREDITO',
  CREDIT_CARD: 'CARTAO_CREDITO',
  CREDITO: 'CARTAO_CREDITO',
  CREDIT: 'CARTAO_CREDITO',

  VALE: 'VALE',
  VOUCHER: 'VALE',

  FIADO: 'FIADO',
  ON_CREDIT: 'FIADO',
  CREDITO_LOJA: 'FIADO',
  STORE_CREDIT: 'FIADO',
  PRAZO: 'FIADO',
};

/**
 * Converte qualquer variante conhecida no valor canônico.
 * Valores desconhecidos caem no `fallback` em vez de poluírem o relatório
 * com uma categoria nova a cada digitação errada.
 */
export function normalizePaymentMethod(
  value: string | null | undefined,
  fallback: PaymentMethod = DEFAULT_PAYMENT_METHOD,
): PaymentMethod {
  if (!value) return fallback;
  const key = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ALIASES[key] ?? fallback;
}

/** Venda a prazo (gera dívida do cliente). */
export function isCreditSale(value: string | null | undefined): boolean {
  return normalizePaymentMethod(value) === 'FIADO';
}
