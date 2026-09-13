import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private async getTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" não encontrado`);
    return tenant;
  }

  async list(slug: string, query: any = {}) {
    const tenant = await this.getTenant(slug);
    const where: any = { tenantId: tenant.id };
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    return this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        _count: { select: { items: true } },
      },
    });
  }

  async get(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        supplier: true,
        items: { include: { product: true } },
        batches: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async create(slug: string, data: any, userId?: string) {
    const tenant = await this.getTenant(slug);
    if (!data.supplierId) throw new BadRequestException('supplierId obrigatório');
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('Pedido deve ter pelo menos 1 item');
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId: tenant.id },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');

    let totalCents = 0;
    const items = data.items.map((it: any) => {
      const qty = Number(it.quantity) || 0;
      const unitCost = Number(it.unitCostCents) || 0;
      const total = Math.round(qty * unitCost);
      totalCents += total;
      return {
        productId: it.productId,
        productSupplierId: it.productSupplierId || null,
        quantity: qty,
        unitCostCents: unitCost,
        totalCents: total,
      };
    });

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId: tenant.id,
        supplierId: data.supplierId,
        status: 'DRAFT',
        totalCents,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        notes: data.notes || null,
        createdById: userId || null,
        items: { create: items },
      },
      include: { supplier: true, items: { include: { product: true } } },
    });
  }

  async update(slug: string, id: string, data: any) {
    const tenant = await this.getTenant(slug);
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId: tenant.id } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Apenas pedidos em rascunho podem ser editados');
    }
    if (data.items) {
      await this.prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      let totalCents = 0;
      const items = data.items.map((it: any) => {
        const qty = Number(it.quantity) || 0;
        const unitCost = Number(it.unitCostCents) || 0;
        const total = Math.round(qty * unitCost);
        totalCents += total;
        return {
          purchaseOrderId: id,
          productId: it.productId,
          productSupplierId: it.productSupplierId || null,
          quantity: qty,
          unitCostCents: unitCost,
          totalCents: total,
        };
      });
      await this.prisma.purchaseOrderItem.createMany({ data: items });
      await this.prisma.purchaseOrder.update({ where: { id }, data: { totalCents } });
    }
    if (data.status || data.notes || data.expectedDate) {
      await this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: data.status ?? undefined,
          notes: data.notes ?? undefined,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
        },
      });
    }
    return this.get(slug, id);
  }

  async send(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId: tenant.id } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'DRAFT') {
      throw new BadRequestException(`Status atual: ${order.status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'SENT' },
    });
  }

  async cancel(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId: tenant.id } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status === 'RECEIVED' || order.status === 'CANCELED') {
      throw new BadRequestException(`Não é possível cancelar pedido com status ${order.status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELED' },
    });
  }

  async receive(slug: string, id: string, data: any) {
    const tenant = await this.getTenant(slug);
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: tenant.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (!['SENT', 'CONFIRMED', 'RECEIVING'].includes(order.status)) {
      throw new BadRequestException(`Status atual: ${order.status}`);
    }

    const receipts: Array<{ itemId: string; receivedQty: number; lotNumber?: string; expiryDate?: Date; costCents?: number }> = data.receipts || [];
    const createdBatches: any[] = [];

    for (const r of receipts) {
      const item = order.items.find((i) => i.id === r.itemId);
      if (!item) continue;
      const newReceived = Math.min(item.quantity, item.receivedQty + Number(r.receivedQty || 0));
      await this.prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { receivedQty: newReceived },
      });
      const batch = await this.prisma.stockBatch.create({
        data: {
          tenantId: tenant.id,
          productId: item.productId,
          lotNumber: r.lotNumber || `PO-${order.id.slice(0, 8)}-${item.id.slice(0, 6)}`,
          expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
          quantity: Number(r.receivedQty || 0),
          costCents: Number(r.costCents || item.unitCostCents),
          purchaseOrderId: order.id,
          status: 'ACTIVE',
        },
      });
      createdBatches.push(batch);
      await this.prisma.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: Number(r.receivedQty || 0) }, costPriceCents: Number(r.costCents || item.unitCostCents) },
      });
    }

    const allReceived = await this.prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const fullyReceived = allReceived.every((i) => i.receivedQty >= i.quantity);

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: fullyReceived ? 'RECEIVED' : 'RECEIVING' },
      include: { supplier: true, items: { include: { product: true } }, batches: true },
    });
  }

  async suggestions(slug: string) {
    const tenant = await this.getTenant(slug);
    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id, isActive: true },
      include: {
        batches: { where: { status: 'ACTIVE' }, orderBy: { expiryDate: 'asc' } },
        suppliers: { include: { supplier: true } },
      },
      take: 200,
    });

    const out: Array<{
      productId: string;
      productName: string;
      currentStock: number;
      minStock: number;
      suggestedQty: number;
      preferredSupplier?: { id: string; name: string; costCents: number; leadTimeDays: number };
      nearestExpiry?: Date | null;
    }> = [];

    for (const p of products) {
      if (p.stockQuantity > p.minStockAlert) continue;
      const preferred = p.suppliers.find((s) => s.isPreferred) || p.suppliers.sort((a, b) => a.costCents - b.costCents)[0];
      const suggestBase = Math.max(p.minStockAlert * 2, p.minStockAlert + 5);
      const leadTime = preferred?.supplier?.leadTimeDays || 3;
      const suggested = Math.round(suggestBase + leadTime * 0.5);

      out.push({
        productId: p.id,
        productName: p.name,
        currentStock: p.stockQuantity,
        minStock: p.minStockAlert,
        suggestedQty: suggested,
        preferredSupplier: preferred
          ? {
              id: preferred.supplier.id,
              name: preferred.supplier.tradeName || preferred.supplier.legalName,
              costCents: preferred.costCents,
              leadTimeDays: preferred.supplier.leadTimeDays,
            }
          : undefined,
        nearestExpiry: p.batches[0]?.expiryDate || null,
      });
    }

    return out.sort((a, b) => (a.currentStock - a.minStock) - (b.currentStock - b.minStock));
  }
}
