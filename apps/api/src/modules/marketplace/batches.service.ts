import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BatchesService {
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

  async update(slug: string, id: string, data: any) {
    const tenant = await this.getTenant(slug);
    const batch = await this.prisma.stockBatch.findFirst({ where: { id, tenantId: tenant.id } });
    if (!batch) throw new NotFoundException('Lote não encontrado');
    return this.prisma.stockBatch.update({
      where: { id },
      data: {
        status: data.status ?? undefined,
        quantity: data.quantity !== undefined ? Number(data.quantity) : undefined,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
      },
    });
  }

  async remove(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const batch = await this.prisma.stockBatch.findFirst({ where: { id, tenantId: tenant.id } });
    if (!batch) throw new NotFoundException('Lote não encontrado');
    await this.prisma.stockBatch.delete({ where: { id } });
    return { ok: true };
  }
}
