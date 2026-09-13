/**
 * Operações puras de carrinho do PDV — sem React, sem efeitos, sem I/O.
 *
 * Regras adotadas:
 *  - Todo valor monetário é **inteiro em centavos**. Os dois PDVs originais
 *    misturavam reais (`number` com ponto flutuante) e centavos, e o
 *    `supermarket-pos` reconvertia a cada render (`Math.round(x * 100)`),
 *    fonte de divergência de arredondamento.
 *  - `quantity` aceita fracionário porque balança usa peso (ex.: 0.450 kg).
 *  - Nenhuma função muta o array de entrada: todas devolvem nova lista.
 *    Assim a camada é trivial de testar e de usar com `useState`/`useReducer`.
 */

export interface CartLine {
  productId: string;
  name: string;
  /** Código de barras ou código interno que originou a linha. */
  barcode?: string;
  unit?: string;
  unitPriceCents: number;
  quantity: number;
  /** Itens de balança não são agrupados: cada pesagem é uma linha própria. */
  isWeighable?: boolean;
}

/** Total de uma linha. Arredonda porque peso gera fração de centavo. */
export function lineTotalCents(line: CartLine): number {
  return Math.round(line.unitPriceCents * line.quantity);
}

/** Soma das linhas, antes de desconto. */
export function cartSubtotalCents(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

/** Soma das quantidades (considera peso como 1 unidade por linha de balança). */
export function cartItemCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + (line.isWeighable ? 1 : line.quantity), 0);
}

/**
 * Localiza uma linha compatível para agrupamento.
 * Só agrupa quando o preço unitário é idêntico e o item não é de balança —
 * duas pesagens do mesmo produto têm preços diferentes e não devem se fundir.
 */
export function findMergeableLineIndex(
  cart: CartLine[],
  candidate: Pick<CartLine, 'productId' | 'unitPriceCents' | 'isWeighable'>,
): number {
  if (candidate.isWeighable) return -1;

  return cart.findIndex(
    (line) =>
      !line.isWeighable &&
      line.productId === candidate.productId &&
      line.unitPriceCents === candidate.unitPriceCents,
  );
}

export interface AddLineOptions {
  /**
   * Agrupa com linha igual já existente?
   * - `supermarket-pos` sempre criava uma linha nova → `false` preserva isso.
   * - `pos-terminal` agrupava → `true` preserva isso.
   */
  merge?: boolean;
}

/** Adiciona (ou agrupa) uma linha no carrinho. */
export function addLine(cart: CartLine[], line: CartLine, options: AddLineOptions = {}): CartLine[] {
  const { merge = false } = options;
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return cart;

  if (merge) {
    const index = findMergeableLineIndex(cart, line);
    if (index >= 0) {
      return cart.map((existing, i) =>
        i === index ? { ...existing, quantity: existing.quantity + line.quantity } : existing,
      );
    }
  }

  return [...cart, line];
}

/** Define a quantidade absoluta de uma linha. Quantidade <= 0 remove a linha. */
export function setLineQuantity(cart: CartLine[], index: number, quantity: number): CartLine[] {
  if (index < 0 || index >= cart.length) return cart;
  if (!Number.isFinite(quantity) || quantity <= 0) return removeLine(cart, index);

  return cart.map((line, i) => (i === index ? { ...line, quantity } : line));
}

/** Ajusta a quantidade por delta (ex.: botões +/−). */
export function changeLineQuantity(cart: CartLine[], index: number, delta: number): CartLine[] {
  const line = cart[index];
  if (!line) return cart;
  return setLineQuantity(cart, index, line.quantity + delta);
}

/** Remove uma linha por índice. */
export function removeLine(cart: CartLine[], index: number): CartLine[] {
  if (index < 0 || index >= cart.length) return cart;
  return cart.filter((_, i) => i !== index);
}

/** Esvazia o carrinho. */
export function clearCart(): CartLine[] {
  return [];
}

/**
 * Converte o carrinho no payload esperado por `POST /tenant-app/:slug/orders`.
 * Mantido aqui para que os dois PDVs enviem exatamente o mesmo formato.
 */
export function toOrderItemsPayload(cart: CartLine[]): Array<{
  productId: string;
  quantity: number;
  unitPriceCents: number;
}> {
  return cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
  }));
}
