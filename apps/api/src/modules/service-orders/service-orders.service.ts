import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Operação de campo da vertical REFRIGERACAO.
 *
 * Escopo sempre por tenant (`tenantId || companyId` — Company.id == Tenant.id
 * por invariante de criação). A OS conclui gerando conta a receber; peça
 * vinculada dá baixa no estoque com movimento rastreado; orçamento aprovado
 * gera a OS.
 */

export const OS_STATUS = [
  'ABERTA',
  'AGENDADA',
  'EM_ATENDIMENTO',
  'AGUARDANDO_PECA',
  'CONCLUIDA',
  'CANCELADA',
] as const;

// Transições permitidas no funil (cancelar vale de qualquer etapa ativa).
const OS_FLOW: Record<string, string[]> = {
  ABERTA: ['AGENDADA', 'EM_ATENDIMENTO', 'CANCELADA'],
  AGENDADA: ['EM_ATENDIMENTO', 'CANCELADA'],
  EM_ATENDIMENTO: ['AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_ATENDIMENTO', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

const DAY = 24 * 60 * 60 * 1000;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 1_500_000;

function parsePhotos(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class ServiceOrdersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private tid(companyId?: string, tenantId?: string): string {
    const id = tenantId || companyId;
    if (!id) throw new BadRequestException('Tenant não identificado.');
    return id;
  }

  private money(v: unknown): number {
    return Math.max(0, Math.round(Number(v) || 0));
  }

  private totalOf(o: { laborCents: number; partsCents: number; travelCents: number; discountCents: number }): number {
    return Math.max(0, o.laborCents + o.partsCents + o.travelCents - Math.min(o.discountCents, o.laborCents + o.partsCents + o.travelCents));
  }

  // ─── Equipamentos do cliente ─────────────────────────────────────────────

  async listEquipment(companyId?: string, tenantId?: string, customerId?: string) {
    const id = this.tid(companyId, tenantId);
    return this.prisma.serviceEquipment.findMany({
      where: { tenantId: id, ...(customerId ? { customerId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        _count: { select: { orders: true } },
      },
    });
  }

  async createEquipment(companyId: string | undefined, tenantId: string | undefined, dto: any) {
    const id = this.tid(companyId, tenantId);
    if (dto?.customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: String(dto.customerId), tenantId: id } });
      if (!customer) throw new NotFoundException('Cliente não encontrado.');
    }
    return this.prisma.serviceEquipment.create({
      data: {
        tenantId: id,
        customerId: dto?.customerId ? String(dto.customerId) : null,
        clientName: dto?.clientName ? String(dto.clientName).slice(0, 120) : null,
        type: String(dto?.type || 'SPLIT').slice(0, 30),
        brand: dto?.brand ? String(dto.brand).slice(0, 60) : null,
        model: dto?.model ? String(dto.model).slice(0, 60) : null,
        capacity: dto?.capacity ? String(dto.capacity).slice(0, 30) : null,
        location: dto?.location ? String(dto.location).slice(0, 200) : null,
        notes: dto?.notes ? String(dto.notes).slice(0, 1000) : null,
      },
    });
  }

  async updateEquipment(companyId: string | undefined, tenantId: string | undefined, eqId: string, dto: any) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.serviceEquipment.findFirst({ where: { id: eqId, tenantId: id } });
    if (!existing) throw new NotFoundException('Equipamento não encontrado.');
    const data: any = {};
    for (const f of ['type', 'brand', 'model', 'capacity', 'location', 'notes', 'clientName']) {
      if (dto?.[f] !== undefined) data[f] = dto[f] ? String(dto[f]).slice(0, 200) : null;
    }
    return this.prisma.serviceEquipment.update({ where: { id: eqId }, data });
  }

  async deleteEquipment(companyId: string | undefined, tenantId: string | undefined, eqId: string) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.serviceEquipment.findFirst({ where: { id: eqId, tenantId: id } });
    if (!existing) throw new NotFoundException('Equipamento não encontrado.');
    const used = await this.prisma.serviceOrder.count({ where: { equipmentId: eqId } });
    if (used > 0) throw new BadRequestException('Equipamento com ordens de serviço vinculadas não pode ser excluído.');
    await this.prisma.serviceEquipment.delete({ where: { id: eqId } });
    return { deleted: true, id: eqId };
  }

  // ─── Ordens de serviço ───────────────────────────────────────────────────

  async listOrders(companyId?: string, tenantId?: string, filters?: { status?: string; technicianId?: string; search?: string }) {
    const id = this.tid(companyId, tenantId);
    const where: any = { tenantId: id };
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters?.technicianId) where.technicianId = filters.technicianId;
    if (filters?.search) {
      const s = String(filters.search);
      const num = Number(s.replace(/\D/g, ''));
      where.OR = [
        { clientName: { contains: s } },
        { phone: { contains: s } },
        { address: { contains: s } },
        ...(Number.isFinite(num) && s.trim() !== '' ? [{ number: num }] : []),
      ];
    }
    return this.prisma.serviceOrder.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        equipment: true,
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });
  }

  async getOrder(companyId: string | undefined, tenantId: string | undefined, orderId: string) {
    const id = this.tid(companyId, tenantId);
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: id },
      include: {
        customer: true,
        equipment: true,
        items: { include: { product: { select: { id: true, name: true, stockQuantity: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    return { ...order, photos: parsePhotos(order.photos) };
  }

  async createOrder(companyId: string | undefined, tenantId: string | undefined, dto: any, operatorId?: string) {
    const id = this.tid(companyId, tenantId);
    if (!dto?.clientName?.trim() && !dto?.customerId) {
      throw new BadRequestException('Cliente é obrigatório.');
    }
    let customer: any = null;
    if (dto?.customerId) {
      customer = await this.prisma.customer.findFirst({ where: { id: String(dto.customerId), tenantId: id } });
      if (!customer) throw new NotFoundException('Cliente não encontrado.');
    }
    let equipment: any = null;
    if (dto?.equipmentId) {
      equipment = await this.prisma.serviceEquipment.findFirst({ where: { id: String(dto.equipmentId), tenantId: id } });
      if (!equipment) throw new NotFoundException('Equipamento não encontrado.');
    }
    const labor = this.money(dto?.laborCents);
    const travel = this.money(dto?.travelCents);
    const discount = this.money(dto?.discountCents);
    const scheduledAt = dto?.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto?.scheduledAt && Number.isNaN(scheduledAt!.getTime())) throw new BadRequestException('Data agendada inválida.');
    const status = dto?.status && OS_STATUS.includes(dto.status) ? dto.status : scheduledAt ? 'AGENDADA' : 'ABERTA';

    const last = await this.prisma.serviceOrder.findFirst({ where: { tenantId: id }, orderBy: { number: 'desc' }, select: { number: true } });
    const order = await this.prisma.serviceOrder.create({
      data: {
        tenantId: id,
        number: (last?.number || 0) + 1,
        customerId: customer?.id || null,
        clientName: (customer?.name || String(dto.clientName).trim()).slice(0, 120),
        phone: (customer?.phone || dto?.phone || '').toString().slice(0, 30) || null,
        address: (customer as any)?.address || dto?.address ? String((customer as any)?.address || dto.address).slice(0, 200) : null,
        equipmentId: equipment?.id || null,
        equipmentDesc: dto?.equipmentDesc ? String(dto.equipmentDesc).slice(0, 200) : null,
        serviceType: String(dto?.serviceType || 'MANUTENCAO').slice(0, 30),
        reportedProblem: dto?.reportedProblem ? String(dto.reportedProblem).slice(0, 2000) : null,
        technicianId: dto?.technicianId ? String(dto.technicianId) : null,
        technicianName: dto?.technicianName ? String(dto.technicianName).slice(0, 80) : null,
        scheduledAt,
        status,
        laborCents: labor,
        travelCents: travel,
        discountCents: discount,
        partsCents: 0,
        totalCents: Math.max(0, labor + travel - Math.min(discount, labor + travel)),
        notes: dto?.notes ? String(dto.notes).slice(0, 1000) : null,
      },
      include: { items: true },
    });
    return { ...order, photos: [] as string[] };
  }

  async updateOrder(companyId: string | undefined, tenantId: string | undefined, orderId: string, dto: any) {
    const id = this.tid(companyId, tenantId);
    const order = await this.prisma.serviceOrder.findFirst({ where: { id: orderId, tenantId: id } });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (['CONCLUIDA', 'CANCELADA'].includes(order.status)) {
      throw new BadRequestException('OS concluída ou cancelada não pode ser editada.');
    }
    const data: any = {};
    for (const f of ['reportedProblem', 'diagnosis', 'performedService', 'equipmentDesc', 'address', 'phone', 'notes']) {
      if (dto?.[f] !== undefined) data[f] = dto[f] ? String(dto[f]).slice(0, 2000) : null;
    }
    if (dto?.serviceType !== undefined) data.serviceType = String(dto.serviceType).slice(0, 30);
    if (dto?.technicianId !== undefined) data.technicianId = dto.technicianId ? String(dto.technicianId) : null;
    if (dto?.technicianName !== undefined) data.technicianName = dto.technicianName ? String(dto.technicianName).slice(0, 80) : null;
    if (dto?.scheduledAt !== undefined) {
      if (!dto.scheduledAt) data.scheduledAt = null;
      else {
        const d = new Date(dto.scheduledAt);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Data agendada inválida.');
        data.scheduledAt = d;
      }
    }
    if (dto?.laborCents !== undefined) data.laborCents = this.money(dto.laborCents);
    if (dto?.travelCents !== undefined) data.travelCents = this.money(dto.travelCents);
    if (dto?.discountCents !== undefined) data.discountCents = this.money(dto.discountCents);
    if (dto?.photos !== undefined) {
      const photos = Array.isArray(dto.photos) ? dto.photos.map((x: any) => String(x)) : [];
      if (photos.length > MAX_PHOTOS) throw new BadRequestException(`Máximo de ${MAX_PHOTOS} fotos por OS.`);
      for (const p of photos) {
        if (!p.startsWith('data:image/')) throw new BadRequestException('Foto inválida: envie imagem.');
        if (p.length > MAX_PHOTO_BYTES * 1.4) throw new BadRequestException('Foto muito grande (máx ~1,5MB cada).');
      }
      data.photos = JSON.stringify(photos);
    }
    if (data.laborCents !== undefined || data.travelCents !== undefined || data.discountCents !== undefined) {
      const labor = data.laborCents ?? order.laborCents;
      const travel = data.travelCents ?? order.travelCents;
      const discount = data.discountCents ?? order.discountCents;
      data.totalCents = this.totalOf({ laborCents: labor, partsCents: order.partsCents, travelCents: travel, discountCents: discount });
    }
    const updated = await this.prisma.serviceOrder.update({ where: { id: orderId }, data });
    return { ...updated, photos: parsePhotos(updated.photos) };
  }

  async setStatus(companyId: string | undefined, tenantId: string | undefined, orderId: string, status: string) {
    const id = this.tid(companyId, tenantId);
    if (!OS_STATUS.includes(status as any)) throw new BadRequestException('Status inválido.');
    const order = await this.prisma.serviceOrder.findFirst({ where: { id: orderId, tenantId: id }, include: { items: true } });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (!(OS_FLOW[order.status] || []).includes(status)) {
      throw new BadRequestException(`Transição de ${order.status} para ${status} não permitida.`);
    }
    const data: any = { status };

    // Concluir gera a conta a receber do serviço.
    if (status === 'CONCLUIDA') {
      const bill = await this.prisma.billReceivable.create({
        data: {
          tenantId: id,
          customerId: order.customerId,
          description: `OS #${order.number} — ${order.serviceType} (${order.clientName})`,
          amountCents: order.totalCents,
          dueDate: new Date(Date.now() + 7 * DAY),
          status: 'PENDING',
          type: 'SERVICO',
          notes: `Ordem de serviço #${order.number}`,
        },
      });
      data.billReceivableId = bill.id;
    }
    const updated = await this.prisma.serviceOrder.update({ where: { id: orderId }, data });
    return { ...updated, photos: parsePhotos(updated.photos) };
  }

  // ─── Peças da OS (com baixa de estoque) ──────────────────────────────────

  async addPart(companyId: string | undefined, tenantId: string | undefined, orderId: string, dto: any, operatorId?: string) {
    const id = this.tid(companyId, tenantId);
    const order = await this.prisma.serviceOrder.findFirst({ where: { id: orderId, tenantId: id } });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (['CONCLUIDA', 'CANCELADA'].includes(order.status)) {
      throw new BadRequestException('OS concluída ou cancelada não aceita peças.');
    }
    const qty = Number(dto?.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('Quantidade inválida.');
    const unit = this.money(dto?.unitPriceCents);

    let product: any = null;
    if (dto?.productId) {
      product = await this.prisma.product.findFirst({ where: { id: String(dto.productId), tenantId: id } });
      if (!product) {
        product = await this.prisma.product.findFirst({ where: { id: String(dto.productId), companyId: id } });
      }
      if (!product) throw new NotFoundException('Peça não encontrada no estoque.');
      if (Number(product.stockQuantity) < qty) {
        throw new BadRequestException(`Estoque insuficiente: ${product.stockQuantity} un disponíveis.`);
      }
      const balanceAfter = Number(product.stockQuantity) - qty;
      await this.prisma.product.update({ where: { id: product.id }, data: { stockQuantity: balanceAfter } });
      await this.prisma.stockMovement.create({
        data: {
          tenantId: id,
          productId: product.id,
          type: 'SERVICE_OS',
          quantity: -qty,
          balanceAfter,
          referenceId: order.id,
          notes: `OS #${order.number}`,
          operatorId: operatorId || null,
        },
      });
    }

    const item = await this.prisma.serviceOrderItem.create({
      data: {
        orderId: order.id,
        productId: product?.id || null,
        partName: (product?.name || String(dto?.partName || '').trim()).slice(0, 120),
        quantity: qty,
        unitPriceCents: product ? Number(product.salePriceCents) || unit : unit,
        totalCents: Math.round(qty * (product ? Number(product.salePriceCents) || unit : unit)),
      },
    });

    const items = await this.prisma.serviceOrderItem.findMany({ where: { orderId: order.id } });
    const partsCents = items.reduce((a, it) => a + it.totalCents, 0);
    const updated = await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { partsCents, totalCents: this.totalOf({ laborCents: order.laborCents, partsCents, travelCents: order.travelCents, discountCents: order.discountCents }) },
      include: { items: true },
    });
    return { item, order: { ...updated, photos: parsePhotos(updated.photos) } };
  }

  async removePart(companyId: string | undefined, tenantId: string | undefined, orderId: string, itemId: string, operatorId?: string) {
    const id = this.tid(companyId, tenantId);
    const order = await this.prisma.serviceOrder.findFirst({ where: { id: orderId, tenantId: id } });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (['CONCLUIDA', 'CANCELADA'].includes(order.status)) {
      throw new BadRequestException('OS concluída ou cancelada não pode ser alterada.');
    }
    const item = await this.prisma.serviceOrderItem.findFirst({ where: { id: itemId, orderId: order.id } });
    if (!item) throw new NotFoundException('Peça não encontrada na OS.');

    // Estorna o estoque quando a peça veio do catálogo.
    if (item.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (product) {
        const balanceAfter = Number(product.stockQuantity) + Number(item.quantity);
        await this.prisma.product.update({ where: { id: product.id }, data: { stockQuantity: balanceAfter } });
        await this.prisma.stockMovement.create({
          data: {
            tenantId: id,
            productId: product.id,
            type: 'SERVICE_OS_RETURN',
            quantity: Number(item.quantity),
            balanceAfter,
            referenceId: order.id,
            notes: `Estorno OS #${order.number}`,
            operatorId: operatorId || null,
          },
        });
      }
    }
    await this.prisma.serviceOrderItem.delete({ where: { id: item.id } });

    const items = await this.prisma.serviceOrderItem.findMany({ where: { orderId: order.id } });
    const partsCents = items.reduce((a, it) => a + it.totalCents, 0);
    const updated = await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { partsCents, totalCents: this.totalOf({ laborCents: order.laborCents, partsCents, travelCents: order.travelCents, discountCents: order.discountCents }) },
      include: { items: true },
    });
    return { removed: true, order: { ...updated, photos: parsePhotos(updated.photos) } };
  }

  // ─── Orçamentos ──────────────────────────────────────────────────────────

  async listQuotes(companyId?: string, tenantId?: string, status?: string) {
    const id = this.tid(companyId, tenantId);
    return this.prisma.serviceQuote.findMany({
      where: { tenantId: id, ...(status && status !== 'ALL' ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  async createQuote(companyId: string | undefined, tenantId: string | undefined, dto: any) {
    const id = this.tid(companyId, tenantId);
    if (!dto?.clientName?.trim() && !dto?.customerId) throw new BadRequestException('Cliente é obrigatório.');
    let customer: any = null;
    if (dto?.customerId) {
      customer = await this.prisma.customer.findFirst({ where: { id: String(dto.customerId), tenantId: id } });
      if (!customer) throw new NotFoundException('Cliente não encontrado.');
    }
    const labor = this.money(dto?.laborCents);
    const parts = this.money(dto?.partsCents);
    const travel = this.money(dto?.travelCents);
    const discount = this.money(dto?.discountCents);
    if (dto?.scheduledAt && Number.isNaN(new Date(dto.scheduledAt).getTime())) {
      throw new BadRequestException('Data agendada inválida.');
    }
    return this.prisma.serviceQuote.create({
      data: {
        tenantId: id,
        customerId: customer?.id || null,
        clientName: (customer?.name || String(dto.clientName).trim()).slice(0, 120),
        phone: (customer?.phone || dto?.phone || '').toString().slice(0, 30) || null,
        address: dto?.address ? String(dto.address).slice(0, 200) : null,
        equipmentDesc: dto?.equipmentDesc ? String(dto.equipmentDesc).slice(0, 200) : null,
        laborCents: labor,
        partsCents: parts,
        travelCents: travel,
        discountCents: discount,
        totalCents: this.totalOf({ laborCents: labor, partsCents: parts, travelCents: travel, discountCents: discount }),
        status: 'PENDENTE',
        validUntil: dto?.validUntil ? new Date(dto.validUntil) : null,
        scheduledAt: dto?.scheduledAt ? new Date(dto.scheduledAt) : null,
        technicianId: dto?.technicianId ? String(dto.technicianId) : null,
        technicianName: dto?.technicianName ? String(dto.technicianName).slice(0, 80) : null,
        notes: dto?.notes ? String(dto.notes).slice(0, 1000) : null,
      },
    });
  }

  async setQuoteStatus(
    companyId: string | undefined,
    tenantId: string | undefined,
    quoteId: string,
    status: string,
    extra?: { scheduledAt?: string; technicianId?: string; technicianName?: string },
  ) {
    const id = this.tid(companyId, tenantId);
    if (!['APROVADO', 'RECUSADO', 'EXPIRADO', 'PENDENTE'].includes(status)) {
      throw new BadRequestException('Status inválido.');
    }
    const quote = await this.prisma.serviceQuote.findFirst({ where: { id: quoteId, tenantId: id } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    if (quote.status !== 'PENDENTE' && status !== quote.status) {
      throw new BadRequestException('Orçamento já finalizado.');
    }

    // Reagendar um orçamento pendente (a visita é marcada aqui, não depois).
    if (status === 'PENDENTE' && (extra?.scheduledAt !== undefined || extra?.technicianId !== undefined)) {
      const patch: any = {};
      if (extra?.scheduledAt !== undefined) {
        if (!extra.scheduledAt) patch.scheduledAt = null;
        else {
          const d = new Date(extra.scheduledAt);
          if (Number.isNaN(d.getTime())) throw new BadRequestException('Data agendada inválida.');
          patch.scheduledAt = d;
        }
      }
      if (extra?.technicianId !== undefined) {
        patch.technicianId = extra.technicianId ? String(extra.technicianId) : null;
        patch.technicianName = extra?.technicianName ? String(extra.technicianName).slice(0, 80) : null;
      }
      return { quote: await this.prisma.serviceQuote.update({ where: { id: quoteId }, data: patch }) };
    }

    // Aprovação gera a OS agendada herdando cliente, valores, técnico e data.
    if (status === 'APROVADO' && quote.status === 'PENDENTE') {
      let scheduledAt = quote.scheduledAt;
      if (extra?.scheduledAt) {
        const d = new Date(extra.scheduledAt);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Data agendada inválida.');
        scheduledAt = d;
      }
      const technicianId = extra?.technicianId ? String(extra.technicianId) : quote.technicianId;
      const technicianName = extra?.technicianName ? String(extra.technicianName).slice(0, 80) : quote.technicianName;
      const last = await this.prisma.serviceOrder.findFirst({ where: { tenantId: id }, orderBy: { number: 'desc' }, select: { number: true } });
      const order = await this.prisma.serviceOrder.create({
        data: {
          tenantId: id,
          number: (last?.number || 0) + 1,
          customerId: quote.customerId,
          clientName: quote.clientName,
          phone: quote.phone,
          address: quote.address,
          equipmentDesc: quote.equipmentDesc,
          serviceType: 'MANUTENCAO',
          reportedProblem: quote.notes,
          status: 'AGENDADA',
          scheduledAt,
          technicianId,
          technicianName,
          laborCents: quote.laborCents,
          partsCents: 0,
          travelCents: quote.travelCents,
          discountCents: quote.discountCents,
          totalCents: this.totalOf({ laborCents: quote.laborCents, partsCents: 0, travelCents: quote.travelCents, discountCents: quote.discountCents }),
          notes: `Gerada do orçamento aprovado em ${new Date().toLocaleDateString('pt-BR')}`,
        },
      });
      const updated = await this.prisma.serviceQuote.update({
        where: { id: quoteId },
        data: { status, orderId: order.id, scheduledAt, technicianId, technicianName },
      });
      return { quote: updated, order };
    }
    return { quote: await this.prisma.serviceQuote.update({ where: { id: quoteId }, data: { status } }) };
  }

  // ─── Técnicos ────────────────────────────────────────────────────────────

  async technicians(companyId?: string, tenantId?: string) {
    const id = this.tid(companyId, tenantId);
    const users = await this.prisma.user.findMany({
      where: { OR: [{ tenantId: id }, { companyId: id }], isActive: true },
      select: { id: true, name: true, role: true, position: true, phone: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
    const stats = await this.prisma.serviceOrder.groupBy({
      by: ['technicianId', 'status'],
      where: { tenantId: id, technicianId: { not: null } },
      _count: true,
      _sum: { totalCents: true },
    });
    const byTech: Record<string, { open: number; done: number; revenue: number }> = {};
    for (const s of stats) {
      const key = String(s.technicianId);
      byTech[key] = byTech[key] || { open: 0, done: 0, revenue: 0 };
      if (s.status === 'CONCLUIDA') {
        byTech[key].done += s._count;
        byTech[key].revenue += s._sum.totalCents || 0;
      } else if (s.status !== 'CANCELADA') {
        byTech[key].open += s._count;
      }
    }
    return users.map((u) => ({
      ...u,
      openOrders: byTech[u.id]?.open || 0,
      completedOrders: byTech[u.id]?.done || 0,
      revenueCents: byTech[u.id]?.revenue || 0,
    }));
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────

  async dashboard(companyId?: string, tenantId?: string) {
    const id = this.tid(companyId, tenantId);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(startToday.getTime() + DAY);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [byStatus, todayOrders, pendingQuotes, pendingBills, overdueBills, revenueMonth, scheduled] = await Promise.all([
      this.prisma.serviceOrder.groupBy({ by: ['status'], where: { tenantId: id }, _count: true }),
      this.prisma.serviceOrder.count({
        where: { tenantId: id, OR: [{ scheduledAt: { gte: startToday, lt: endToday } }, { status: 'EM_ATENDIMENTO' }] },
      }),
      this.prisma.serviceQuote.aggregate({ where: { tenantId: id, status: 'PENDENTE' }, _count: true, _sum: { totalCents: true } }),
      this.prisma.billReceivable.aggregate({
        where: { tenantId: id, status: { in: ['PENDING', 'PARTIAL'] } },
        _count: true,
        _sum: { amountCents: true, paidCents: true },
      }),
      this.prisma.billReceivable.count({ where: { tenantId: id, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } } }),
      this.prisma.billReceivable.aggregate({
        where: { tenantId: id, type: 'SERVICO', status: 'RECEIVED', receivedAt: { gte: startMonth } },
        _sum: { amountCents: true },
      }),
      this.prisma.serviceOrder.count({ where: { tenantId: id, status: 'AGENDADA' } }),
    ]);

    const open: Record<string, number> = {};
    for (const s of byStatus) open[s.status] = s._count;

    return {
      todayOrders,
      openOrders: (open.ABERTA || 0) + (open.AGENDADA || 0) + (open.EM_ATENDIMENTO || 0) + (open.AGUARDANDO_PECA || 0),
      inProgress: open.EM_ATENDIMENTO || 0,
      waitingParts: open.AGUARDANDO_PECA || 0,
      completedTotal: open.CONCLUIDA || 0,
      pendingQuotes: pendingQuotes._count,
      pendingQuotesCents: pendingQuotes._sum.totalCents || 0,
      pendingBills: pendingBills._count,
      pendingCents: (pendingBills._sum.amountCents || 0) - (pendingBills._sum.paidCents || 0),
      overdueBills,
      serviceRevenueMonthCents: revenueMonth._sum.amountCents || 0,
      scheduled,
    };
  }

  // ─── Relatórios ──────────────────────────────────────────────────────────

  async reports(companyId?: string, tenantId?: string) {
    const id = this.tid(companyId, tenantId);
    const now = new Date();

    const revenueByMonth: Array<{ month: string; cents: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const agg = await this.prisma.billReceivable.aggregate({
        where: { tenantId: id, type: 'SERVICO', status: 'RECEIVED', receivedAt: { gte: mStart, lt: mEnd } },
        _sum: { amountCents: true },
      });
      revenueByMonth.push({
        month: `${String(mStart.getMonth() + 1).padStart(2, '0')}/${mStart.getFullYear()}`,
        cents: agg._sum.amountCents || 0,
      });
    }

    const byTech = await this.prisma.serviceOrder.groupBy({
      by: ['technicianId', 'technicianName', 'status'],
      where: { tenantId: id, technicianId: { not: null } },
      _count: true,
      _sum: { totalCents: true },
    });
    const techMap: Record<string, { name: string; completed: number; revenue: number }> = {};
    for (const t of byTech) {
      if (t.status !== 'CONCLUIDA') continue;
      const key = String(t.technicianId);
      techMap[key] = techMap[key] || { name: t.technicianName || 'Técnico', completed: 0, revenue: 0 };
      techMap[key].completed += t._count;
      techMap[key].revenue += t._sum.totalCents || 0;
    }

    const items = await this.prisma.serviceOrderItem.findMany({
      where: { order: { tenantId: id } },
      select: { partName: true, quantity: true },
      take: 2000,
    });
    const partMap: Record<string, number> = {};
    for (const it of items) partMap[it.partName] = (partMap[it.partName] || 0) + Number(it.quantity);
    const topParts = Object.entries(partMap)
      .map(([part, qty]) => ({ part, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const [quotes, canceled, overdue] = await Promise.all([
      this.prisma.serviceQuote.groupBy({ by: ['status'], where: { tenantId: id }, _count: true }),
      this.prisma.serviceOrder.count({ where: { tenantId: id, status: 'CANCELADA' } }),
      this.prisma.billReceivable.aggregate({
        where: { tenantId: id, type: 'SERVICO', status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } },
        _count: true,
        _sum: { amountCents: true, paidCents: true },
      }),
    ]);
    const quoteStatus: Record<string, number> = {};
    for (const q of quotes) quoteStatus[q.status] = q._count;

    return {
      revenueByMonth,
      byTechnician: Object.values(techMap).sort((a, b) => b.revenue - a.revenue),
      topParts,
      quotes: quoteStatus,
      canceledOrders: canceled,
      delinquency: {
        count: overdue._count,
        cents: (overdue._sum.amountCents || 0) - (overdue._sum.paidCents || 0),
      },
    };
  }
}
