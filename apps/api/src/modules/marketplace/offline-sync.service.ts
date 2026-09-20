import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createWithOrderNumber } from '../tenant-app/order-number';
import { normalizePaymentMethod } from '../tenant-app/payment-method';

/**
 * Fila de sincronização de vendas feitas offline.
 *
 * Correções aplicadas nesta revisão (ver AUDITORIA-MARKETPLACE.md):
 *  - C1: a baixa de estoque não filtrava por tenant. O `productId` vem de um
 *        payload enviado pelo cliente, então era possível decrementar o estoque
 *        de outro inquilino. Agora o produto é resolvido dentro do tenant.
 *  - C2: não havia idempotência. O pedido era criado e só depois o item era
 *        marcado como SYNCED; uma queda no meio recriava o pedido e repetia a
 *        baixa. Agora pedido + baixa + marcação acontecem na mesma transação.
 *        O `enqueue` também deixou de reabrir itens já SYNCED.
 *  - C3: `MAX(orderNumber) + 1` gerava números repetidos sob concorrência.
 *  - H4: a baixa de estoque não gravava Kardex (as vendas online gravam).
 *  - H5: não havia verificação de saldo — o estoque podia ficar negativo.
 */
@Injectable()
export class OfflineSyncService {
  private readonly logger = new Logger(OfflineSyncService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async enqueue(tenantId: string, items: Array<{ clientId: string; kind: string; payload: string }>) {
    const created: any[] = [];
    for (const it of items) {
      // Não sobrescreve item já sincronizado: reenviar um lote antigo do cliente
      // não pode reprocessar uma venda já concluída.
      const existing = await this.prisma.offlineSyncQueue.findUnique({
        where: { tenantId_clientId: { tenantId, clientId: it.clientId } },
        select: { id: true, status: true },
      });

      if (existing?.status === 'SYNCED') {
        created.push(existing);
        continue;
      }

      const row = await this.prisma.offlineSyncQueue.upsert({
        where: { tenantId_clientId: { tenantId, clientId: it.clientId } },
        create: { tenantId, clientId: it.clientId, kind: it.kind, payload: it.payload, status: 'PENDING' },
        update: { kind: it.kind, payload: it.payload, status: 'PENDING', error: null },
      });
      created.push(row);
    }
    return created;
  }

  async process(tenantId: string) {
    const pending = await this.prisma.offlineSyncQueue.findMany({
      where: { tenantId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const results: any[] = [];

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload || '{}');

        // Tudo numa transação: se a gravação falhar, o item continua PENDING e
        // o retry é seguro — nada foi aplicado pela metade.
        await this.prisma.$transaction(async (tx) => {
          if (item.kind === 'ORDER') {
            await this.applyOrder(tx, tenantId, payload);
          }

          await tx.offlineSyncQueue.update({
            where: { id: item.id },
            data: { status: 'SYNCED', syncedAt: new Date(), error: null },
          });
        });

        results.push({ clientId: item.clientId, status: 'SYNCED' });
      } catch (err: any) {
        // Marcar FAILED é best-effort: se isto falhar, o item segue PENDING e
        // será retentado — preferível a perdê-lo.
        await this.prisma.offlineSyncQueue
          .update({
            where: { id: item.id },
            data: { status: 'FAILED', error: err?.message || 'Erro' },
          })
          .catch(() => undefined);

        this.logger.warn(`Falha ao sincronizar ${item.clientId}: ${err?.message}`);
        results.push({ clientId: item.clientId, status: 'FAILED', error: err?.message });
      }
    }

    return results;
  }

  async list(tenantId: string) {
    return this.prisma.offlineSyncQueue.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async applyOrder(tx: any, tenantId: string, payload: any) {
    if (!payload.items?.length) return;

    await createWithOrderNumber(
      async () => {
        const last = await tx.order.findFirst({
          where: { tenantId },
          orderBy: { orderNumber: 'desc' },
          select: { orderNumber: true },
        });
        return last?.orderNumber ?? null;
      },
      async (orderNumber) => {
        let subtotal = 0;
        for (const it of payload.items) {
          subtotal += Math.round((it.unitPrice || 0) * (it.quantity || 0));
        }
        const discount = Number(payload.discountCents) || 0;
        const total = Math.max(0, subtotal - discount);

        const order = await tx.order.create({
          data: {
            tenantId,
            orderNumber,
            customerId: payload.customerId || null,
            status: 'COMPLETED',
            // Normalizado: vinha cru do cliente e divergia do que o PDV online
            // grava (CASH vs DINHEIRO), quebrando o agrupamento dos relatórios.
            paymentMethod: normalizePaymentMethod(payload.paymentMethod, 'PIX'),
            subtotalCents: subtotal,
            discountCents: discount,
            totalCents: total,
            items: {
              create: payload.items.map((i: any) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                totalPrice: Math.round((i.unitPrice || 0) * (i.quantity || 0)),
              })),
            },
          },
        });

        // C1 + H5: o produto é resolvido DENTRO do tenant. Antes o update era
        // por `id` apenas, permitindo baixar estoque de outro inquilino.
        for (const it of payload.items) {
          const quantity = Number(it.quantity || 0);
          if (quantity <= 0) continue;

          const product = await tx.product.findFirst({
            where: { id: it.productId, tenantId },
            select: { id: true, stockQuantity: true, name: true },
          });

          if (!product) {
            // Payload apontando para produto de outro tenant (ou inexistente):
            // aborta a transação em vez de seguir com dado inconsistente.
            throw new Error(
              `Produto ${it.productId} não pertence a este tenant — venda offline recusada.`,
            );
          }

          if (Number(product.stockQuantity) < quantity) {
            throw new Error(
              `Estoque insuficiente para "${product.name}" (disponível ${product.stockQuantity}, solicitado ${quantity}).`,
            );
          }

          const updated = await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } },
            select: { stockQuantity: true },
          });

          // H4: Kardex — antes só as vendas online registravam movimento.
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: product.id,
              type: 'SALE_POS',
              quantity: -quantity,
              balanceAfter: Number(updated.stockQuantity),
              referenceId: order.id,
              notes: `Venda offline #${orderNumber} (sincronizada)`,
            },
          });
        }

        return order;
      },
      { context: 'venda offline' },
    );
  }
}
