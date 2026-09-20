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
 * Chave de consulta: sem acento, maiúscula, espaços/hífens viram `_`
 * ("Cartão de Débito" → `CARTAO_DE_DEBITO`).
 */
function baseKey(value: string): string {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Variações consultadas em ordem: a chave cheia e, se ela tiver conectivos
 * ("DE"/"DA"/"DO"), a forma sem eles (`CARTAO_DE_DEBITO` → `CARTAO_DEBITO`).
 * Sem isso, "Cartão de Débito" digitado por extenso nunca bateria em alias
 * nenhum e cairia em OUTROS/DINHEIRO.
 */
function lookupAlias(raw: string): PaymentMethod | null {
  const full = baseKey(raw);
  if (ALIASES[full]) return ALIASES[full];
  const short = full.replace(/_D[AEO]_/g, '_');
  if (ALIASES[short]) return ALIASES[short];
  return null;
}

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
  return lookupAlias(String(value)) ?? fallback;
}

/**
 * Variante para consolidação (fechamento do dia): desconhecido vira `OUTROS`
 * em vez de cair em DINHEIRO — somar valor sem dono no dinheiro quebraria a
 * prestação de contas com o proprietário.
 */
export type ConsolidatedPaymentMethod = PaymentMethod | 'OUTROS';

export function normalizePaymentMethodOrOther(
  value: string | null | undefined,
): ConsolidatedPaymentMethod {
  if (!value || !String(value).trim()) return 'OUTROS';
  return lookupAlias(String(value)) ?? 'OUTROS';
}

/** Rótulo em português para o cupom/relatório térmico. */
export function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'DINHEIRO':
      return 'Dinheiro';
    case 'PIX':
      return 'Pix';
    case 'CARTAO_CREDITO':
      return 'Cartão de Crédito';
    case 'CARTAO_DEBITO':
      return 'Cartão de Débito';
    case 'VALE':
      return 'Vale';
    case 'FIADO':
      return 'Fiado';
    default:
      return 'Outros';
  }
}

/** Venda a prazo (gera dívida do cliente). */
export function isCreditSale(value: string | null | undefined): boolean {
  return normalizePaymentMethod(value) === 'FIADO';
}
