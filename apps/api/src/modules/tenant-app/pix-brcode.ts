/**
 * Gerador de BR Code PIX (padrão EMV® QRCPS-MPM) — lógica pura, sem I/O.
 *
 * Por que um módulo separado: o payload é uma string posicional onde cada
 * caractere errado invalida o pagamento no banco. Isolar em funções puras
 * permite testar cada campo (CRC, truncamento de nome, valor zero) sem subir
 * servidor nem banco.
 *
 * Estrutura do payload (IDs EMV):
 *   00 Payload Format Indicator ......... "01"
 *   26 Merchant Account Information ..... GUI "BR.GOV.BCB.PIX" + chave
 *   52 Merchant Category Code ........... "0000"
 *   53 Transaction Currency ............. "986" (BRL)
 *   54 Transaction Amount ............... opcional, "123.45"
 *   58 Merchant Country ................. "BR"
 *   59 Merchant Name .................... máx. 25
 *   60 Merchant City .................... máx. 15
 *   62 Additional Data Field ............. txid (máx. 25)
 *   63 CRC16 ............................ obrigatório, último campo
 *
 * Regra específica do PIX: `txid` = "***" significa cobrança de uso único
 * (o PSP gera o identificador). É o valor correto para venda presencial, porque
 * reutilizar um txid fixo faz o banco recusar a segunda cobrança.
 */

/** Tamanho máximo do nome do recebedor no padrão. */
export const PIX_MERCHANT_NAME_MAX = 25;
/** Tamanho máximo da cidade do recebedor no padrão. */
export const PIX_MERCHANT_CITY_MAX = 15;
/** Tamanho máximo do txid. */
export const PIX_TXID_MAX = 25;
/** Código da moeda brasileira (ISO 4217 numérico). */
const BRL_CURRENCY_CODE = '986';
/** País fixo do arranjo PIX. */
const BR_COUNTRY_CODE = 'BR';
/** GUI do arranjo PIX no Banco Central. */
const PIX_GUI = 'BR.GOV.BCB.PIX';
/** Txid curinga: "cobrança não identificada", o PSP gera. */
export const PIX_WILDCARD_TXID = '***';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP' | 'UNKNOWN';

/**
 * Tira a formatação dos dígitos mas mantém a distinção entre CPF e telefone.
 *
 * Aqui mora a ambiguidade real do PIX: "11999998888" é um CPF formado só por
 * dígitos **e** um telefone sem DDI. A desambiguação é pelo DDD — um número de
 * telefone tem os dois primeiros dígitos entre 11 e 99, e nenhum CPF válido
 * começa com um DDD (os DDDs usados no Brasil começam em 11 e o primeiro bloco
 * de CPF emitido nunca forma um DDD válido na prática).
 *
 * A ordem testada é: primeiro o que tem um formato que os dígitos não podem
 * imitar (e-mail, UUID), depois a decisão por tamanho.
 */
export function detectPixKeyType(raw: string | null | undefined): PixKeyType {
  const key = (raw ?? '').trim();
  if (!key) return 'UNKNOWN';

  // E-mail primeiro: tem "@" e é impossível confundir com dígitos.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return 'EMAIL';

  // EVP: UUID v4 (8-4-4-4-12). Testado antes de CPF porque também tem dígitos
  // e hífens.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return 'EVP';
  }

  const digits = key.replace(/\D/g, '');

  if (digits.length === 11) {
    // 11 dígitos: CPF puro ou telefone sem DDI. A ordem importa.
    // Telefone vem primeiro porque a máscara de CPF é reconhecível: um CPF
    // formatado tem pontos, e um telefone formatado tem parênteses. Só quando
    // não há pista de formato é que o check digit decide.
    //
    // O nono dígito (sempre "9" em celular) desempatava "11 999998888" a favor
    // de telefone, mas também capturava CPFs como "529.982.247-26" — o "9" da
    // terceira posição não é DDD, é parte do CPF. Por isso o check digit do CPF
    // é consultado PRIMEIRO: nenhum CPF válido colide com a faixa de DDDs reais.
    if (isValidCpf(digits)) return 'CPF';

    const looksMaskedAsPhone = /[()]/.test(key);
    const ddd = Number(digits.slice(0, 2));
    const isMobile = digits[2] === '9';
    if (looksMaskedAsPhone && ddd >= 11 && ddd <= 99 && isMobile) return 'PHONE';

    return 'CPF';
  }

  if (digits.length === 14) return 'CNPJ';

  // Telefone com DDI: 12 = fixo, 13 = celular.
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) {
      const ddd = Number(digits.slice(2, 4));
      if (ddd >= 11 && ddd <= 99) return 'PHONE';
    }
    return 'UNKNOWN';
  }

  return 'UNKNOWN';
}

/** Valida CPF pelo dígito verificador (rejeita sequências repetidas). */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

/** Valida CNPJ pelo dígito verificador (rejeita sequências repetidas). */
function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    let pos = len - 7;
    let sum = 0;
    for (let i = len; i >= 1; i--) {
      sum += Number(digits[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const result = sum % 11;
    return result < 2 ? 0 : 11 - result;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

/**
 * Normaliza a chave para o formato que o BR Code exige:
 *  - CPF/CNPJ ....... só dígitos, sem máscara
 *  - Telefone ....... DDI 55 + DDD + número, sem símbolos
 *  - E-mail ......... como digitado (minúsculas)
 *  - EVP ............ minúsculo
 */
export function normalizePixKey(raw: string | null | undefined): string {
  const key = (raw ?? '').trim();
  if (!key) return '';
  switch (detectPixKeyType(key)) {
    case 'CPF':
    case 'CNPJ':
      return key.replace(/\D/g, '');
    case 'PHONE': {
      const digits = key.replace(/\D/g, '');
      // Se já veio com DDI, mantém; senão prefixa 55.
      return digits.length >= 12 && digits.startsWith('55') ? digits : `55${digits}`;
    }
    case 'EMAIL':
    case 'EVP':
      return key.toLowerCase();
    default:
      return key;
  }
}

/**
 * Diz se a chave é utilizável. Chave ausente ou com dígito verificador errado
 * derruba o QR — melhor bloquear a tela do que mostrar um QR que o cliente
 * não consegue pagar.
 */
export function validatePixKey(raw: string | null | undefined): { valid: boolean; type: PixKeyType; reason?: string } {
  const key = (raw ?? '').trim();
  if (!key) return { valid: false, type: 'UNKNOWN', reason: 'Chave PIX não cadastrada.' };

  const type = detectPixKeyType(key);
  if (type === 'UNKNOWN') {
    return {
      valid: false,
      type,
      reason: 'Chave PIX inválida. Use CPF, CNPJ, e-mail, telefone com DDD ou chave aleatória.',
    };
  }

  const digits = key.replace(/\D/g, '');
  // CPF com check digit errado cai em CPF pelo tamanho; aqui é onde ele é
  // barrado de verdade (senão viraria um QR que o banco recusa).
  if (type === 'CPF' && !isValidCpf(digits)) {
    return { valid: false, type, reason: 'CPF inválido (dígito verificador não confere).' };
  }
  if (type === 'CNPJ' && !isValidCnpj(digits)) {
    return { valid: false, type, reason: 'CNPJ inválido (dígito verificador não confere).' };
  }

  return { valid: true, type };
}

/** Monta um campo EMV: ID (2) + tamanho (2, zero-padded) + valor. */
function field(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * CRC16/CCITT-FALSE — polinômio 0x1021, init 0xFFFF, sem reflexão.
 * É o algoritmo exigido pelo campo 63 do BR Code.
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Limpa um texto para o padrão, que é ASCII puro.
 *
 * Sem isso, "Hamburgueria São João" vira bytes multibyte no payload e alguns
 * apps leem o comprimento errado, recusando o QR. O asterisco é removido
 * porque é o curinga do txid.
 */
export function sanitizePixText(raw: string | null | undefined, maxLength: number): string {
  const cleaned = (raw ?? '')
    .normalize('NFD')
    // Remove marcas de acentuação (categoria Unicode "Mn").
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, ' ')
    // Mantém só ASCII imprimível.
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength).trim();
}

export interface PixBrCodeInput {
  /** Chave PIX do recebedor (qualquer formato aceito). */
  pixKey: string;
  /** Nome do recebedor (loja). Truncado em 25. */
  merchantName: string;
  /** Cidade do recebedor. Truncada em 15. */
  merchantCity?: string | null;
  /** Valor em centavos. `null`/`0`/ausente gera QR de valor aberto (cliente digita). */
  amountCents?: number | null;
  /** Identificador da cobrança. Default "***" (uso único, PSP gera). */
  txid?: string | null;
  /** Descrição livre — vira o "01" do campo 62. */
  description?: string | null;
}

export interface PixBrCodeResult {
  /** Payload copia-e-cola completo. */
  payload: string;
  /** Só o CRC, útil para depurar. */
  crc: string;
  /** Tipo detectado da chave. */
  keyType: PixKeyType;
}

/**
 * Gera o payload "copia e cola" do PIX. É a mesma string que se codifica no QR.
 *
 * Devolve `null` quando a chave é inválida em vez de lançar: o chamador decide
 * se esconde o QR ou mostra um aviso, e a tela de pagamento não quebra por causa
 * de um cadastro incompleto.
 */
export function buildPixBrCode(input: PixBrCodeInput): PixBrCodeResult | null {
  const check = validatePixKey(input.pixKey);
  if (!check.valid) return null;

  const key = normalizePixKey(input.pixKey);
  const merchantName = sanitizePixText(input.merchantName, PIX_MERCHANT_NAME_MAX) || 'RECEBEDOR';
  // Cidade tem default porque o campo é obrigatório no padrão e muitos
  // cadastros não preenchem: sem ele o QR fica inválido.
  const merchantCity = sanitizePixText(input.merchantCity, PIX_MERCHANT_CITY_MAX) || 'SAO PAULO';

  // Campo 26: GUI + chave. A ordem importa — o parser lê sequencialmente.
  const merchantAccount = field('00', PIX_GUI) + field('01', key);

  const amount = Number(input.amountCents ?? 0);
  const hasAmount = Number.isFinite(amount) && amount > 0;

  // O txid aceita só alfanuméricos: letras, números e até 25 caracteres.
  const txid =
    sanitizePixText(input.txid ?? PIX_WILDCARD_TXID, PIX_TXID_MAX)
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, PIX_TXID_MAX) || PIX_WILDCARD_TXID;

  // Campo 62: "05" txid (obrigatório) + "01" descrição (opcional).
  const description = sanitizePixText(input.description, 40).replace(/\s/g, '');
  const additionalData = field('05', txid) + (description ? field('01', description) : '');

  const withoutCrc =
    field('00', '01') +
    field('26', merchantAccount) +
    field('52', '0000') +
    field('53', BRL_CURRENCY_CODE) +
    (hasAmount ? field('54', (amount / 100).toFixed(2)) : '') +
    field('58', BR_COUNTRY_CODE) +
    field('59', merchantName) +
    field('60', merchantCity) +
    field('62', additionalData) +
    '6304';

  const crc = crc16(withoutCrc);
  return { payload: `${withoutCrc}${crc}`, crc, keyType: check.type };
}

/**
 * Extrai o valor do campo 63 de um payload — usado nos testes para provar que
 * o CRC calculado é o que está escrito no fim da string.
 */
export function readCrcFromPayload(payload: string): string {
  const match = payload.match(/6304([0-9A-F]{4})$/);
  return match ? match[1] : '';
}
