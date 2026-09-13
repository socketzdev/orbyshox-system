import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TICKET_STATUS, SLA_RESPONSE_TIMES } from '@projeto-saas/shared-types';

@Injectable()
export class TicketsService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async findAll(query: any) {
    const { page = 1, limit = 20, status, priority, category, tenantId, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (tenantId) where.tenantId = tenantId;
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { tenant: { companyName: { contains: search } } },
      ];
    }

    const orderBy: any = { [sortBy]: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip: Number(skip),
        take: Number(limit),
        include: {
          tenant: { select: { companyName: true, tradeName: true } },
          assignedTo: { select: { name: true, email: true } },
          _count: { select: { messages: true } },
        },
        orderBy,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true, email: true, role: true } } } },
        tenant: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async create(data: any, userId: string) {
    const minutes = SLA_RESPONSE_TIMES[data.priority] ?? SLA_RESPONSE_TIMES.MEDIUM;
    const deadline = new Date(Date.now() + minutes * 60 * 1000);

    const author = await this.prisma.user.findUnique({ where: { id: userId } });
    let authorId = userId;
    if (!author) {
      const fallback = await this.prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      authorId = fallback?.id || userId;
    }

    return this.prisma.ticket.create({
      data: {
        tenantId: data.tenantId,
        createdById: authorId,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        slaDeadline: deadline,
        status: TICKET_STATUS.OPEN,
        messages: {
          create: [{ authorId, content: data.initialMessage ?? data.message, isInternal: false }],
        },
      },
    });
  }

  async update(id: string, data: any) {
    const before = await this.prisma.ticket.findUnique({ where: { id } });
    const updated = await this.prisma.ticket.update({ where: { id }, data });
    if (before && before.status !== updated.status) {
      await this.prisma.ticketStatusHistory.create({
        data: {
          ticketId: id,
          fromStatus: before.status,
          toStatus: updated.status,
          actorId: data.actorId ?? null,
          reason: data.reason ?? null,
        },
      });
      if (updated.status === TICKET_STATUS.RESOLVED) {
        await this.prisma.ticket.update({ where: { id }, data: { resolvedAt: new Date() } });
      }
    }
    return updated;
  }

  async addMessage(ticketId: string, userId: string, content: string, isInternal: boolean = false) {
    const created = await this.prisma.ticketMessage.create({
      data: { ticketId, authorId: userId, content, isInternal },
    });
    if (!isInternal && !created.id) {
      // placeholder to silence linters when no extra fields
    }
    return created;
  }

  async assign(ticketId: string, assignedToId: string | null) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedToId },
    });
  }

  async resolve(id: string) {
    return this.update(id, { status: TICKET_STATUS.RESOLVED, resolvedAt: new Date() });
  }

  async close(id: string) {
    return this.update(id, { status: TICKET_STATUS.CLOSED, closedAt: new Date() });
  }

  async reopen(id: string) {
    return this.update(id, { status: TICKET_STATUS.OPEN, resolvedAt: null });
  }
}
