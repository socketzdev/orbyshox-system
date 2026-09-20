import { describe, expect, it } from 'vitest';
import { buildReservedMap } from './qr-code';

/**
 * Verificação estrutural: a quantidade de módulos livres para dados tem de
 * bater exatamente com a capacidade que a norma define por versão.
 *
 * Este é o teste que pega o erro mais fácil de cometer ao escrever um
 * codificador à mão — reservar 2 módulos a menos (ou a mais). O QR continua
 * parecendo um QR, o leitor do celular simplesmente não decodifica.
 */
describe('estrutura da matriz QR', () => {
  /** Codewords totais (dados + correção) por versão no nível M. */
  const TOTAL_CODEWORDS_M: Record<number, number> = {
    1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346,
  };

  it('reserva exatamente os módulos que sobram para dados, versões 1..10', () => {
    for (let version = 1; version <= 10; version++) {
      const size = version * 4 + 17;
      const reserved = buildReservedMap(version);

      expect(reserved).toHaveLength(size);
      for (const row of reserved) expect(row).toHaveLength(size);

      let free = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) if (!reserved[r][c]) free++;
      }

      // Módulos livres = bits de dados + bits de correção + os "remainder bits"
      // (0-7 módulos de sobra que a norma deixa em branco no fim da matriz).
      const expectedBits = TOTAL_CODEWORDS_M[version] * 8;
      const remainder = free - expectedBits;
      expect(remainder).toBeGreaterThanOrEqual(0);
      expect(remainder).toBeLessThan(8);
      // Os remainder bits são conhecidos: versões 2-6 têm 7, 1 e 7 têm 0.
      expect([0, 7]).toContain(remainder);
    }
  });

  it('marca os três localizadores, o sincronismo e o módulo escuro fixo', () => {
    const version = 1;
    const size = version * 4 + 17;
    const reserved = buildReservedMap(version);

    // Cantos dos localizadores.
    for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      expect(reserved[r][c]).toBe(true);
    }
    // Linha/coluna de sincronismo no miolo.
    expect(reserved[6][10]).toBe(true);
    expect(reserved[10][6]).toBe(true);
    // Módulo escuro obrigatório.
    expect(reserved[size - 8][8]).toBe(true);
    // Faixa de formato na linha 8 e coluna 8.
    expect(reserved[8][0]).toBe(true);
    expect(reserved[0][8]).toBe(true);
  });
});
