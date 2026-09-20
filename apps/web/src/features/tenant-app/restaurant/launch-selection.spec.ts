import { describe, it, expect } from 'vitest';
import {
  buildLaunchSelection,
  launchTotalCents,
  setLaunchQty,
  toLaunchPayload,
  MAX_LAUNCH_QTY,
} from './launch-selection';

const menu = [
  {
    id: 'cat-1',
    name: 'Hambúrgueres',
    products: [
      { id: 'p1', name: 'X-Burger', salePriceCents: 2500 },
      { id: 'p2', name: 'X-Bacon', salePriceCents: 3200 },
    ],
  },
  {
    id: 'cat-2',
    name: 'Bebidas',
    products: [{ id: 'p3', name: 'Refrigerante', salePriceCents: 800 }],
  },
];

describe('setLaunchQty', () => {
  it('adiciona o produto quando não está na seleção', () => {
    expect(setLaunchQty({}, 'p1', 1)).toEqual({ p1: 1 });
  });

  it('ajusta a quantidade de um item já selecionado', () => {
    expect(setLaunchQty({ p1: 1 }, 'p1', 3)).toEqual({ p1: 3 });
  });

  it('remove quando a quantidade chega a zero ou negativa', () => {
    expect(setLaunchQty({ p1: 1 }, 'p1', 0)).toEqual({});
    expect(setLaunchQty({ p1: 2 }, 'p1', -1)).toEqual({});
  });

  it('não altera os demais itens', () => {
    expect(setLaunchQty({ p1: 2, p2: 1 }, 'p1', 5)).toEqual({ p1: 5, p2: 1 });
  });

  it('limita a quantidade ao teto', () => {
    expect(setLaunchQty({}, 'p1', 500).p1).toBe(MAX_LAUNCH_QTY);
  });

  it('ignora quantidade inválida', () => {
    expect(setLaunchQty({}, 'p1', Number.NaN)).toEqual({});
  });

  it('não muta o objeto original', () => {
    const original = { p1: 1 };
    setLaunchQty(original, 'p1', 9);
    expect(original).toEqual({ p1: 1 });
  });
});

describe('buildLaunchSelection', () => {
  it('resolve produto e quantidade a partir do mapa', () => {
    const lines = buildLaunchSelection({ p1: 2 }, menu);
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe('p1');
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].product.name).toBe('X-Burger');
  });

  it('aceita produtos de categorias diferentes', () => {
    const lines = buildLaunchSelection({ p1: 1, p3: 2 }, menu);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.productId).sort()).toEqual(['p1', 'p3']);
  });

  it('ignora quantidade zero ou negativa', () => {
    expect(buildLaunchSelection({ p1: 0 }, menu)).toEqual([]);
    expect(buildLaunchSelection({ p1: -3 }, menu)).toEqual([]);
  });

  it('ignora produto que não existe no cardápio', () => {
    // Produto removido do cardápio não pode ir para a cozinha.
    expect(buildLaunchSelection({ inexistente: 2 }, menu)).toEqual([]);
  });

  it('seleção vazia gera lista vazia', () => {
    expect(buildLaunchSelection({}, menu)).toEqual([]);
  });
});

describe('launchTotalCents', () => {
  it('soma quantidade x preço de cada linha', () => {
    const lines = buildLaunchSelection({ p1: 2, p3: 3 }, menu);
    // 2x 25,00 + 3x 8,00 = 50,00 + 24,00 = 74,00
    expect(launchTotalCents(lines)).toBe(7400);
  });

  it('lista vazia totaliza zero', () => {
    expect(launchTotalCents([])).toBe(0);
  });

  it('produto sem preço não quebra a soma', () => {
    const lines = [{ productId: 'x', quantity: 2, product: { name: 'Sem preço' } }];
    expect(launchTotalCents(lines)).toBe(0);
  });
});

describe('toLaunchPayload', () => {
  it('produz apenas productId e quantity', () => {
    const lines = buildLaunchSelection({ p1: 2, p2: 1 }, menu);
    expect(toLaunchPayload(lines)).toEqual([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ]);
  });

  it('não vaza o objeto do produto no payload', () => {
    const lines = buildLaunchSelection({ p1: 1 }, menu);
    expect(Object.keys(toLaunchPayload(lines)[0]).sort()).toEqual(['productId', 'quantity']);
  });
});
