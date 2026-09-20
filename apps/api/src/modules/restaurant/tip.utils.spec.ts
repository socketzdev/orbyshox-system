import {
  suggestedTipCents,
  deriveTipStatus,
  splitPayout,
  parseEligibleRoles,
} from './tip.utils';

describe('tip.utils — regra dos 10%', () => {
  it('sugerido é 10% arredondado (134,00 → 13,40)', () => {
    expect(suggestedTipCents(13400)).toBe(1340);
    expect(suggestedTipCents(100)).toBe(10);
    expect(suggestedTipCents(105)).toBe(11); // 10,5 → 11
    expect(suggestedTipCents(0)).toBe(0);
    expect(suggestedTipCents(-50)).toBe(0);
  });

  it('status deriva dos valores (a tela sugere, o servidor decide)', () => {
    expect(deriveTipStatus(0, 1340)).toBe('NOT_PAID');
    expect(deriveTipStatus(1340, 1340)).toBe('PAID');
    expect(deriveTipStatus(1500, 1340)).toBe('OVER');
    expect(deriveTipStatus(1000, 1340)).toBe('UNDER');
    expect(deriveTipStatus(-5, 1340)).toBe('NOT_PAID');
  });

  it('divisão igualitária com sobra no caixa', () => {
    // Exemplo da especificação: 2000 ÷ 5 = 400 cada.
    expect(splitPayout(200000, 5)).toEqual({ amountEachCents: 40000, remainderCents: 0 });
    // 100,00 ÷ 3 = 33,33 cada + 1 centavo de sobra.
    expect(splitPayout(10000, 3)).toEqual({ amountEachCents: 3333, remainderCents: 1 });
    expect(splitPayout(10000, 0)).toEqual({ amountEachCents: 0, remainderCents: 10000 });
    expect(splitPayout(0, 5)).toEqual({ amountEachCents: 0, remainderCents: 0 });
  });

  it('cargos elegíveis: só códigos conhecidos, sem duplicar', () => {
    expect(parseEligibleRoles('["WAITER","KITCHEN","WAITER","ROOT"]')).toEqual(['WAITER', 'KITCHEN']);
    expect(parseEligibleRoles(null)).toEqual(['WAITER', 'KITCHEN', 'CLEANING']);
    expect(parseEligibleRoles('lixo')).toEqual(['WAITER', 'KITCHEN', 'CLEANING']);
  });
});
