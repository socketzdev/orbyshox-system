import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Transições de status permitidas para um pedido de compra.
 *
 * Antes o `PATCH /purchase-orders/:id` aceitava qualquer `status` vindo do
 * cliente, sem whitelist. Um `PATCH { status: "RECEIVED" }` marcava o pedido
 * como recebido **sem passar por `receive()`** — ou seja, sem criar lote, sem
 * incrementar estoque e sem Kardex. O caminho inverso também era possível.
 *
 * `RECEIVED` e `CANCELED` são terminais. A passagem para `RECEIVED` só
 * acontece dentro de `receive()`, que é quem lança estoque.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT', 'CANCELED'],
  SENT: ['CONFIRMED', 'RECEIVING', 'CANCELED'],
  CONFIRMED: ['RECEIVING', 'CANCELED'],
  RECEIVING: ['CANCELED'],
  RECEIVED: [],
  CANCELED: [],
};

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
    const items: Array<{
      productId: string;
      productSupplierId: string | null;
      quantity: number;
      unitCostCents: number;
      totalCents: number;
    }> = data.items.map((it: any) => {
      const qty = Number(it.quantity) || 0;
      const unitCost = Number(it.unitCostCents) || 0;

      // M1: sem esta validação, quantidade/valor negativos geravam um pedido
      // com total negativo — e o total alimenta o financeiro.
      if (!it.productId) {
        throw new BadRequestException('Todo item precisa de productId');
      }
      if (qty <= 0) {
        throw new BadRequestException('Quantidade do item deve ser maior que zero');
      }
      if (unitCost < 0) {
        throw new BadRequestException('Custo unitário não pode ser negativo');
      }

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

    // Garante que todo produto pertence ao tenant — antes um productId
    // arbitrário era aceito e só falharia (ou não) na constraint de FK.
    const productIds = [...new Set(items.map((i) => i.productId))];
    const owned = await this.prisma.product.count({
      where: { id: { in: productIds }, tenantId: tenant.id },
    });
    if (owned !== productIds.length) {
      throw new BadRequestException('Um ou mais produtos não pertencem a esta empresa');
    }

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

    // C4: o status não pode mais ser definido livremente. Só transições da
    // whitelist passam — e RECEIVED nunca entra por aqui (só via receive()).
    if (data.status !== undefined) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[order.status] || [];
      if (!allowed.includes(data.status)) {
        throw new BadRequestException(
          `Transição de status inválida: ${order.status} → ${data.status}. Permitidas: ${allowed.join(', ') || 'nenhuma'}.`,
        );
      }
    }

    const statusToApply = data.status as string | undefined;

    // H1: itens e total na mesma transação. Antes era deleteMany → createMany →
    // update soltos: uma falha no meio deixava o pedido sem itens e com o total
    // antigo.
    await this.prisma.$transaction(async (tx) => {
      if (data.items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });

        let totalCents = 0;
        const items = data.items.map((it: any) => {
          const qty = Number(it.quantity) || 0;
          const unitCost = Number(it.unitCostCents) || 0;
          if (qty <= 0) {
            throw new BadRequestException('Quantidade do item deve ser maior que zero');
          }
          if (unitCost < 0) {
            throw new BadRequestException('Custo unitário não pode ser negativo');
          }
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

        await tx.purchaseOrderItem.createMany({ data: items });
        await tx.purchaseOrder.update({ where: { id }, data: { totalCents } });
      }

      if (statusToApply || data.notes || data.expectedDate) {
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: statusToApply ?? undefined,
            notes: data.notes ?? undefined,
            expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
          },
        });
      }
    });

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
    if (receipts.length === 0) {
      throw new BadRequestException('Informe ao menos um item recebido');
    }

    // H2: tudo numa transação. Antes o loop atualizava o item, criava o lote e
    // incrementava o estoque de forma solta — uma falha no meio deixava estoque
    // lançado com pedido não atualizado.
    return this.prisma.$transaction(async (tx) => {
      for (const r of receipts) {
        const item = order.items.find((i) => i.id === r.itemId);
        if (!item) continue;

        const requested = Number(r.receivedQty || 0);

        // C5: o valor bruto era usado no lote e no incremento, enquanto só o
        // item era limitado ao pedido. Pedido de 10 recebido com 100 subia 100
        // no estoque. E valor negativo decrementava o estoque.
        if (requested <= 0) {
          throw new BadRequestException(
            `Quantidade recebida deve ser maior que zero (item ${item.id}).`,
          );
        }

        const pending = item.quantity - item.receivedQty;
        if (pending <= 0) {
          throw new BadRequestException(
            `Item ${item.id} já foi recebido integralmente (${item.receivedQty}/${item.quantity}).`,
          );
        }
        if (requested > pending) {
          throw new BadRequestException(
            `Quantidade recebida (${requested}) excede o saldo pendente do item (${pending} de ${item.quantity}).`,
          );
        }

        // Agora `receivedQty` é validado antes, então o cap é redundante — mas
        // mantido como rede de segurança caso a validação acima mude.
        const newReceived = Math.min(item.quantity, item.receivedQty + requested);

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: newReceived },
        });

        const batch = await tx.stockBatch.create({
          data: {
            tenantId: tenant.id,
            productId: item.productId,
            lotNumber: r.lotNumber || `PO-${order.id.slice(0, 8)}-${item.id.slice(0, 6)}`,
            expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
            quantity: requested,
            costCents: Number(r.costCents || item.unitCostCents),
            purchaseOrderId: order.id,
            status: 'ACTIVE',
          },
        });

        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { increment: requested },
            costPriceCents: Number(r.costCents || item.unitCostCents),
          },
          select: { stockQuantity: true },
        });

        // Kardex: o recebimento movimenta estoque e precisa de rastreabilidade,
        // como já acontece na entrada por NF-e.
        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: item.productId,
            type: 'ENTRY_MANUAL',
            quantity: requested,
            balanceAfter: Number(updatedProduct.stockQuantity),
            referenceId: batch.id,
            notes: `Recebimento do pedido de compra #${order.id.slice(0, 8)}`,
          },
        });
      }

      const allReceived = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      const fullyReceived = allReceived.every((i) => i.receivedQty >= i.quantity);

      return tx.purchaseOrder.update({
        where: { id },
        data: { status: fullyReceived ? 'RECEIVED' : 'RECEIVING' },
        include: { supplier: true, items: { include: { product: true } }, batches: true },
      });
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
