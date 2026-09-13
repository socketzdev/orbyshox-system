/**
 * Formatadores centralizados de exibição (pt-BR).
 *
 * Motivação: `formatCurrency` estava redefinido em 14 arquivos e `formatDate`
 * em 5 arquivos com 3 comportamentos divergentes (um deles sem guarda de null,
 * renderizando "Invalid Date"). Centralizar aqui garante consistência visual e
 * elimina a duplicação.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Formata um valor em CENTAVOS para moeda brasileira.
 * @example formatCurrency(1990) // "R$ 19,90"
 */
export function formatCurrency(cents: number | null | undefined, fallback = 'R$ 0,00'): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return fallback;
  return BRL.format(cents / 100);
}

/**
 * Formata um valor já em REAIS (não centavos). Use apenas quando a fonte não
 * estiver em centavos — prefira `formatCurrency` para valores monetários do sistema.
 * @example formatCurrencyFromReais(19.9) // "R$ 19,90"
 */
export function formatCurrencyFromReais(value: number | null | undefined, fallback = 'R$ 0,00'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return BRL.format(value);
}

/**
 * Formata uma data ISO/Date para o padrão brasileiro (dd/mm/aaaa).
 * Aceita null/undefined e retorna o fallback em vez de "Invalid Date".
 * @example formatDate('2026-09-11') // "11/09/2026"
 */
export function formatDate(
  value: string | Date | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('pt-BR');
}

/**
 * Formata data e hora no padrão brasileiro.
 * @example formatDateTime('2026-09-11T14:30:00Z') // "11/09/2026 14:30"
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formata números decimais com vírgula (pt-BR).
 * @example formatNumber(1234.5, 1) // "1.234,5"
 */
export function formatNumber(value: number | null | undefined, fractionDigits = 0, fallback = '0'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Formata percentual.
 * @example formatPercent(4.9) // "4,9%"
 */
export function formatPercent(value: number | null | undefined, fractionDigits = 1, fallback = '0%'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/** Aplica máscara de CNPJ (00.000.000/0000-00). Retorna o valor original se não tiver 14 dígitos. */
export function formatCnpj(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Aplica máscara de CPF (000.000.000-00). */
export function formatCpf(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

/** Aplica máscara de telefone (fixo ou celular). */
export function formatPhone(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return value;
}
