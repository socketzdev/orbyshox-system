import { useCallback, useMemo, useState } from 'react';
import {
  addLine,
  changeLineQuantity,
  clearCart as emptyCart,
  removeLine,
  setLineQuantity,
  type CartLine,
} from '../domain/cart';
import { computeTotals, type Discount } from '../domain/pricing';

/**
 * Estado do carrinho compartilhado pelos dois PDVs.
 *
 * Antes cada tela mantinha sua própria lista, seu próprio tipo de item e sua
 * própria aritmética de totais — era impossível garantir que "subtotal −
 * desconto" significasse a mesma coisa nos dois lugares. Aqui a regra é única
 * e vem da camada de domínio (pura e testada).
 */
export interface UseCartOptions {
  /**
   * Agrupa linhas idênticas ao adicionar.
   * `false` preserva o comportamento do PDV de supermercado (uma linha por
   * leitura); `true` preserva o do terminal genérico.
   */
  mergeLines?: boolean;
}

export function useCart({ mergeLines = false }: UseCartOptions = {}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState<Discount>(null);

  const addItem = useCallback(
    (line: CartLine) => {
      setCart((current) => addLine(current, line, { merge: mergeLines }));
    },
    [mergeLines],
  );

  const updateQuantity = useCallback((index: number, quantity: number) => {
    setCart((current) => setLineQuantity(current, index, quantity));
  }, []);

  const changeQuantity = useCallback((index: number, delta: number) => {
    setCart((current) => changeLineQuantity(current, index, delta));
  }, []);

  const removeItem = useCallback((index: number) => {
    setCart((current) => removeLine(current, index));
  }, []);

  const clear = useCallback(() => setCart(emptyCart()), []);

  /** Aplica desconto percentual (0–100). */
  const applyPercentDiscount = useCallback((percent: number) => {
    setDiscount(Number.isFinite(percent) && percent > 0 ? { type: 'PERCENT', value: percent } : null);
  }, []);

  /** Aplica desconto em valor absoluto (centavos). */
  const applyAbsoluteDiscount = useCallback((cents: number) => {
    setDiscount(Number.isFinite(cents) && cents > 0 ? { type: 'ABSOLUTE', valueCents: cents } : null);
  }, []);

  const clearDiscount = useCallback(() => setDiscount(null), []);

  const totals = useMemo(() => computeTotals(cart, discount), [cart, discount]);

  /** Percentual ativo (0 quando o desconto é absoluto ou não há desconto). */
  const discountPercent = discount?.type === 'PERCENT' ? discount.value : 0;

  return {
    cart,
    discount,
    discountPercent,
    totals,
    addItem,
    updateQuantity,
    changeQuantity,
    removeItem,
    clear,
    applyPercentDiscount,
    applyAbsoluteDiscount,
    clearDiscount,
  };
}
