import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';

/** Status aceitos para um lote. Antes qualquer string era gravada. */
const BATCH_STATUSES = ['ACTIVE', 'EXPIRED', 'CONSUMED', 'DISCARDED'] as const;

@Injectable()
export class BatchesService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  private async getTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" não encontrado`);
    return tenant;
  }

  async list(slug: string, query: any = {}) {
    const tenant = await this.getTenant(slug);
    const where: any = { tenantId: tenant.id };
    if (query.status) where.status = query.status;
    if (query.expiringDays) {
      const limit = new Date();
      limit.setDate(limit.getDate() + Number(query.expiringDays));
      where.expiryDate = { lte: limit, gte: new Date() };
      where.status = 'ACTIVE';
    }
    if (query.productId) where.productId = query.productId;

    return this.prisma.stockBatch.findMany({
      where,
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'desc' }],
      include: {
        product: { select: { id: true, name: true, sku: true, barcode: true, unit: true, salePriceCents: true } },
        nfeEntry: { select: { id: true, accessKey: true, nfeNumber: true, issueDate: true } },
        purchaseOrder: { select: { id: true, status: true } },
      },
    });
  }

  async stats(slug: string) {
    const tenant = await this.getTenant(slug);
    const now = new Date();
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);

    const [critical, warning, total, active] = await Promise.all([
      this.prisma.stockBatch.count({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
          expiryDate: { lte: in7, gte: now },
        },
      }),
      this.prisma.stockBatch.count({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
          expiryDate: { gt: in7, lte: in30 },
        },
      }),
      this.prisma.stockBatch.count({ where: { tenantId: tenant.id } }),
      this.prisma.stockBatch.count({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
      }),
    ]);
    return { critical, warning, total, active };
  }

  /**
   * Atualiza um lote.
   *
   * C8: antes alterava `quantity` sem tocar em `product.stockQuantity` e sem
   * gravar Kardex — o lote é uma segunda fonte de verdade para a mesma
   * quantidade, então o estoque ficava permanentemente divergente do somatório
   * dos lotes. Agora o delta é aplicado ao produto e registrado no Kardex.
   */
  async update(slug: string, id: string, data: any, operatorId?: string) {
    const tenant = await this.getTenant(slug);
    const batch = await this.prisma.stockBatch.findFirst({ where: { id, tenantId: tenant.id } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    if (data.status !== undefined && !BATCH_STATUSES.includes(data.status)) {
      throw new BadRequestException(
        `Status inválido: ${data.status}. Aceitos: ${BATCH_STATUSES.join(', ')}.`,
      );
    }

    let expiryDate: Date | null | undefined;
    if (data.expiryDate !== undefined) {
      if (data.expiryDate === null) {
        expiryDate = null;
      } else {
        const parsed = new Date(data.expiryDate);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException('Data de validade inválida');
        }
        expiryDate = parsed;
      }
    }

    let newQuantity: number | undefined;
    if (data.quantity !== undefined) {
      newQuantity = Number(data.quantity);
      if (!Number.isFinite(newQuantity) || newQuantity < 0) {
        throw new BadRequestException('Quantidade do lote não pode ser negativa');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (newQuantity !== undefined && newQuantity !== batch.quantity) {
        const delta = newQuantity - batch.quantity;

        const product = await tx.product.findFirst({
          where: { id: batch.productId, tenantId: tenant.id },
          select: { id: true, stockQuantity: true, name: true },
        });
        if (!product) throw new NotFoundException('Produto do lote não encontrado');

        // Ajustar um lote não pode deixar o estoque do produto negativo.
        if (Number(product.stockQuantity) + delta < 0) {
          throw new BadRequestException(
            `Ajuste deixaria o estoque de "${product.name}" negativo (atual ${product.stockQuantity}, variação ${delta}).`,
          );
        }

        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: { increment: delta } },
          select: { stockQuantity: true },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            type: 'ADJUSTMENT',
            quantity: delta,
            balanceAfter: Number(updatedProduct.stockQuantity),
            referenceId: batch.id,
            operatorId: operatorId ?? null,
            notes: `Ajuste manual do lote ${batch.lotNumber} (${batch.quantity} → ${newQuantity})`,
          },
        });
      }

      const updated = await tx.stockBatch.update({
        where: { id },
        data: {
          status: data.status ?? undefined,
          quantity: newQuantity ?? undefined,
          expiryDate: expiryDate ?? undefined,
        },
      });

      // Trilha obrigatória (achado C8): sem `before`/`after` a edição
      // sobrescrevia o dado sem deixar histórico de quem mudou o quê.
      await this.audit.recordChangeSafe({
        userId: operatorId,
        action: 'STOCK_BATCH_UPDATE',
        targetType: 'StockBatch',
        targetId: id,
        before: { status: batch.status, quantity: batch.quantity, expiryDate: batch.expiryDate },
        after: { status: updated.status, quantity: updated.quantity, expiryDate: updated.expiryDate },
      });

      return updated;
    });
  }

  /**
   * Remove um lote.
   *
   * C8: antes o delete deixava `product.stockQuantity` inflado. Agora o saldo
   * remanescente do lote é baixado do produto e registrado no Kardex.
   */
  async remove(slug: string, id: string, operatorId?: string) {
    const tenant = await this.getTenant(slug);
    const batch = await this.prisma.stockBatch.findFirst({ where: { id, tenantId: tenant.id } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    return this.prisma.$transaction(async (tx) => {
      const remaining = Number(batch.quantity) || 0;

      if (remaining > 0) {
        const product = await tx.product.findFirst({
          where: { id: batch.productId, tenantId: tenant.id },
          select: { id: true, stockQuantity: true, name: true },
        });
        if (!product) throw new NotFoundException('Produto do lote não encontrado');

        if (Number(product.stockQuantity) < remaining) {
          throw new BadRequestException(
            `Não é possível remover o lote: o estoque atual de "${product.name}" (${product.stockQuantity}) é menor que a quantidade do lote (${remaining}).`,
          );
        }

        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: { decrement: remaining } },
          select: { stockQuantity: true },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            type: 'ADJUSTMENT',
            quantity: -remaining,
            balanceAfter: Number(updatedProduct.stockQuantity),
            referenceId: batch.id,
            operatorId: operatorId ?? null,
            notes: `Exclusão do lote ${batch.lotNumber}`,
          },
        });
      }

      await tx.stockBatch.delete({ where: { id } });

      // Exclusão não tem "depois": guardar o conteúdo do lote apagado é a
      // única forma de reconstituí-lo depois.
      await this.audit.recordChangeSafe({
        userId: operatorId,
        action: 'STOCK_BATCH_DELETE',
        targetType: 'StockBatch',
        targetId: id,
        before: {
          lotNumber: batch.lotNumber,
          productId: batch.productId,
          quantity: remaining,
          expiryDate: batch.expiryDate,
          status: batch.status,
        },
        after: null,
      });

      return { ok: true, releasedQuantity: remaining };
    });
  }
}
