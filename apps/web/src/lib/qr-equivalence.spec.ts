import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { encodeQrMatrix, pickVersion } from './qr-code';

const require = createRequire(import.meta.url);

/**
 * Prova de equivalência contra a biblioteca de referência.
 *
 * Um único payload passando não prova um codificador QR: máscara, versão,
 * intercalação e correção só são exercitadas de verdade quando o conteúdo
 * varia de tamanho e cruza os limites de versão. Estes casos cobrem os dez
 * tamanhos que a implementação suporta, do payload de 1 byte ao de 200.
 *
 * O modo é fixado em `byte`: a referência escolhe sozinha o modo mais compacto
 * (alfanumérico, para texto só com maiúsculas), e comparar byte contra
 * alfanumérico gera divergência que não é defeito de nenhum dos dois — só de
 * um teste mal montado. Como o BR Code do PIX é sempre byte, é esse o modo que
 * precisa estar provado.
 */
describe('equivalência com a referência (múltiplos payloads)', () => {
  const QRCode = require('qrcode');
  const ByteData = require('qrcode/lib/core/byte-data');

  const byteLength = (text: string) => new TextEncoder().encode(text).length;

  /** Compara módulo a módulo e devolve a lista de divergências. */
  const compare = (text: string, maskPattern?: number) => {
    // Um único segmento em modo byte é obrigatório aqui: passar
    // `mode: Mode.BYTE` em `create()` NÃO força o modo — a referência ainda
    // roda o otimizador de segmentos e fatia o BR Code em Numeric +
    // Alphanumeric + Byte. Aí ela escolhe a versão 7 onde o modo byte puro
    // precisa da 8, e a comparação acusa divergência que não é defeito de
    // nenhum dos dois. O BR Code do PIX, na prática, é sempre byte puro
    // (o PSP não garante que o payload seja só numérico).
    const segments = [new ByteData(new TextEncoder().encode(text))];
    const ref = QRCode.create(segments, {
      errorCorrectionLevel: 'M',
      maskPattern,
    });
    const size: number = ref.modules.size;
    const data: Uint8Array = ref.modules.data;
    const refVersion: number = ref.version;
    const myVersion = pickVersion(byteLength(text));
    if (myVersion !== refVersion) {
      return { mismatchSize: true as const, size, mine: myVersion, ref: refVersion };
    }
    // O mesmo `maskPattern` precisa ir para os dois lados: comparar a matriz
    // automática contra uma referência com máscara forçada acusa 984
    // divergências num QR de 49x49 — praticamente a matriz inteira.
    const mine = encodeQrMatrix(text, maskPattern)!;
    if (mine.length !== size) return { mismatchSize: true as const, size, mine: mine.length };

    const diffs: string[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (mine[r][c] !== (data[r * size + c] === 1)) diffs.push(`(${r},${c})`);
      }
    }
    return { version: ref.version, mask: ref.maskPattern, diffs };
  };

  const payloads: Array<[string, string]> = [
    ['1 byte', 'a'],
    ['texto curto', 'Bali Jack'],
    ['BR Code PIX real', '00020126580014BR.GOV.BCB.PIX0136financeiro@balijack.com.br5204000053039865406123.455802BR5909Bali Jack6009Sao Paulo62070503***6304ABCD'],
    ['acentos UTF-8', 'Hamburgueria São João — Mesa 4'],
    ['cidade longa truncada', '00020126580014BR.GOV.BCB.PIX0136financeiro@balijack.com.br5204000053039865406123.455802BR5925Hamburgueria Artesanal6009Sao Paulo62070503***6304ABCD'],
    ['limite v1 (14 bytes)', 'a'.repeat(14)],
    ['início v2 (15 bytes)', 'a'.repeat(15)],
    ['limite v2 (26 bytes)', 'a'.repeat(26)],
    ['v3 (42 bytes)', 'a'.repeat(42)],
    ['v5 (84 bytes)', 'a'.repeat(84)],
    ['v7 (122 bytes)', 'a'.repeat(122)],
    ['v8 (152 bytes)', 'a'.repeat(152)],
    ['v10 (213 bytes)', 'a'.repeat(213)],
  ];

  it.each(payloads)('matriz idêntica: %s', (_label, text) => {
    const result = compare(text);
    if ('mismatchSize' in result) {
      throw new Error(`${_label}: versão minha=v${result.mine} ref=v${result.ref}`);
    }
    if ('diffs' in result) {
      if (result.diffs.length) {
        console.log(`${_label}: v${result.version} máscara ${result.mask} diffs=${result.diffs.length}`, result.diffs.slice(0, 10));
      }
      expect(result.diffs).toHaveLength(0);
    }
  });

  it('matriz idêntica com a máscara forçada, nas 8 máscaras', () => {
    const text = '00020126580014BR.GOV.BCB.PIX0136financeiro@balijack.com.br5204000053039865406123.455802BR5909Bali Jack6009Sao Paulo62070503***6304ABCD';
    for (let mask = 0; mask < 8; mask++) {
      const result = compare(text, mask);
      if ('mismatchSize' in result) {
        throw new Error(`máscara ${mask}: versão minha=v${result.mine} ref=v${result.ref}`);
      }
      expect(result.diffs, `máscara ${mask}`).toHaveLength(0);
    }
  });
});
