import {
  normalizeTriggerTypes,
  pickPrimaryTrigger,
  serializeTriggerTypes,
  readTriggerTypes,
  isTriggerType,
} from './task-triggers';

describe('task-triggers', () => {
  describe('isTriggerType', () => {
    it('aceita os 4 momentos válidos', () => {
      expect(isTriggerType('TIME')).toBe(true);
      expect(isTriggerType('BEFORE_OPENING')).toBe(true);
      expect(isTriggerType('AFTER_LUNCH')).toBe(true);
      expect(isTriggerType('AFTER_CLOSING')).toBe(true);
    });

    it('rejeita valores desconhecidos', () => {
      expect(isTriggerType('AFTER_PARTY')).toBe(false);
      expect(isTriggerType('')).toBe(false);
      expect(isTriggerType(null)).toBe(false);
      expect(isTriggerType(42)).toBe(false);
      expect(isTriggerType(undefined)).toBe(false);
    });
  });

  describe('normalizeTriggerTypes — múltipla escolha', () => {
    it('mantém vários momentos na ordem de seleção', () => {
      expect(normalizeTriggerTypes(['BEFORE_OPENING', 'TIME'])).toEqual([
        'BEFORE_OPENING',
        'TIME',
      ]);
    });

    it('preserva os 4 momentos simultaneamente', () => {
      const all = ['TIME', 'BEFORE_OPENING', 'AFTER_LUNCH', 'AFTER_CLOSING'];
      expect(normalizeTriggerTypes(all)).toEqual(all);
    });

    it('remove repetidos preservando a ordem', () => {
      expect(normalizeTriggerTypes(['TIME', 'TIME', 'AFTER_LUNCH', 'TIME'])).toEqual([
        'TIME',
        'AFTER_LUNCH',
      ]);
    });

    it('descarta valores inválidos sem derrubar os válidos', () => {
      expect(normalizeTriggerTypes(['TIME', 'LIXO', null, 'AFTER_CLOSING', 7])).toEqual([
        'TIME',
        'AFTER_CLOSING',
      ]);
    });

    it('aceita valor único solto (compatibilidade)', () => {
      expect(normalizeTriggerTypes('AFTER_CLOSING')).toEqual(['AFTER_CLOSING']);
    });
  });

  describe('normalizeTriggerTypes — garantias', () => {
    it('nunca devolve lista vazia: cai no fallback', () => {
      expect(normalizeTriggerTypes(undefined, 'AFTER_LUNCH')).toEqual(['AFTER_LUNCH']);
      expect(normalizeTriggerTypes([], 'BEFORE_OPENING')).toEqual(['BEFORE_OPENING']);
    });

    it('usa TIME quando não há nem lista nem fallback válidos', () => {
      expect(normalizeTriggerTypes(undefined)).toEqual(['TIME']);
      expect(normalizeTriggerTypes([], 'INVALIDO')).toEqual(['TIME']);
      expect(normalizeTriggerTypes(['X'], null)).toEqual(['TIME']);
    });

    it('lista válida tem prioridade sobre o fallback', () => {
      expect(normalizeTriggerTypes(['AFTER_LUNCH'], 'TIME')).toEqual(['AFTER_LUNCH']);
    });
  });

  describe('pickPrimaryTrigger', () => {
    it('prefere TIME por ser o mais informativo sozinho', () => {
      expect(pickPrimaryTrigger(['AFTER_CLOSING', 'TIME'])).toBe('TIME');
    });

    it('sem TIME, usa o primeiro da lista', () => {
      expect(pickPrimaryTrigger(['AFTER_LUNCH', 'AFTER_CLOSING'])).toBe('AFTER_LUNCH');
    });

    it('com lista vazia, cai no padrão', () => {
      expect(pickPrimaryTrigger([])).toBe('TIME');
    });

    it('sempre devolve um dos momentos válidos', () => {
      const cases = [['TIME'], ['BEFORE_OPENING'], ['AFTER_LUNCH', 'AFTER_CLOSING']];
      for (const c of cases) {
        expect(isTriggerType(pickPrimaryTrigger(c as any))).toBe(true);
      }
    });
  });

  describe('serializeTriggerTypes', () => {
    it('grava null com um só momento (triggerType já basta)', () => {
      expect(serializeTriggerTypes(['TIME'])).toBeNull();
    });

    it('grava JSON array com vários momentos', () => {
      expect(serializeTriggerTypes(['TIME', 'AFTER_CLOSING'])).toBe('["TIME","AFTER_CLOSING"]');
    });

    it('round-trip preserva a lista', () => {
      const origem = ['BEFORE_OPENING', 'TIME', 'AFTER_LUNCH'] as const;
      const json = serializeTriggerTypes(origem);
      expect(json).not.toBeNull();
      expect(normalizeTriggerTypes(JSON.parse(json as string))).toEqual([...origem]);
    });
  });

  describe('readTriggerTypes — compatibilidade com dados antigos', () => {
    it('lê o formato novo (JSON com vários)', () => {
      expect(
        readTriggerTypes({ triggerTypes: '["AFTER_CLOSING","TIME"]', triggerType: 'TIME' }),
      ).toEqual(['AFTER_CLOSING', 'TIME']);
    });

    it('lê o formato novo já como array (DTO)', () => {
      expect(readTriggerTypes({ triggerTypes: ['AFTER_LUNCH'] })).toEqual(['AFTER_LUNCH']);
    });

    it('cai no triggerType antigo quando triggerTypes é null', () => {
      expect(readTriggerTypes({ triggerTypes: null, triggerType: 'AFTER_CLOSING' })).toEqual([
        'AFTER_CLOSING',
      ]);
    });

    it('cai no triggerType antigo quando a coluna nem existe', () => {
      expect(readTriggerTypes({ triggerType: 'BEFORE_OPENING' })).toEqual(['BEFORE_OPENING']);
    });

    it('não quebra com JSON corrompido — usa o fallback', () => {
      expect(readTriggerTypes({ triggerTypes: '{corrompido', triggerType: 'AFTER_LUNCH' })).toEqual(
        ['AFTER_LUNCH'],
      );
    });

    it('não quebra com linha totalmente vazia', () => {
      expect(readTriggerTypes({})).toEqual(['TIME']);
    });
  });
});
