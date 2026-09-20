import { normalizePaymentMethodOrOther, paymentMethodLabel } from './payment-method';

export type ClosingPeriod = 'today' | 'week' | 'month';

export const CLOSING_PERIOD_LABELS: Record<ClosingPeriod, string> = {
  today: 'Hoje',
  week: 'Semana',
  month: 'Mês',
};

/** Normaliza o parâmetro vindo da URL (qualquer outra coisa cai em `today`). */
export function parseClosingPeriod(raw: unknown): ClosingPeriod {
  const v = String(raw || '').toLowerCase();
  if (v === 'week' || v === 'semana') return 'week';
  if (v === 'month' || v === 'mes' || v === 'mês') return 'month';
  return 'today';
}

/**
 * Início do período em hora local (mesma convenção dos outros relatórios):
 * hoje 00h00 · segunda-feira 00h00 · dia 1º 00h00.
 */
export function closingPeriodStart(period: ClosingPeriod, now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    // getDay: 0=domingo..6=sábado → volta até segunda.
    const back = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - back);
  } else if (period === 'month') {
    start.setDate(1);
  }
  return start;
}

/**
 * Próximo vencimento de conta fixa a partir do `dueDay` (1-31).
 * Dia 29-31 em mês curto cai no último dia do mês — nunca pula um mês.
 */
export function nextRecurringDueDate(dueDay: number, from = new Date()): Date {
  const day = Math.min(31, Math.max(1, Math.floor(dueDay)));
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const candidateThisMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  // Truque: dia 0 do mês seguinte = último dia do mês atual.
  const lastThisMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  candidateThisMonth.setDate(Math.min(day, lastThisMonth));
  if (candidateThisMonth >= startOfToday) return candidateThisMonth;
  const lastNextMonth = new Date(from.getFullYear(), from.getMonth() + 2, 0).getDate();
  const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  next.setDate(Math.min(day, lastNextMonth));
  return next;
}

export interface ClosingNoteInput {
  paymentMethod?: string | null;
  totalCents?: number | null;
}

export interface ClosingSummary {
  totals: Record<string, { count: number; totalCents: number; label: string }>;
  grandTotalCents: number;
}

/** Consolida notas por meio de pagamento (ordem fixa p/ o cupom). */
export function summarizeClosing(notes: ClosingNoteInput[]): ClosingSummary {
  const totals: ClosingSummary['totals'] = {};
  for (const n of notes) {
    const method = normalizePaymentMethodOrOther(n.paymentMethod);
    if (!totals[method]) totals[method] = { count: 0, totalCents: 0, label: paymentMethodLabel(method) };
    totals[method].count++;
    totals[method].totalCents += Number(n.totalCents ?? 0);
  }
  const grandTotalCents = notes.reduce((s, n) => s + Number(n.totalCents ?? 0), 0);
  return { totals, grandTotalCents };
}

/** Ordem fixa das linhas de pagamento no cupom e na tela. */
export function sortPaymentKeys(keys: string[]): string[] {
  const order = ['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'VALE', 'FIADO', 'OUTROS'];
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
