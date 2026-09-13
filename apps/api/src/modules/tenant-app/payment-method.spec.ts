import { isCreditSale, normalizePaymentMethod, PAYMENT_METHODS } from './payment-method';

describe('normalizePaymentMethod', () => {
  it('unifica os dois vocabulários legados no mesmo valor canônico', () => {
    expect(normalizePaymentMethod('CASH')).toBe('DINHEIRO');
    expect(normalizePaymentMethod('DINHEIRO')).toBe('DINHEIRO');
    expect(normalizePaymentMethod('CREDIT_CARD')).toBe('CARTAO_CREDITO');
    expect(normalizePaymentMethod('CARTAO_CREDITO')).toBe('CARTAO_CREDITO');
    expect(normalizePaymentMethod('DEBIT_CARD')).toBe('CARTAO_DEBITO');
    expect(normalizePaymentMethod('ON_CREDIT')).toBe('FIADO');
    expect(normalizePaymentMethod('FIADO')).toBe('FIADO');
  });

  it('aceita variações de caixa, espaço e hífen', () => {
    expect(normalizePaymentMethod(' cash ')).toBe('DINHEIRO');
    expect(normalizePaymentMethod('cartao-credito')).toBe('CARTAO_CREDITO');
  });

  it('respeita o fallback informado (default do pedido é PIX)', () => {
    expect(normalizePaymentMethod(null, 'PIX')).toBe('PIX');
    expect(normalizePaymentMethod(undefined, 'PIX')).toBe('PIX');
    expect(normalizePaymentMethod('CRIPTOMOEDA', 'PIX')).toBe('PIX');
  });

  it('sem fallback explícito usa DINHEIRO', () => {
    expect(normalizePaymentMethod(null)).toBe('DINHEIRO');
  });

  it('todo método canônico normaliza para si mesmo', () => {
    for (const method of PAYMENT_METHODS) {
      expect(normalizePaymentMethod(method)).toBe(method);
    }
  });
});

describe('isCreditSale', () => {
  it('reconhece fiado nos dois vocabulários', () => {
    expect(isCreditSale('FIADO')).toBe(true);
    expect(isCreditSale('ON_CREDIT')).toBe(true);
  });

  it('não considera os demais métodos como fiado', () => {
    expect(isCreditSale('DINHEIRO')).toBe(false);
    expect(isCreditSale('CASH')).toBe(false);
    expect(isCreditSale('PIX')).toBe(false);
    expect(isCreditSale(null)).toBe(false);
  });
});
