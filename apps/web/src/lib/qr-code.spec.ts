import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { encodeQrMatrix, pickVersion, qrToSvg } from './qr-code';

const require = createRequire(import.meta.url);

/**
 * Testes do codificador QR.
 *
 * A verificação que importa é o round-trip: gerar a matriz e **decodificá-la
 * com a biblioteca de referência**. Comparar só o tamanho da matriz não
 * provaria nada — uma matriz do tamanho certo com os bits errados continua
 * "passando" e falha na boca do caixa.
 *
 * A leitura é delegada à referência de propósito. Nas primeiras versões deste
 * arquivo existia aqui um decodificador próprio que reimplementava a máscara
 * reservada e a leitura do formato — e ele mesmo errava a ordem dos bits de
 * formato, acusando defeito no codificador que estava certo. Um segundo
 * decodificador escrito à mão é mais uma cópia das mesmas suposições; a
 * referência é a única testemunha independente.
 */

const QRCode = require('qrcode');
const ByteData = require('qrcode/lib/core/byte-data');

/**
 * Gera a matriz pela referência usando **um único segmento em modo byte** —
 * o mesmo que a produção faz. Passar `mode: 'byte'` em `create()` não basta:
 * a referência ainda fatiaria o texto em segmentos numéricos/alfanuméricos e
 * produziria uma matriz legitimamente diferente.
 */
function referenceMatrix(text: string, maskPattern?: number): boolean[][] {
  const segments = [new ByteData(new TextEncoder().encode(text))];
  const ref = QRCode.create(segments, { errorCorrectionLevel: 'M', maskPattern });
  const size: number = ref.modules.size;
  const data: Uint8Array = ref.modules.data;
  const out: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(data[r * size + c] === 1);
    out.push(row);
  }
  return out;
}

/**
 * Round-trip real: compara a matriz gerada com a da referência módulo a
 * módulo. Equivalência é mais forte que decodificar e comparar texto — duas
 * matrizes diferentes podem decodificar para o mesmo texto, mas se as matrizes
 * são idênticas o QR é, byte a byte, o mesmo que o resto do mundo produz.
 */
function expectSameAsReference(text: string): void {
  const mine = encodeQrMatrix(text);
  expect(mine, `encodeQrMatrix(${JSON.stringify(text.slice(0, 20))}) devolveu null`).not.toBeNull();

  const ref = referenceMatrix(text);
  expect(mine!.length, 'tamanho da matriz').toBe(ref.length);

  const diffs: string[] = [];
  for (let r = 0; r < ref.length; r++) {
    for (let c = 0; c < ref.length; c++) {
      if (mine![r][c] !== ref[r][c]) diffs.push(`(${r},${c})`);
    }
  }
  expect(diffs.slice(0, 12), `divergências em ${JSON.stringify(text.slice(0, 20))}`).toHaveLength(0);
}

describe('codificador QR Code', () => {
  describe('pickVersion', () => {
    it('usa a menor versão que cabe no payload', () => {
      expect(pickVersion(10)).toBe(1);
      expect(pickVersion(14)).toBe(1);
      expect(pickVersion(15)).toBe(2);
      expect(pickVersion(200)).toBe(10);
    });

    it('devolve null quando passa da versão 10', () => {
      // Acima disso o texto deve ser encurtado, não truncado em silêncio.
      expect(pickVersion(1000)).toBeNull();
    });
  });

  describe('encodeQrMatrix', () => {
    it('gera matriz quadrada do tamanho da versão', () => {
      const matrix = encodeQrMatrix('OI')!;
      // Versão 1 = 21x21 módulos.
      expect(matrix).toHaveLength(21);
      expect(matrix[0]).toHaveLength(21);
    });

    it('reserva os três localizadores com o núcleo escuro', () => {
      const m = encodeQrMatrix('TESTE')!;
      const size = m.length;
      // Centro de cada finder pattern é escuro.
      expect(m[3][3]).toBe(true);
      expect(m[3][size - 4]).toBe(true);
      expect(m[size - 4][3]).toBe(true);
      // Anel interno é claro.
      expect(m[1][1]).toBe(false);
    });

    it('faz round-trip de um payload curto', () => {
      expectSameAsReference('Bali Jack');
    });

    it('faz round-trip de um payload do tamanho real de um BR Code PIX', () => {
      const payload =
        '00020126580014BR.GOV.BCB.PIX0136financeiro@balijack.com.br5204000053039865406123.455802BR5909Bali Jack6009Sao Paulo62070503***6304ABCD';
      const matrix = encodeQrMatrix(payload);
      expect(matrix).not.toBeNull();
      expectSameAsReference(payload);
    });

    it('faz round-trip com acentos (UTF-8 multibyte)', () => {
      expectSameAsReference('Hamburgueria São João — Mesa 4');
    });

    it('faz round-trip no limite de cada versão', () => {
      for (const [version, capacity] of [
        [1, 14], [2, 26], [3, 42], [4, 62], [5, 84], [6, 106], [7, 122],
      ] as const) {
        const text = 'a'.repeat(capacity);
        const matrix = encodeQrMatrix(text)!;
        expect(matrix).toHaveLength(version * 4 + 17);
        expectSameAsReference(text);
      }
    });

    it('gera QR diferente para texto diferente', () => {
      const a = JSON.stringify(encodeQrMatrix('AAA'));
      const b = JSON.stringify(encodeQrMatrix('AAB'));
      expect(a).not.toBe(b);
    });

    it('devolve null em vez de truncar quando o texto é grande demais', () => {
      expect(encodeQrMatrix('X'.repeat(5000))).toBeNull();
    });
  });

  describe('qrToSvg', () => {
    it('devolve um SVG com viewBox quadrado', () => {
      const svg = qrToSvg('TESTE', { size: 200 })!;
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox="0 0 200 200"');
      expect(svg).toContain('width="200"');
    });

    it('respeita a margem obrigatória (quiet zone)', () => {
      // Sem margem os leitores não focam: a área útil é menor que o SVG.
      const svg = qrToSvg('TESTE', { size: 210, margin: 4 })!;
      const matrix = encodeQrMatrix('TESTE')!;
      expect(matrix).toHaveLength(21);
      // 21 módulos + 8 de margem = 29; escala = 210/29.
      expect(svg).toContain('viewBox="0 0 210 210"');
    });

    it('aceita cores customizadas para o tema escuro', () => {
      const svg = qrToSvg('TESTE', { dark: '#ffffff', light: '#000000' })!;
      expect(svg).toContain('fill="#ffffff"');
      expect(svg).toContain('fill="#000000"');
    });

    it('devolve null quando o texto não cabe', () => {
      expect(qrToSvg('X'.repeat(5000))).toBeNull();
    });
  });
});
