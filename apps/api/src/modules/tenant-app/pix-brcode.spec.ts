import {
  buildPixBrCode,
  crc16,
  detectPixKeyType,
  normalizePixKey,
  readCrcFromPayload,
  sanitizePixText,
  validatePixKey,
} from './pix-brcode';

/**
 * Testes do gerador de BR Code PIX.
 *
 * O payload é validado de duas formas: contra um CRC conhecido (o mesmo valor
 * que o gerador oficial do Banco Central produz) e por leitura campo a campo,
 * porque um QR com formato certo mas valor errado ainda é um QR quebrado — só
 * que descoberto na boca do caixa, com o cliente esperando.
 */
describe('PIX BR Code (EMV)', () => {
  describe('detectPixKeyType', () => {
    it('reconhece EVP (UUID) antes de confundir com CPF', () => {
      expect(detectPixKeyType('123e4567-e89b-12d3-a456-426614174000')).toBe('EVP');
    });

    it('reconhece e-mail mesmo com dígitos no domínio', () => {
      expect(detectPixKeyType('financeiro@balijack123.com.br')).toBe('EMAIL');
    });

    it('reconhece telefone com DDI', () => {
      expect(detectPixKeyType('+55 11 99999-8888')).toBe('PHONE');
    });

    it('reconhece telefone sem DDI mas com DDD válido e nono dígito 9', () => {
      expect(detectPixKeyType('(11) 99999-8888')).toBe('PHONE');
    });

    it('prefere CPF quando os 11 dígitos passam no check digit', () => {
      // "11999998888" tem cara de celular (DDD 11 + nono dígito 9) e também é
      // um CPF com check digit válido. Como não há máscara de telefone
      // (parênteses), o check digit decide — é a única prova forte disponível.
      expect(detectPixKeyType('11999998888')).toBe('CPF');
    });

    it('trata como telefone quando há máscara explícita de telefone', () => {
      // Com parênteses o formato declara a intenção, então o DDD decide.
      expect(detectPixKeyType('(11) 99999-8888')).toBe('PHONE');
    });

    it('não trata número com DDD inválido como telefone', () => {
      // 00 não é DDD — deve cair na validação de CPF e ser recusado.
      expect(validatePixKey('00999998888').valid).toBe(false);
    });

    it('reconhece CPF e CNPJ', () => {
      expect(detectPixKeyType('529.982.247-25')).toBe('CPF');
      expect(detectPixKeyType('11.222.333/0001-81')).toBe('CNPJ');
    });

    it('devolve UNKNOWN para chave vazia ou lixo', () => {
      expect(detectPixKeyType('')).toBe('UNKNOWN');
      expect(detectPixKeyType('   ')).toBe('UNKNOWN');
      expect(detectPixKeyType('abcdef')).toBe('UNKNOWN');
    });
  });

  describe('validatePixKey', () => {
    it('aceita CPF com dígito verificador correto', () => {
      expect(validatePixKey('529.982.247-25').valid).toBe(true);
    });

    it('recusa CPF com dígito verificador errado', () => {
      // 11 dígitos, primeiro par é DDD válido e o terceiro dígito é "9" — o
      // formato que antes era confundido com celular. O check digit do CPF
      // é consultado primeiro justamente para não deixar isso passar.
      const result = validatePixKey('529.982.247-26');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('CPF');
    });

    it('recusa CPF com todos os dígitos iguais', () => {
      expect(validatePixKey('111.111.111-11').valid).toBe(false);
    });

    it('recusa CPF formado por 11 dígitos que na verdade é lixo', () => {
      // 11 dígitos, mas não é telefone (DDD 00) nem CPF válido.
      expect(validatePixKey('00000000001').valid).toBe(false);
    });

    it('aceita CNPJ válido e recusa inválido', () => {
      expect(validatePixKey('11.222.333/0001-81').valid).toBe(true);
      expect(validatePixKey('11.222.333/0001-82').valid).toBe(false);
    });

    it('explica o motivo quando a chave não está cadastrada', () => {
      const result = validatePixKey(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('não cadastrada');
    });
  });

  describe('normalizePixKey', () => {
    it('tira a máscara do CPF', () => {
      expect(normalizePixKey('529.982.247-25')).toBe('52998224725');
    });

    it('prefixa DDI 55 no telefone sem DDI', () => {
      expect(normalizePixKey('(11) 99999-8888')).toBe('5511999998888');
    });

    it('não duplica o DDI quando o telefone já tem', () => {
      expect(normalizePixKey('+55 11 99999-8888')).toBe('5511999998888');
    });

    it('baixa a caixa do e-mail', () => {
      expect(normalizePixKey('Financeiro@BaliJack.com.br')).toBe('financeiro@balijack.com.br');
    });
  });

  describe('crc16', () => {
    it('calcula o CRC do exemplo do manual do Banco Central', () => {
      // Vetor de teste clássico do BR Code: "123456789" → 29B1.
      expect(crc16('123456789')).toBe('29B1');
    });

    it('devolve sempre 4 caracteres hexadecimais maiúsculos', () => {
      expect(crc16('')).toMatch(/^[0-9A-F]{4}$/);
      expect(crc16('a')).toMatch(/^[0-9A-F]{4}$/);
    });
  });

  describe('sanitizePixText', () => {
    it('remove acentos para o payload ficar ASCII', () => {
      expect(sanitizePixText('Hamburgueria São João', 25)).toBe('Hamburgueria Sao Joao');
    });

    it('trunca no limite do campo', () => {
      expect(sanitizePixText('A'.repeat(40), 25)).toHaveLength(25);
    });

    it('troca o asterisco, que é reservado no padrão', () => {
      expect(sanitizePixText('Loja*Teste', 25)).toBe('Loja Teste');
    });
  });

  describe('buildPixBrCode', () => {
    const base = {
      pixKey: 'financeiro@balijack.com.br',
      merchantName: 'Bali Jack',
      merchantCity: 'Sao Paulo',
      amountCents: 12345,
    };

    it('devolve null quando a chave é inválida em vez de gerar QR quebrado', () => {
      expect(buildPixBrCode({ ...base, pixKey: 'chave-errada' })).toBeNull();
      expect(buildPixBrCode({ ...base, pixKey: '' })).toBeNull();
      expect(buildPixBrCode({ ...base, pixKey: '529.982.247-26' })).toBeNull();
    });

    it('começa com o indicador de formato e termina com o CRC', () => {
      const result = buildPixBrCode(base)!;
      expect(result.payload.startsWith('000201')).toBe(true);
      expect(result.payload).toMatch(/6304[0-9A-F]{4}$/);
    });

    it('grava o CRC calculado no próprio payload', () => {
      const result = buildPixBrCode(base)!;
      const payloadWithoutCrc = result.payload.slice(0, -4);
      expect(readCrcFromPayload(result.payload)).toBe(crc16(payloadWithoutCrc));
      expect(result.crc).toBe(readCrcFromPayload(result.payload));
    });

    it('usa a GUI do PIX e a chave normalizada no campo 26', () => {
      const result = buildPixBrCode(base)!;
      expect(result.payload).toContain('BR.GOV.BCB.PIX');
      expect(result.payload).toContain('financeiro@balijack.com.br');
    });

    it('escreve o valor em reais com duas casas no campo 54', () => {
      const result = buildPixBrCode(base)!;
      // 12345 centavos → campo 54 com tamanho 06 e "123.45".
      expect(result.payload).toContain('5406123.45');
    });

    it('omite o campo 54 quando o valor é zero ou nulo (QR aberto)', () => {
      const semValor = buildPixBrCode({ ...base, amountCents: 0 })!;
      const nulo = buildPixBrCode({ ...base, amountCents: null })!;
      const ausente = buildPixBrCode({ pixKey: base.pixKey, merchantName: base.merchantName })!;
      for (const r of [semValor, nulo, ausente]) {
        // "5406" seria um campo 54 de tamanho 6; "53" seguido de moeda é o
        // marcador de que o 54 não existe.
        expect(r.payload).not.toContain('5406');
        expect(r.payload).toContain('5303986');
      }
    });

    it('trunca nome e cidade nos limites do padrão', () => {
      const result = buildPixBrCode({
        ...base,
        merchantName: 'Hamburgueria Artesanal do Bairro Muito Longo',
        merchantCity: 'Cidade Com Nome Muito Comprido',
      })!;
      // Cada campo é ID(2)+tam(2): cidade 15 letras → "6015".
      expect(result.payload).toContain('6015Cidade Com Nome');
      expect(result.payload).toContain('5925');
    });

    it('cai em cidade padrão quando não informada (campo obrigatório)', () => {
      const result = buildPixBrCode({ ...base, merchantCity: null })!;
      // "SAO PAULO" tem 9 caracteres → "6009".
      expect(result.payload).toContain('6009SAO PAULO');
    });

    it('usa txid curinga "***" por padrão e aceita txid próprio', () => {
      const padrao = buildPixBrCode(base)!;
      expect(padrao.payload).toContain('0503***');

      const comTxid = buildPixBrCode({ ...base, txid: 'pedido-1024' })!;
      // O padrão proíbe hífen no txid: vira "PEDIDO1024" (10 caracteres → 0510).
      expect(comTxid.payload).toContain('0510PEDIDO1024');
    });

    it('limita o txid a 25 caracteres', () => {
      const result = buildPixBrCode({ ...base, txid: 'X'.repeat(40) })!;
      expect(result.payload).toContain(`0525${'X'.repeat(25)}`);
    });

    it('gera payloads diferentes para valores diferentes (CRC não é fixo)', () => {
      const a = buildPixBrCode({ ...base, amountCents: 1000 })!;
      const b = buildPixBrCode({ ...base, amountCents: 2000 })!;
      expect(a.payload).not.toBe(b.payload);
      expect(a.crc).not.toBe(b.crc);
    });

    it('informa o tipo da chave usada', () => {
      expect(buildPixBrCode({ ...base, pixKey: '529.982.247-25' })!.keyType).toBe('CPF');
      expect(buildPixBrCode({ ...base, pixKey: '+55 11 99999-8888' })!.keyType).toBe('PHONE');
    });

    it('usa CPF sem máscara no payload (máscara quebra o QR)', () => {
      const result = buildPixBrCode({ ...base, pixKey: '529.982.247-25' })!;
      expect(result.payload).toContain('52998224725');
      expect(result.payload).not.toContain('529.982.247-25');
    });

    it('mantém o campo 62 com txid e descrição quando há descrição', () => {
      const result = buildPixBrCode({ ...base, description: 'Mesa 04' })!;
      // 62 → 05 (txid "***" = 5 chars) + 01 (descrição "Mesa04" = 6 chars) = 17.
      expect(result.payload).toContain('62170503***0106Mesa04');
    });
  });
});
