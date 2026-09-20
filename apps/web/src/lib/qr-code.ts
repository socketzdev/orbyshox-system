/**
 * Codificador QR Code (ISO/IEC 18004) — implementação própria, sem dependência.
 *
 * Por que não usar uma biblioteca: o PDV roda em tablet de balcão com internet
 * instável e o QR do PIX precisa ser gerado **offline**, na hora de fechar a
 * conta. Uma dependência a mais também é um pacote a mais para auditar num
 * sistema que lida com dados fiscais. O payload do PIX é curto (~120 chars) e
 * sempre cabe num QR versão baixa, então só a faixa que importa é implementada.
 *
 * Modo byte (8 bits), nível de correção M, versões 1..10 — cobre com folga o
 * BR Code com nome (25) + cidade (15) + chave (36) + txid (25).
 *
 * Referências dos parâmetros:
 *  - Capacidade de dados em modo byte: 17/32/53/78/106/134/154/192/230/271
 *    (versões 1..10, correção M), já com os 2 bytes de "contagem de caracteres".
 *  - Blocos RS por versão (M): ver tabela `EC_TABLE_M`.
 */

/**
 * Tabela autoritativa por versão, nível M. Cada entrada tem:
 *  - `data` ........ codewords de dados (o que o payload ocupa, já com padding)
 *  - `ecPerBlock` .. codewords de correção por bloco
 *  - `blocks` ...... divisão dos dados em blocos (tamanhos diferentes no fim)
 *
 * Estes números foram extraídos e conferidos contra uma implementação de
 * referência. Escrever de memória foi o erro que custou tempo aqui: a versão 1
 * nível M tem **16** codewords de dados, não 14 — 14 é a quantidade de *bytes
 * de texto* que cabem em modo byte (16 - 1 byte de header - terminador). Usar o
 * número errado produz uma correção Reed-Solomon errada: o QR parece normal e
 * simplesmente não decodifica.
 *
 * `blocks` lista o tamanho de cada bloco (ex.: [4,1] = 4 blocos curtos + 1
 * longo), que é a informação que a intercalação precisa.
 */
const VERSION_TABLE_M: Record<
  number,
  { data: number; ecPerBlock: number; blocks: number[] }
> = {
  1: { data: 16, ecPerBlock: 10, blocks: [1] },
  2: { data: 28, ecPerBlock: 16, blocks: [1] },
  3: { data: 44, ecPerBlock: 26, blocks: [1] },
  4: { data: 64, ecPerBlock: 18, blocks: [2] },
  5: { data: 86, ecPerBlock: 24, blocks: [2] },
  6: { data: 108, ecPerBlock: 16, blocks: [4] },
  7: { data: 124, ecPerBlock: 18, blocks: [4] },
  8: { data: 154, ecPerBlock: 22, blocks: [2, 2] },
  9: { data: 182, ecPerBlock: 22, blocks: [3, 2] },
  10: { data: 216, ecPerBlock: 26, blocks: [4, 1] },
};

/**
 * Capacidade de texto em modo byte (o que o chamador pode passar).
 *
 * = codewords de dados - header (4 bits de modo + 8 ou 16 de tamanho) - até 4
 * bits de terminador, arredondado para baixo. É o número que decide a versão.
 */
function byteCapacity(version: number): number {
  const table = VERSION_TABLE_M[version];
  // Largura do indicador de contagem em modo byte: 8 bits até a versão 9,
  // 16 a partir da 10 (Mode.ccBits = [8, 16, 16]). Errar isso desloca o
  // cabeçalho e a versão escolhida deixa de bater com a referência.
  const charCountBits = version <= 9 ? 8 : 16;
  // Bits disponíveis = codewords de dado × 8, menos o cabeçalho (4 de modo +
  // contagem). O terminador de 4 bits é absorvido pelo arredondamento para
  // baixo — mesma conta de `getCapacity`, sem arredondar o overhead antes.
  const usableBits = table.data * 8 - (4 + charCountBits);
  return Math.floor(usableBits / 8);
}

/** Centro de alinhamento por versão (versão 1 não tem). */
const ALIGNMENT_CENTERS: Record<number, number[]> = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/**
 * Bits de formato (15) para nível M + máscara, calculados por BCH (15,5).
 *
 * São 5 bits de dado — 2 do nível de correção, 3 da máscara — mais 10 bits de
 * correção BCH, com uma máscara XOR fixa para nenhuma combinação resultar em
 * zeros. Calculado em vez de tabelado: uma tabela transcrita à mão é onde o
 * erro de um bit passa despercebido, e um formato errado faz o leitor deduzir
 * outra máscara, decodificando lixo com aparência de QR válido.
 *
 * O valor de 15 bits é escrito **do bit menos significativo para o mais**
 * significativo na matriz (ver `placeFormat`).
 */
function formatBits(mask: number): number {
  // Nível M vale 0b00 nos 2 bits de nível (L=01, M=00, Q=11, H=10).
  const levelBits = 0b00;
  const data = (levelBits << 3) | mask;
  let d = data << 10;

  // G15 = x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
  const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | 1;
  const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

  const bchDigit = (n: number) => {
    let digit = 0;
    while (n !== 0) {
      digit++;
      n >>>= 1;
    }
    return digit;
  };
  const G15_BCH = bchDigit(G15);

  while (bchDigit(d) - G15_BCH >= 0) {
    d ^= G15 << (bchDigit(d) - G15_BCH);
  }

  return ((data << 10) | d) ^ G15_MASK;
}

/** Tabela de Galois GF(256) — construída uma vez. */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

/**
 * Polinômio gerador de grau `degree`: ∏ (x - α^i) para i = 0..degree-1.
 *
 * Os coeficientes são devolvidos do termo de maior grau para o de menor, que é
 * a ordem em que a divisão polinomial de `rsEncode` os consome. Montar na ordem
 * trocada produz codewords de correção erradas — e o dado continua legível à
 * vista, o que torna esse erro difícil de notar sem comparar com uma referência.
 */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    // Multiplica o polinômio atual por (x + α^i) em GF(256), onde "+" é XOR.
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Calcula as `ecCount` codewords de correção de um bloco de dados. */
function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGenerator(ecCount);
  // Divisão polinomial: o resto é a correção.
  const buffer = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buffer[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return buffer.slice(data.length);
}

/**
 * Escolhe a menor versão que cabe no payload. Devolve `null` se passar de 10 —
 * nesse caso o chamador deve encurtar o texto (nome/cidade menores).
 */
export function pickVersion(byteLength: number): number | null {
  for (let v = 1; v <= 10; v++) {
    if (byteLength <= byteCapacity(v)) return v;
  }
  return null;
}

/** Codifica o header + dados em modo byte (8 bits), UTF-8. */
function encodeData(text: string, version: number): number[] {
  const versionBits = version <= 9 ? 8 : 16;
  const bytes = Array.from(new TextEncoder().encode(text));
  const bits: number[] = [];
  const dataCodewords = VERSION_TABLE_M[version].data;

  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // modo byte
  push(bytes.length, versionBits);
  for (const b of bytes) push(b, 8);

  // Terminador e padding até completar os codewords de dados.
  const totalDataBits = dataCodewords * 8;
  const terminator = Math.min(4, totalDataBits - bits.length);
  push(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Bytes de preenchimento alternados, definidos pela norma.
  const padBytes = [0xec, 0x11];
  let p = 0;
  while (codewords.length < dataCodewords) codewords.push(padBytes[p++ % 2]);

  return codewords;
}

/**
 * Divide os dados em blocos, calcula a correção de cada um e intercala tudo
 * na ordem que o decodificador espera (blocos menores primeiro na correção).
 */
function interleave(codewords: number[], version: number): number[] {
  const { ecPerBlock, blocks } = VERSION_TABLE_M[version];
  const totalBlocks = blocks.reduce((a, b) => a + b, 0);
  const totalData = codewords.length;
  const shortBlockSize = Math.floor(totalData / totalBlocks);
  const numLong = totalData % totalBlocks;

  const dataBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < totalBlocks; i++) {
    // Os últimos `numLong` blocos têm 1 codeword a mais.
    const size = shortBlockSize + (i >= totalBlocks - numLong ? 1 : 0);
    dataBlocks.push(codewords.slice(offset, offset + size));
    offset += size;
  }

  const ecBlocks = dataBlocks.map((b) => rsEncode(b, ecPerBlock));

  const result: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

/** Matriz de módulos: `true` = escuro. `null` = ainda não decidido. */
type Matrix = (boolean | null)[][];

/**
 * Constrói a matriz com todos os padrões fixos e retorna o mapa de módulos
 * reservados — os únicos que o percurso de dados pode pular.
 *
 * A ordem importa: primeiro os padrões que ocupam área (localizadores,
 * alinhamento), depois as linhas de sincronismo, e por último as faixas de
 * formato/versão, que reservam módulos mas são preenchidas mais tarde.
 */
function buildBaseMatrix(version: number): { matrix: Matrix; reserved: boolean[][] } {
  const size = version * 4 + 17;
  const matrix: Matrix = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setModule = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    matrix[r][c] = dark;
    reserved[r][c] = true;
  };

  /**
   * Localizador 7x7 + separador. O separador é a moldura clara de 1 módulo em
   * volta; ele conta como reservado mas nunca recebe dado.
   */
  const finder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const isSeparator = r === -1 || r === 7 || c === -1 || c === 7;
        const isOuterRing = r === 0 || r === 6 || c === 0 || c === 6;
        const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(rr, cc, isSeparator ? false : isOuterRing || isCore);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Padrões de alinhamento (5x5), pulando os que colidem com os localizadores.
  const centers = ALIGNMENT_CENTERS[version];
  if (centers) {
    for (const r of centers) {
      for (const c of centers) {
        const nearFinder =
          (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
        if (nearFinder) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setModule(r + dr, c + dc, dark);
          }
        }
      }
    }
  }

  // Sincronismo (timing): linha 6 e coluna 6, alternando, só no miolo.
  // Vem por último entre os padrões para não sobrescrever o localizador.
  for (let i = 8; i <= size - 9; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // ─── Reserva das faixas de formato ────────────────────────────────────────
  // O formato (15 bits) fica em duas cópias. Elas cercam os localizadores
  // superior esquerdo e formam um L no canto inferior esquerdo + superior
  // direito. Os módulos reservados aqui são preenchidos em `placeFormat`.
  //
  // Cópia 1: linha 8 (colunas 0-8) e coluna 8 (linhas 0-8), exceto (6,8)/(8,6)
  //          que pertencem ao sincronismo.
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  // Cópia 2: coluna 8 (linhas size-7..size-1) e linha 8 (colunas size-8..size-1).
  for (let i = 0; i < 8; i++) {
    reserved[size - 1 - i][8] = true;
    reserved[8][size - 1 - i] = true;
  }
  // Módulo escuro obrigatório, logo acima da cópia 2 na coluna 8.
  setModule(size - 8, 8, true);

  // Informação de versão (18 bits) só existe a partir da versão 7, em dois
  // blocos 3x6 acima do localizador inferior esquerdo e à esquerda do superior
  // direito.
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[size - 11 + j][i] = true;
        reserved[i][size - 11 + j] = true;
      }
    }
  }

  return { matrix, reserved };
}

/** Aplica uma das 8 máscaras da norma. */
function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

/**
 * Escreve os codewords na matriz na ordem em zigue-zague.
 *
 * O percurso sobe/desce em pares de colunas da direita para a esquerda,
 * pulando os módulos reservados. A coluna 6 (sincronismo) é pulada movendo o
 * par para a esquerda quando o par cair nela.
 */
function placeData(matrix: Matrix, reserved: boolean[][], codewords: number[], mask: number): void {
  const size = matrix.length;
  const bits: number[] = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  }

  let bitIndex = 0;
  let upward = true;
  // Percorre pares de colunas da direita para a esquerda. A coluna 6
  // (sincronismo) nunca é usada como coluna do par — quando o par a tocaria,
  // ele é deslocado uma posição para a esquerda.
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;

    const left = right - 1;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [right, left]) {
        if (c < 0 || reserved[row][c]) continue;
        // Sem bits restantes o módulo é preenchimento (claro).
        const bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        matrix[row][c] = bit !== maskBit(mask, row, c);
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

/**
 * Grava as duas cópias da informação de formato (15 bits).
 *
 * A disposição segue a norma e é **bit a bit**, começando pelo bit menos
 * significativo (índice 0), não como uma string lida da esquerda para a
 * direita. Escrever na ordem errada desalinha todos os 15 módulos: o leitor
 * recalcula a máscara a partir desses bits, encontra um valor diferente e
 * decodifica lixo — o QR parece perfeito a olho nu.
 *
 * Coordenadas (i = índice do bit, 0 = menos significativo):
 *   vertical ....... i<6 → (i, 8); i<8 → (i+1, 8); senão → (size-15+i, 8)
 *   horizontal ..... i<8 → (8, size-i-1); i=8 → (8, 15-i-1+1); senão → (8, 15-i-1)
 */
function placeFormat(matrix: Matrix, version: number, mask: number): void {
  const size = matrix.length;
  const bits = formatBits(mask);

  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;

    // Cópia vertical (coluna 8).
    if (i < 6) {
      matrix[i][8] = dark;
    } else if (i < 8) {
      matrix[i + 1][8] = dark;
    } else {
      matrix[size - 15 + i][8] = dark;
    }

    // Cópia horizontal (linha 8).
    if (i < 8) {
      matrix[8][size - i - 1] = dark;
    } else if (i < 9) {
      matrix[8][15 - i - 1 + 1] = dark;
    } else {
      matrix[8][15 - i - 1] = dark;
    }
  }

  // Módulo escuro fixo, sempre ligado.
  matrix[size - 8][8] = true;
}

/**
 * Informação de versão (18 bits) para versões ≥ 7, calculada por BCH(18,6).
 *
 * É o equivalente do formato, mas para a versão: 6 bits de dados (a própria
 * versão) + 12 bits de correção, com o polinômio `G18 = 0b1111100100101`.
 * Versões 1–6 não têm esse bloco (a versão cabe no próprio tamanho da matriz).
 *
 * Tal como o formato, é gravada **bit a bit começando pelo menos
 * significativo**, em dois blocos 3x6: um acima do localizador inferior
 * esquerdo e outro à esquerda do superior direito. Esquecer esse bloco faz o
 * QR parecer correto em versões baixas e falhar exatamente a partir da 7 — que
 * é onde o leitor deixa de conseguir inferir a versão pelo tamanho.
 */
function versionInfoBits(version: number): number {
  const G18 = 0b1111100100101;
  const bchDigit = (data: number): number => {
    let digit = 0;
    while (data !== 0) {
      digit++;
      data >>>= 1;
    }
    return digit;
  };

  let value = version << 12;
  while (bchDigit(value) - bchDigit(G18) >= 0) {
    value ^= G18 << (bchDigit(value) - bchDigit(G18));
  }
  return (version << 12) | value;
}

/** Grava as duas cópias da informação de versão (só versão ≥ 7). */
function placeVersionInfo(matrix: Matrix, version: number): void {
  if (version < 7) return;
  const size = matrix.length;
  const bits = versionInfoBits(version);

  for (let i = 0; i < 18; i++) {
    const dark = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = i % 3;

    // Bloco 1: 3 colunas × 6 linhas acima do localizador inferior esquerdo.
    matrix[size - 11 + col][row] = dark;
    // Bloco 2: 3 linhas × 6 colunas à esquerda do localizador superior direito.
    matrix[row][size - 11 + col] = dark;
  }
}

/**
 * Penalidade de uma máscara, com as quatro regras da norma (ISO 18004 §8.8.2).
 *
 * A escolha da máscara não é cosmética: o leitor recalcula a máscara a partir
 * dos bits de formato, mas a norma manda escolher a de menor penalidade — e é
 * isso que as bibliotecas fazem. Uma implementação aproximada escolhe uma
 * máscara diferente e o QR deixa de bater com o que o resto do mundo produz
 * (alguns decodificadores rígidos rejeitam). Por isso as regras abaixo seguem
 * a formulação exata, inclusive nos detalhes:
 *  - N1 = 3 + (run - 5) para sequências de 5+ módulos iguais;
 *  - N2 = 3 por bloco 2x2 uniforme;
 *  - N3 = 40 por padrão 1:1:3:1:1 com 4 claros de um dos lados;
 *  - N4 = 10 por cada faixa de 5% de desvio, com teto (ceil) — não floor.
 */
function maskPenalty(matrix: Matrix): number {
  const size = matrix.length;
  const at = (r: number, c: number) => Boolean(matrix[r][c]);
  const N1 = 3;
  const N2 = 3;
  const N3 = 40;
  const N4 = 10;
  let points = 0;

  // ── N1: sequências horizontais e verticais ───────────────────────────────
  for (let row = 0; row < size; row++) {
    let sameCol = 0;
    let sameRow = 0;
    let lastCol: boolean | null = null;
    let lastRow: boolean | null = null;

    for (let col = 0; col < size; col++) {
      const horizontal = at(row, col);
      if (horizontal === lastCol) {
        sameCol++;
      } else {
        if (sameCol >= 5) points += N1 + (sameCol - 5);
        lastCol = horizontal;
        sameCol = 1;
      }

      const vertical = at(col, row);
      if (vertical === lastRow) {
        sameRow++;
      } else {
        if (sameRow >= 5) points += N1 + (sameRow - 5);
        lastRow = vertical;
        sameRow = 1;
      }
    }
    if (sameCol >= 5) points += N1 + (sameCol - 5);
    if (sameRow >= 5) points += N1 + (sameRow - 5);
  }

  // ── N2: blocos 2x2 da mesma cor ──────────────────────────────────────────
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const sum =
        (at(row, col) ? 1 : 0) +
        (at(row, col + 1) ? 1 : 0) +
        (at(row + 1, col) ? 1 : 0) +
        (at(row + 1, col + 1) ? 1 : 0);
      if (sum === 4 || sum === 0) points += N2;
    }
  }

  // ── N3: padrão 1:1:3:1:1 com 4 claros antes ou depois ────────────────────
  // A janela de 11 bits é comparada como número: 0x5D0 = 10111010000 e
  // 0x05D = 00001011101 — as duas orientações do padrão com a zona clara.
  for (let row = 0; row < size; row++) {
    let bitsCol = 0;
    let bitsRow = 0;
    for (let col = 0; col < size; col++) {
      bitsCol = ((bitsCol << 1) & 0x7ff) | (at(row, col) ? 1 : 0);
      if (col >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) points += N3;

      bitsRow = ((bitsRow << 1) & 0x7ff) | (at(col, row) ? 1 : 0);
      if (col >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) points += N3;
    }
  }

  // ── N4: desequilíbrio entre escuro e claro ───────────────────────────────
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (at(r, c)) dark++;
  const total = size * size;
  // `ceil` e não `floor`: a norma conta cada faixa de 5% iniciada.
  const k = Math.abs(Math.ceil((dark * 100) / total / 5) - 10);
  points += k * N4;

  return points;
}

/**
 * Exportado para os testes poderem verificar o mapa de módulos reservados
 * contra a contagem de bits que a norma exige por versão. Sem isso, um erro
 * de 2 módulos passa despercebido e só aparece no leitor do celular.
 */
export function buildReservedMap(version: number): boolean[][] {
  return buildBaseMatrix(version).reserved;
}

/**
 * Gera a matriz do QR Code. Devolve `null` quando o texto não cabe nas versões
 * suportadas — o chamador reduz o texto em vez de exibir um QR truncado.
 *
 * Ordem das operações (a mesma das implementações de referência):
 *  1. monta padrões fixos e reserva as faixas de formato;
 *  2. escreve os dados e aplica a máscara;
 *  3. grava os bits de formato da máscara candidata;
 *  4. calcula a penalidade e guarda a máscara de menor valor.
 *
 * Detalhe contraintuitivo do passo 3: a penalidade é avaliada **com os bits de
 * formato já gravados**, porque é isso que o símbolo final exibe. Avaliar sem
 * eles (formato zerado) muda o escore de N1/N3 e faz a escolha da máscara
 * divergir — o QR nasce diferente do que qualquer biblioteca do mercado gera.
 *
 * `forceMask` existe para os testes poderem comparar a matriz com a de uma
 * biblioteca de referência máscara a máscara. Em produção nunca é passado.
 */
export function encodeQrMatrix(text: string, forceMask?: number): boolean[][] | null {
  const bytes = new TextEncoder().encode(text).length;
  const version = pickVersion(bytes);
  if (!version) return null;

  const data = encodeData(text, version);
  const finalCodewords = interleave(data, version);

  /** Monta a matriz completa da máscara: dados mascarados + formato. */
  const buildWithMask = (mask: number): Matrix => {
    const { matrix, reserved } = buildBaseMatrix(version);
    placeData(matrix, reserved, finalCodewords, mask);
    placeFormat(matrix, version, mask);
    placeVersionInfo(matrix, version);
    return matrix;
  };

  const chosenMask =
    forceMask ??
    (() => {
      let bestMask = 0;
      let bestPenalty = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        const penalty = maskPenalty(buildWithMask(mask));
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestMask = mask;
        }
      }
      return bestMask;
    })();

  return buildWithMask(chosenMask).map((row) => row.map(Boolean));
}

/**
 * Gera o QR como string SVG pronta para `dangerouslySetInnerHTML`.
 *
 * SVG e não canvas: vetor imprime nítido na bobina térmica e não depende de
 * `devicePixelRatio` do tablet. `quiet` é a margem obrigatória de 4 módulos —
 * sem ela leitores de celular não conseguem focar o código.
 */
export function qrToSvg(
  text: string,
  options: { size?: number; margin?: number; dark?: string; light?: string } = {},
): string | null {
  const matrix = encodeQrMatrix(text);
  if (!matrix) return null;

  const size = options.size ?? 240;
  const quiet = options.margin ?? 4;
  const modules = matrix.length;
  const total = modules + quiet * 2;
  const scale = size / total;
  const dark = options.dark ?? '#000000';
  const light = options.light ?? '#ffffff';

  // Um único <path> com todos os módulos escuros: muito menor que N <rect>.
  let path = '';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (!matrix[r][c]) continue;
      const x = ((c + quiet) * scale).toFixed(2);
      const y = ((r + quiet) * scale).toFixed(2);
      path += `M${x} ${y}h${scale.toFixed(2)}v${scale.toFixed(2)}h-${scale.toFixed(2)}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code PIX"><rect width="${size}" height="${size}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
