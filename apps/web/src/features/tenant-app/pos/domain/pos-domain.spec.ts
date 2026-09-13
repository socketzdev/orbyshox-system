import { describe, it, expect } from 'vitest';
import {
  addLine,
  cartItemCount,
  cartSubtotalCents,
  changeLineQuantity,
  clearCart,
  findMergeableLineIndex,
  lineTotalCents,
  removeLine,
  setLineQuantity,
  toOrderItemsPayload,
  type CartLine,
} from './cart';
import {
  buildQuickCashPresets,
  computeChange,
  computeTotals,
  discountToCents,
  MAX_DISCOUNT_PERCENT,
} from './pricing';
import {
  isCreditSale,
  listPaymentMethods,
  normalizePaymentMethod,
  PAYMENT_METHODS,
} from './payment-methods';

const rice: CartLine = {
  productId: 'p-1',
  name: 'Arroz 5kg',
  unit: 'un',
  unitPriceCents: 2990,
  quantity: 1,
};

const cheese: CartLine = {
  productId: 'p-7',
  name: 'Queijo (balança)',
  unit: 'kg',
  unitPriceCents: 2160,
  quantity: 1,
  isWeighable: true,
};

describe('cart', () => {
  it('calcula o total da linha arredondando frações de peso', () => {
    expect(lineTotalCents({ ...rice, quantity: 3 })).toBe(8970);
    // 0.450 kg a R$ 21,60/kg = 972 centavos exatos
    expect(lineTotalCents({ ...cheese, unitPriceCents: 2160, quantity: 0.45 })).toBe(972);
  });

  it('soma o subtotal de todas as linhas', () => {
    expect(cartSubtotalCents([rice, { ...rice, quantity: 2 }])).toBe(8970);
  });

  it('conta itens tratando linha de balança como uma unidade', () => {
    expect(cartItemCount([{ ...rice, quantity: 3 }, cheese])).toBe(4);
  });

  it('não agrupa linhas por padrão (comportamento do supermarket-pos)', () => {
    const cart = addLine(addLine([], rice), rice);
    expect(cart).toHaveLength(2);
  });

  it('agrupa quando merge=true (comportamento do pos-terminal)', () => {
    const cart = addLine(addLine([], rice, { merge: true }), rice, { merge: true });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('nunca agrupa itens de balança, mesmo com merge=true', () => {
    const cart = addLine(
      addLine([], cheese, { merge: true }),
      { ...cheese, unitPriceCents: 1800 },
      { merge: true },
    );
    expect(cart).toHaveLength(2);
  });

  it('não agrupa o mesmo produto com preços diferentes', () => {
    const cart = addLine(
      addLine([], rice, { merge: true }),
      { ...rice, unitPriceCents: 3190 },
      { merge: true },
    );
    expect(cart).toHaveLength(2);
  });

  it('findMergeableLineIndex retorna -1 para balança', () => {
    expect(findMergeableLineIndex([cheese], cheese)).toBe(-1);
  });

  it('setLineQuantity remove a linha quando a quantidade chega a zero', () => {
    expect(setLineQuantity([rice], 0, 0)).toHaveLength(0);
    expect(setLineQuantity([rice], 0, -5)).toHaveLength(0);
  });

  it('changeLineQuantity aplica delta e remove ao ficar <= 0', () => {
    const cart = changeLineQuantity([{ ...rice, quantity: 2 }], 0, -1);
    expect(cart[0].quantity).toBe(1);
    expect(changeLineQuantity(cart, 0, -1)).toHaveLength(0);
  });

  it('ignora quantidade inválida em addLine', () => {
    expect(addLine([], { ...rice, quantity: 0 })).toHaveLength(0);
    expect(addLine([], { ...rice, quantity: Number.NaN })).toHaveLength(0);
  });

  it('removeLine e clearCart não mutam o array original', () => {
    const original = [rice, { ...rice, quantity: 2 }];
    const snapshot = [...original];
    removeLine(original, 0);
    clearCart();
    expect(original).toEqual(snapshot);
  });

  it('gera payload de pedido no formato esperado pela API', () => {
    expect(toOrderItemsPayload([{ ...rice, quantity: 2 }])).toEqual([
      { productId: 'p-1', quantity: 2, unitPriceCents: 2990 },
    ]);
  });
});

describe('pricing', () => {
  it('aplica desconto percentual', () => {
    expect(discountToCents(10000, { type: 'PERCENT', value: 10 })).toBe(1000);
  });

  it('limita desconto percentual ao teto de 100%', () => {
    expect(discountToCents(10000, { type: 'PERCENT', value: 150 })).toBe(10000);
  });

  it('limita desconto absoluto ao subtotal (nunca gera total negativo)', () => {
    expect(discountToCents(5000, { type: 'ABSOLUTE', valueCents: 9000 })).toBe(5000);
  });

  it('trata desconto inválido como zero', () => {
    expect(discountToCents(10000, { type: 'PERCENT', value: -5 })).toBe(0);
    expect(discountToCents(10000, { type: 'ABSOLUTE', valueCents: Number.NaN })).toBe(0);
    expect(discountToCents(10000, null)).toBe(0);
  });

  it('computa totais consolidados', () => {
    const totals = computeTotals([{ ...rice, quantity: 2 }], { type: 'PERCENT', value: 10 });
    expect(totals.subtotalCents).toBe(5980);
    expect(totals.discountCents).toBe(598);
    expect(totals.totalCents).toBe(5382);
    expect(totals.itemCount).toBe(2);
    expect(totals.lineCount).toBe(1);
  });

  it('total nunca é negativo', () => {
    const totals = computeTotals([rice], { type: 'ABSOLUTE', valueCents: 999999 });
    expect(totals.totalCents).toBe(0);
  });

  it('carrinho vazio gera totais zerados', () => {
    expect(computeTotals([])).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      itemCount: 0,
      lineCount: 0,
    });
  });

  it('calcula troco e detecta valor insuficiente', () => {
    const ok = computeChange(5000, 10000);
    expect(ok.changeCents).toBe(5000);
    expect(ok.isExact).toBe(false);
    expect(ok.isShort).toBe(false);

    const short = computeChange(10000, 5000);
    expect(short.isShort).toBe(true);
    expect(short.shortCents).toBe(5000);
  });

  it('detecta pagamento exato', () => {
    expect(computeChange(5000, 5000).isExact).toBe(true);
  });

  it('gera presets de dinheiro ordenados e com o valor exato primeiro', () => {
    const presets = buildQuickCashPresets(2340);
    expect(presets[0].isExact).toBe(true);
    expect(presets[0].amountCents).toBe(2340);
    const amounts = presets.map((p) => p.amountCents);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it('não gera presets para total zero', () => {
    expect(buildQuickCashPresets(0)).toEqual([]);
  });

  it('MAX_DISCOUNT_PERCENT é 100', () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(100);
  });
});

describe('payment-methods', () => {
  it('normaliza os dois vocabulários legados para o mesmo valor', () => {
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

  it('usa fallback para valores nulos ou desconhecidos', () => {
    expect(normalizePaymentMethod(null)).toBe('DINHEIRO');
    expect(normalizePaymentMethod(undefined)).toBe('DINHEIRO');
    expect(normalizePaymentMethod('BITCOIN')).toBe('DINHEIRO');
    expect(normalizePaymentMethod('BITCOIN', 'PIX')).toBe('PIX');
  });

  it('isCreditSale só é verdadeiro para fiado', () => {
    expect(isCreditSale('FIADO')).toBe(true);
    expect(isCreditSale('ON_CREDIT')).toBe(true);
    expect(isCreditSale('DINHEIRO')).toBe(false);
    expect(isCreditSale(null)).toBe(false);
  });

  it('lista todos os métodos canônicos com rótulo', () => {
    const list = listPaymentMethods();
    expect(list).toHaveLength(PAYMENT_METHODS.length);
    for (const item of list) {
      expect(item.label).toBeTruthy();
      expect(PAYMENT_METHODS).toContain(item.value);
    }
  });
});
