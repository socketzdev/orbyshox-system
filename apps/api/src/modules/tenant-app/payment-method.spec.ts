import {
  normalizePaymentMethodOrOther,
  paymentMethodLabel,
  normalizePaymentMethod,
} from './payment-method';

/**
 * Consolidação do fechamento do dia: o relatório térmico totaliza por meio de
 * pagamento, então variante desconhecida NÃO pode cair em DINHEIRO (inflaria o
 * caixa em espécie na prestação de contas).
 */
describe('payment-method — consolidação do fechamento', () => {
  it('normaliza as variantes conhecidas', () => {
    expect(normalizePaymentMethodOrOther('pix')).toBe('PIX');
    expect(normalizePaymentMethodOrOther('CASH')).toBe('DINHEIRO');
    expect(normalizePaymentMethodOrOther('credit_card')).toBe('CARTAO_CREDITO');
    expect(normalizePaymentMethodOrOther('Cartão de Débito')).toBe('CARTAO_DEBITO');
  });

  it('desconhecido e vazio viram OUTROS (nunca DINHEIRO)', () => {
    expect(normalizePaymentMethodOrOther('BITCOIN')).toBe('OUTROS');
    expect(normalizePaymentMethodOrOther('')).toBe('OUTROS');
    expect(normalizePaymentMethodOrOther(null)).toBe('OUTROS');
    expect(normalizePaymentMethodOrOther(undefined)).toBe('OUTROS');
  });

  it('não muda o comportamento legado do normalize com fallback', () => {
    expect(normalizePaymentMethod('BITCOIN')).toBe('DINHEIRO');
    expect(normalizePaymentMethod('pix')).toBe('PIX');
  });

  it('rotula em português para o cupom', () => {
    expect(paymentMethodLabel('DINHEIRO')).toBe('Dinheiro');
    expect(paymentMethodLabel('PIX')).toBe('Pix');
    expect(paymentMethodLabel('CARTAO_CREDITO')).toBe('Cartão de Crédito');
    expect(paymentMethodLabel('CARTAO_DEBITO')).toBe('Cartão de Débito');
    expect(paymentMethodLabel('OUTROS')).toBe('Outros');
  });
});
