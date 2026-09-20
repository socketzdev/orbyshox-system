import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Campos que NUNCA entram na trilha.
 *
 * A trilha é lida por suporte e auditoria; guardar hash de senha, segredo de
 * 2FA ou PIN de gerente ali seria criar um segundo vazamento para resolver o
 * primeiro.
 */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'twoFactorSecret',
  'managerPin',
  'apiKeyCipher',
  'nfceCscToken',
  'refreshToken',
  'token',
  'tokenHash',
]);

function redact(value: Record<string, any> | null | undefined) {
  if (!value) return value ?? null;
  const out: Record<string, any> = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] = REDACTED_FIELDS.has(key) ? '[REDACTED]' : raw;
  }
  return out;
}

/**
 * Diferença campo a campo entre dois estados.
 *
 * Retorna apenas o que mudou — uma trilha que registra o objeto inteiro em
 * toda edição é ruído: o revisor precisa achar a linha que importa no meio de
 * trinta campos iguais.
 */
export function diffFields(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (REDACTED_FIELDS.has(key)) continue;
    const a = before[key];
    const b = after[key];
    const same =
      a instanceof Date || b instanceof Date
        ? new Date(a).getTime() === new Date(b).getTime()
        : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (!same) changed.push(key);
  }
  return changed.sort();
}

export interface RecordChangeInput {
  userId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  reason?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async findAll(query: any) {
    const { page = 1, limit = 50, userId, action, targetType, targetId, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: Number(skip),
        take: Number(limit),
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createLog(data: { userId: string; action: string; targetType?: string; targetId?: string; metadata?: any; ipAddress?: string }) {
    return this.prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        metadata: typeof data.metadata === 'string' ? data.metadata : data.metadata ? JSON.stringify(data.metadata) : null,
        ipAddress: data.ipAddress,
      },
    });
  }

  /**
   * Registra uma alteração com estado ANTERIOR e POSTERIOR.
   *
   * É a peça que faltava do achado C8: até aqui o `AuditInterceptor` gravava
   * apenas `{ method, url }`, então uma edição sobrescrevia o dado sem deixar
   * rastro do valor antigo. O formato do `metadata` é estável e documentado:
   *
   *   { before, after, fields, reason }
   *
   * `before`/`after` trazem só os campos relevantes da operação (não o registro
   * inteiro), e valores sensíveis saem como `[REDACTED]`.
   */
  async recordChange(input: RecordChangeInput) {
    const before = redact(input.before);
    const after = redact(input.after);
    const fields = diffFields(before, after);

    const metadata = {
      before,
      after,
      fields,
      reason: input.reason ?? null,
    };

    // Sem usuário identificado não há trilha atribuível — e uma trilha anônima
    // é pior que nenhuma, porque parece cobertura sem ser.
    if (!input.userId) {
      return null;
    }

    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: JSON.stringify(metadata),
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  /**
   * Igual a `recordChange`, mas nunca derruba a operação de negócio.
   *
   * Usar quando a escrita de negócio já foi concluída e falhar a trilha não
   * deve reverter o resultado (ex.: pagamento já gravado).
   */
  async recordChangeSafe(input: RecordChangeInput) {
    try {
      return await this.recordChange(input);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[audit] falha ao registrar trilha de alteração', {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        error,
      });
      return null;
    }
  }
}
