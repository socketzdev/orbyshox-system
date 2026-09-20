/**
 * Lógica pura do lote de lançamento do garçom.
 *
 * Ficou fora do componente para poder ser testada: é aqui que se decide o que
 * vai para a cozinha e por qual valor. Um erro nessa montagem significa cobrar
 * errado do cliente ou lançar na mesa errada — então não pode depender de eu
 * ter aberto a tela para conferir.
 */

export interface LaunchLine {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface LaunchResolvedLine extends LaunchLine {
  product: any;
}

/** Quantidade máxima por item, para travar digitação/Toque errado. */
export const MAX_LAUNCH_QTY = 99;

/**
 * Ajusta a quantidade de um produto no lote.
 * Quantidade <= 0 remove o item (em vez de deixar uma linha com zero).
 */
export function setLaunchQty(
  selection: Record<string, number>,
  productId: string,
  qty: number,
): Record<string, number> {
  const next = { ...selection };
  const key = String(productId);
  const value = Math.floor(Number(qty));

  if (!Number.isFinite(value) || value <= 0) {
    delete next[key];
    return next;
  }

  next[key] = Math.min(MAX_LAUNCH_QTY, value);
  return next;
}

/** Resolve o mapa (productId -> qtd) em linhas com o produto completo. */
export function buildLaunchSelection(
  selection: Record<string, number>,
  menu: any[],
  notesMap?: Record<string, string>,
): LaunchResolvedLine[] {
  const lines: LaunchResolvedLine[] = [];

  for (const [productId, qty] of Object.entries(selection)) {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    // O cardápio vem agrupado por categoria; o produto pode estar em qualquer uma.
    let product: any = null;
    for (const category of menu || []) {
      product = (category?.products || []).find((p: any) => String(p?.id) === String(productId));
      if (product) break;
    }
    // Também aceita lista plana de produtos.
    if (!product) {
      product = (menu || []).find((p: any) => String(p?.id) === String(productId) && p?.name);
    }
    if (!product) continue;

    const notes = String(notesMap?.[String(productId)] || '').trim();
    lines.push({
      productId: String(productId),
      quantity,
      product,
      ...(notes ? { notes } : {}),
    });
  }

  return lines;
}

/** Total do lote em centavos. */
export function launchTotalCents(lines: LaunchResolvedLine[]): number {
  return lines.reduce(
    (acc, { product, quantity }) => acc + (Number(product?.salePriceCents) || 0) * quantity,
    0,
  );
}

/** Payload enviado ao backend (um único pedido com vários itens). */
export function toLaunchPayload(lines: LaunchResolvedLine[]): LaunchLine[] {
  return lines.map(({ productId, quantity, notes }) => {
    const line: LaunchLine = { productId, quantity };
    // Só inclui a chave quando há obs: sem obs o formato é idêntico ao antigo.
    if (notes && String(notes).trim()) line.notes = String(notes).trim();
    return line;
  });
}
