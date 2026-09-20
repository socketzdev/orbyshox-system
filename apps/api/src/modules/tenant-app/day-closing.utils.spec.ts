import {
  parseClosingPeriod,
  closingPeriodStart,
  nextRecurringDueDate,
  summarizeClosing,
  sortPaymentKeys,
} from './day-closing.utils';

describe('day-closing.utils', () => {
  it('parseia o período com fallback para hoje', () => {
    expect(parseClosingPeriod('week')).toBe('week');
    expect(parseClosingPeriod('month')).toBe('month');
    expect(parseClosingPeriod('HOJE')).toBe('today');
    expect(parseClosingPeriod('qualquer-coisa')).toBe('today');
    expect(parseClosingPeriod(undefined)).toBe('today');
  });

  it('início do período: hoje, segunda e dia 1º', () => {
    // Quarta 2026-09-16 15h.
    const wed = new Date(2026, 8, 16, 15, 30);
    expect(closingPeriodStart('today', wed)).toEqual(new Date(2026, 8, 16));
    // Segunda anterior: dia 14.
    expect(closingPeriodStart('week', wed)).toEqual(new Date(2026, 8, 14));
    // Domingo também volta para a segunda da mesma semana.
    expect(closingPeriodStart('week', new Date(2026, 8, 20))).toEqual(new Date(2026, 8, 14));
    expect(closingPeriodStart('month', wed)).toEqual(new Date(2026, 8, 1));
  });

  it('recorrência: mesmo mês quando o dia ainda vem', () => {
    expect(nextRecurringDueDate(10, new Date(2026, 8, 5))).toEqual(new Date(2026, 8, 10));
    // Dia de hoje conta como "ainda vem".
    expect(nextRecurringDueDate(5, new Date(2026, 8, 5))).toEqual(new Date(2026, 8, 5));
  });

  it('recorrência: pula para o mês seguinte quando já passou', () => {
    expect(nextRecurringDueDate(5, new Date(2026, 8, 16))).toEqual(new Date(2026, 9, 5));
  });

  it('recorrência: dia 31 em mês curto cai no último dia (sem pular mês)', () => {
    // Fevereiro/2026 tem 28 dias.
    expect(nextRecurringDueDate(31, new Date(2026, 1, 10))).toEqual(new Date(2026, 1, 28));
    // Abril tem 30.
    expect(nextRecurringDueDate(31, new Date(2026, 3, 1))).toEqual(new Date(2026, 3, 30));
  });

  it('consolida por pagamento com desconhecido em OUTROS', () => {
    const { totals, grandTotalCents } = summarizeClosing([
      { paymentMethod: 'PIX', totalCents: 10000 },
      { paymentMethod: 'CASH', totalCents: 5000 },
      { paymentMethod: 'BITCOIN', totalCents: 7000 },
      { paymentMethod: null, totalCents: 3000 },
    ]);
    expect(totals.PIX.totalCents).toBe(10000);
    expect(totals.DINHEIRO.totalCents).toBe(5000);
    expect(totals.OUTROS.totalCents).toBe(10000);
    expect(grandTotalCents).toBe(25000);
  });

  it('ordena as chaves na ordem do cupom', () => {
    expect(sortPaymentKeys(['OUTROS', 'PIX', 'DINHEIRO'])).toEqual(['DINHEIRO', 'PIX', 'OUTROS']);
  });
});
