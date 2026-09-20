import { validatePurchasePayment, groupItemPayments } from './purchase-payment.utils';

describe('purchase-payment.utils', () => {
  it('aceita pagamento único fechando no total', () => {
    expect(validatePurchasePayment(1500, [{ method: 'PIX', amountCents: 1500 }])).toEqual({
      totalCents: 1500,
      payments: [{ method: 'PIX', amountCents: 1500 }],
    });
  });

  it('aceita combinado (dinheiro + pix) somando o total', () => {
    const res = validatePurchasePayment(1500, [
      { method: 'DINHEIRO', amountCents: 1000 },
      { method: 'pix', amountCents: 500 },
    ]);
    expect(res.payments).toEqual([
      { method: 'DINHEIRO', amountCents: 1000 },
      { method: 'PIX', amountCents: 500 },
    ]);
  });

  it('recusa soma diferente do total (a mais ou a menos)', () => {
    expect(() => validatePurchasePayment(1500, [{ method: 'PIX', amountCents: 1400 }])).toThrow(
      /precisa fechar no total/,
    );
    expect(() => validatePurchasePayment(1500, [{ method: 'PIX', amountCents: 1600 }])).toThrow(
      /precisa fechar no total/,
    );
  });

  it('recusa canal desconhecido, parcela zerada e total zerado', () => {
    expect(() => validatePurchasePayment(1500, [{ method: 'BITCOIN', amountCents: 1500 }])).toThrow(
      /inválida/,
    );
    expect(() => validatePurchasePayment(1500, [{ method: 'PIX', amountCents: 0 }])).toThrow(
      /maior que zero/,
    );
    expect(() => validatePurchasePayment(0, [{ method: 'PIX', amountCents: 0 }])).toThrow(
      /valor total/,
    );
    expect(() => validatePurchasePayment(1500, [])).toThrow(/ao menos uma forma/);
  });

  it('agrupa rateio por item em parcelas por canal', () => {
    expect(
      groupItemPayments([
        { priceCents: 1000, paymentMethod: 'DINHEIRO' },
        { priceCents: 500, paymentMethod: 'PIX' },
        { priceCents: 500, paymentMethod: 'PIX' },
        { priceCents: 0, paymentMethod: 'PIX' },
      ]),
    ).toEqual([
      { method: 'DINHEIRO', amountCents: 1000 },
      { method: 'PIX', amountCents: 1000 },
    ]);
  });

  it('rateio com canal inválido falha', () => {
    expect(() => groupItemPayments([{ priceCents: 100, paymentMethod: 'FIADO' }])).toThrow(
      /canal válido/,
    );
  });
});
