/**
 * Regras dos "momentos de execução" de uma tarefa/rotina — lado da API.
 *
 * Espelha `apps/web/src/features/tenant-app/tasks/task-triggers.ts`. Os dois
 * arquivos precisam concordar; se um mudar, o outro muda junto.
 *
 * O modelo antigo aceitava UM momento (`triggerType`). O novo aceita vários
 * (`triggerTypes`, JSON array), mantendo `triggerType` como o momento
 * PRINCIPAL — é ele que alimenta listagens, filtros e o fallback das tarefas
 * já existentes.
 *
 * Decisão de produto: vários momentos NÃO multiplicam a tarefa. A rotina
 * continua sendo UMA, e o rótulo combina as partes. Ver o arquivo do front
 * para o raciocínio completo.
 */

export const TRIGGER_TYPES = ['TIME', 'BEFORE_OPENING', 'AFTER_LUNCH', 'AFTER_CLOSING'] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const DEFAULT_TRIGGER_TYPE: TriggerType = 'TIME';

export function isTriggerType(value: unknown): value is TriggerType {
  return typeof value === 'string' && (TRIGGER_TYPES as readonly string[]).includes(value);
}

/**
 * Normaliza a lista de momentos escolhidos.
 * Sempre devolve pelo menos 1 item; remove repetidos preservando a ordem;
 * descarta valores desconhecidos; cai no fallback (antigo `triggerType`)
 * quando a lista vier vazia.
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
 * O momento principal gravado em `triggerType`.
 * `TIME` tem prioridade por ser o mais informativo quando exibido sozinho.
 */
export function pickPrimaryTrigger(types: readonly TriggerType[]): TriggerType {
  const list = types.length > 0 ? types : [DEFAULT_TRIGGER_TYPE];
  if (list.includes('TIME')) return 'TIME';
  return list[0];
}

/**
 * Serializa para a coluna `triggerTypes`.
 * `null` quando há só um momento: nesse caso `triggerType` já basta e não
 * gravamos redundância.
 */
export function serializeTriggerTypes(types: readonly TriggerType[]): string | null {
  if (types.length <= 1) return null;
  return JSON.stringify(types);
}

/**
 * Lê os momentos de uma linha vinda do banco, aceitando o formato novo
 * (`triggerTypes` como JSON ou array) e o antigo (`triggerType`).
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
      parsed = null; // JSON corrompido: usa fallback em vez de estourar
    }
  }

  return normalizeTriggerTypes(parsed, row?.triggerType);
}
