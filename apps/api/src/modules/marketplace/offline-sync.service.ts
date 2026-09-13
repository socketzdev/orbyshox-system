import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class OfflineSyncService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async enqueue(tenantId: string, items: Array<{ clientId: string; kind: string; payload: string }>) {
    const created: any[] = [];
    for (const it of items) {
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
        if (item.kind === 'ORDER') {
          await this.applyOrder(tenantId, payload);
        }
        await this.prisma.offlineSyncQueue.update({
          where: { id: item.id },
          data: { status: 'SYNCED', syncedAt: new Date() },
        });
        results.push({ clientId: item.clientId, status: 'SYNCED' });
      } catch (err: any) {
        await this.prisma.offlineSyncQueue.update({
          where: { id: item.id },
          data: { status: 'FAILED', error: err?.message || 'Erro' },
        });
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

  private async applyOrder(tenantId: string, payload: any) {
    if (!payload.items?.length) return;
    const lastOrder = await this.prisma.order.findFirst({
      where: { tenantId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = (lastOrder?.orderNumber || 100) + 1;
    let subtotal = 0;
    for (const it of payload.items) {
      subtotal += Math.round((it.unitPrice || 0) * (it.quantity || 0));
    }
    const discount = Number(payload.discountCents) || 0;
    const total = Math.max(0, subtotal - discount);
    await this.prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        customerId: payload.customerId || null,
        status: 'COMPLETED',
        paymentMethod: payload.paymentMethod || 'PIX',
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
    for (const it of payload.items) {
      await this.prisma.product.update({
        where: { id: it.productId },
        data: { stockQuantity: { decrement: Number(it.quantity || 0) } },
      });
    }
  }
}
