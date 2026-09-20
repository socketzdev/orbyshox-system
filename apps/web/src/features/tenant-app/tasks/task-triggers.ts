/**
 * Regras dos "momentos de execução" de uma tarefa/rotina.
 *
 * O modelo antigo aceitava UM único momento (`triggerType`). O novo aceita
 * vários (`triggerTypes`, JSON array), mantendo `triggerType` como o momento
 * PRINCIPAL — é ele que continua alimentando listagens, filtros e o fallback
 * de tarefas antigas.
 *
 * Decisão de produto: marcar vários momentos NÃO multiplica a tarefa. A rotina
 * continua sendo UMA só, e o rótulo exibido combina as partes (ex: "Horário
 * fixo 22:30 + Após o fechamento"). Marcar "Após o fechamento" e "Horário
 * fixo" significa "essa rotina pertence a esses dois momentos do dia", não
 * "crie duas tarefas" — duplicar inflaria a lista do funcionário e ainda
 * exigiria decidir qual das duas cópias foi concluída.
 */

export const TRIGGER_TYPES = ['TIME', 'BEFORE_OPENING', 'AFTER_LUNCH', 'AFTER_CLOSING'] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const DEFAULT_TRIGGER_TYPE: TriggerType = 'TIME';

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  TIME: 'Horário fixo',
  BEFORE_OPENING: 'Antes da abertura',
  AFTER_LUNCH: 'Após o almoço',
  AFTER_CLOSING: 'Após o fechamento',
};

export function isTriggerType(value: unknown): value is TriggerType {
  return typeof value === 'string' && (TRIGGER_TYPES as readonly string[]).includes(value);
}

/**
 * Normaliza a lista de momentos escolhidos.
 *
 * Garantias:
 *  - sempre devolve uma lista com pelo menos 1 item (nunca vazia);
 *  - remove repetidos preservando a ordem de seleção;
 *  - descarta valores desconhecidos (payload adulterado / dado legado);
 *  - quando vazio, cai no `fallback` (o antigo `triggerType`) e, se este
 *    também for inválido, em `DEFAULT_TRIGGER_TYPE`.
 */
export function normalizeTriggerTypes(input: unknown, fallback?: unknown): TriggerType[] {
  const raw = Array.isArray(input) ? input : input == null ? [] : [input];

  const seen = new Set<TriggerType>();
  const result: TriggerType[] = [];
  for (const item of raw) {
    if (isTriggerType(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  if (result.length > 0) return result;
  if (isTriggerType(fallback)) return [fallback];
  return [DEFAULT_TRIGGER_TYPE];
}

/**
 * O momento "principal", gravado em `triggerType` por compatibilidade.
 *
 * Preferência: um horário concreto (`TIME`) é o mais informativo para exibir
 * sozinho; entre os demais, mantém a ordem de declaração do dia.
 */
export function pickPrimaryTrigger(types: readonly TriggerType[]): TriggerType {
  const list = types.length > 0 ? types : [DEFAULT_TRIGGER_TYPE];
  if (list.includes('TIME')) return 'TIME';
  return list[0];
}

/**
 * Serializa para a coluna `triggerTypes` (JSON array).
 * Devolve `null` quando há só um momento — assim `triggerType` basta e não
 * gravamos redundância no banco.
 */
export function serializeTriggerTypes(types: readonly TriggerType[]): string | null {
  if (types.length <= 1) return null;
  return JSON.stringify(types);
}

/**
 * Lê a lista de momentos de uma tarefa vinda do banco, aceitando:
 *  - `triggerTypes` como JSON array (formato novo);
 *  - `triggerTypes` já como array (vindo de um DTO);
 *  - ausência/invalidade, caindo em `triggerType` (formato antigo).
 */
export function readTriggerTypes(row: {
  triggerTypes?: unknown;
  triggerType?: unknown;
}): TriggerType[] {
  let parsed: unknown = row?.triggerTypes;

  if (typeof parsed === 'string' && parsed.trim()) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null; // JSON corrompido: cai no fallback, não quebra a tela
    }
  }

  return normalizeTriggerTypes(parsed, row?.triggerType);
}

/**
 * Rótulo completo e legível do momento de execução.
 *
 * Com um momento: "Após o fechamento · 22:30" (mantém o formato antigo).
 * Com vários: "Horário fixo 22:30 + Após o fechamento + Antes da abertura".
 * O horário acompanha apenas `TIME`, porque é o único que o utiliza.
 */
export function describeTrigger(
  types: readonly TriggerType[],
  dueTime?: string | null,
): string {
  const list = normalizeTriggerTypes(types);
  const withTime = (t: TriggerType) => {
    if (t !== 'TIME') return TRIGGER_LABELS[t];
    return dueTime ? `${TRIGGER_LABELS.TIME} ${dueTime}` : TRIGGER_LABELS.TIME;
  };

  if (list.length === 1) {
    const single = list[0];
    if (single === 'TIME') return dueTime || 'Horário livre';
    return dueTime ? `${TRIGGER_LABELS[single]} · ${dueTime}` : TRIGGER_LABELS[single];
  }

  return list.map(withTime).join(' + ');
}

/**
 * Resumo curto para telas apertadas (cards, listas compactas).
 * Ex: "Fixo 22:30 + Fechamento".
 */
export function describeTriggerShort(
  types: readonly TriggerType[],
  dueTime?: string | null,
): string {
  const list = normalizeTriggerTypes(types);

  if (list.length === 1) {
    const single = list[0];
    if (single === 'TIME') return dueTime ? `Fixo ${dueTime}` : 'Horário livre';
    return SHORT_LABELS[single];
  }

  return list
    .map((t) => (t === 'TIME' && dueTime ? `Fixo ${dueTime}` : SHORT_LABELS[t]))
    .join(' + ');
}

const SHORT_LABELS: Record<TriggerType, string> = {
  TIME: 'Fixo',
  BEFORE_OPENING: 'Abertura',
  AFTER_LUNCH: 'Almoço',
  AFTER_CLOSING: 'Fechamento',
};
