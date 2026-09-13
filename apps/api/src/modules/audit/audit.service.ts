import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
}
