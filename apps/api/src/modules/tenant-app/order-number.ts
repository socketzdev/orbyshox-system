import { Logger } from '@nestjs/common';

const logger = new Logger('OrderNumber');

/** Código Prisma para violação de constraint única. */
const P2002 = 'P2002';

/** Quantas vezes regenerar o número antes de desistir. */
const MAX_ATTEMPTS = 5;

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === P2002
  );
}

/** Leitor do maior `orderNumber` do tenant. Injetado para funcionar dentro de `tx`. */
export type ReadMaxOrderNumber = () => Promise<number | null>;

export interface CreateWithOrderNumberOptions {
  /** Nome do fluxo, usado só em log. */
  context?: string;
}

/**
 * Executa uma criação de pedido com numeração sequencial por tenant, resistente
 * a concorrência.
 *
 * O padrão anterior era `MAX(orderNumber) + 1` seguido de `create`. Duas
 * gravações concorrentes (duas sincronizações offline, ou um sync simultâneo a
 * uma venda no PDV) liam o mesmo máximo e produziam o **mesmo número** — e como
 * `orderNumber` não tinha constraint, o banco aceitava em silêncio.
 *
 * Agora existe `@@unique([tenantId, orderNumber])`: a segunda gravação falha
 * com P2002, este wrapper regenera o número e tenta de novo. A constraint é o
 * que torna o retry possível; o retry é o que torna a operação correta.
 *
 * @param readMax    Lê o maior número atual. Deve usar o mesmo `tx` da criação.
 * @param create     Efetiva a criação com o número recebido.
 */
export async function createWithOrderNumber<T>(
  readMax: ReadMaxOrderNumber,
  create: (orderNumber: number) => Promise<T>,
  options: CreateWithOrderNumberOptions = {},
): Promise<T> {
  const context = options.context ?? 'pedido';
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const currentMax = await readMax();
    const orderNumber = (currentMax ?? 100) + 1;

    try {
      return await create(orderNumber);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      lastError = error;
      logger.warn(
        `Colisão de orderNumber (${context}) na tentativa ${attempt}/${MAX_ATTEMPTS} — regenerando.`,
      );
    }
  }

  logger.error(`Não foi possível gerar orderNumber único para ${context} após ${MAX_ATTEMPTS} tentativas.`);
  throw lastError;
}
