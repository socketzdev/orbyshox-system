import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private async getTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" não encontrado`);
    return tenant;
  }

  async list(slug: string, query: any = {}) {
    const tenant = await this.getTenant(slug);
    const { search, active } = query;
    const where: any = { tenantId: tenant.id };
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;
    if (search) {
      where.OR = [
        { legalName: { contains: String(search) } },
        { tradeName: { contains: String(search) } },
        { cnpj: { contains: String(search) } },
        { email: { contains: String(search) } },
      ];
    }
    const items = await this.prisma.supplier.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { tradeName: 'asc' }],
      include: { _count: { select: { products: true, orders: true } } },
    });
    return items;
  }

  async get(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        products: { include: { product: true } },
        _count: { select: { products: true, orders: true, nfeEntries: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }

  async create(slug: string, data: any) {
    const tenant = await this.getTenant(slug);
    const cnpjClean = (data.cnpj || '').replace(/\D/g, '') || null;
    if (!data.legalName || data.legalName.trim().length < 2) {
      throw new BadRequestException('Razão social é obrigatória');
    }
    if (cnpjClean) {
      const dup = await this.prisma.supplier.findFirst({
        where: { tenantId: tenant.id, cnpj: cnpjClean },
      });
      if (dup) throw new BadRequestException(`Já existe fornecedor com CNPJ ${cnpjClean}`);
    }
    return this.prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        legalName: data.legalName.trim(),
        tradeName: data.tradeName?.trim() || null,
        cnpj: cnpjClean,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        leadTimeDays: Number(data.leadTimeDays) || 3,
        minOrderCents: Number(data.minOrderCents) || 0,
        isActive: data.isActive ?? true,
        notes: data.notes?.trim() || null,
      },
    });
  }

  async update(slug: string, id: string, data: any) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId: tenant.id } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return this.prisma.supplier.update({
      where: { id },
      data: {
        legalName: data.legalName?.trim() ?? undefined,
        tradeName: data.tradeName?.trim() ?? undefined,
        cnpj: data.cnpj ? data.cnpj.replace(/\D/g, '') : undefined,
        email: data.email?.trim() ?? undefined,
        phone: data.phone?.trim() ?? undefined,
        leadTimeDays: data.leadTimeDays !== undefined ? Number(data.leadTimeDays) : undefined,
        minOrderCents: data.minOrderCents !== undefined ? Number(data.minOrderCents) : undefined,
        isActive: data.isActive ?? undefined,
        notes: data.notes?.trim() ?? undefined,
      },
    });
  }

  async toggleActive(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId: tenant.id } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: !supplier.isActive },
    });
  }

  async remove(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId: tenant.id } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  }

  async linkProduct(slug: string, supplierId: string, data: any) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId: tenant.id } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    if (!data.productId) throw new BadRequestException('productId obrigatório');
    return this.prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: data.productId, supplierId } },
      create: {
        tenantId: tenant.id,
        productId: data.productId,
        supplierId,
        supplierSku: data.supplierSku || null,
        costCents: Number(data.costCents) || 0,
        packSize: Number(data.packSize) || 1,
        minOrderQty: Number(data.minOrderQty) || 1,
        isPreferred: data.isPreferred ?? false,
      },
      update: {
        supplierSku: data.supplierSku ?? undefined,
        costCents: data.costCents !== undefined ? Number(data.costCents) : undefined,
        packSize: data.packSize !== undefined ? Number(data.packSize) : undefined,
        minOrderQty: data.minOrderQty !== undefined ? Number(data.minOrderQty) : undefined,
        isPreferred: data.isPreferred ?? undefined,
      },
    });
  }

  async unlinkProduct(slug: string, supplierId: string, linkId: string) {
    const tenant = await this.getTenant(slug);
    const link = await this.prisma.productSupplier.findFirst({ where: { id: linkId, tenantId: tenant.id } });
    if (!link) throw new NotFoundException('Vínculo não encontrado');
    await this.prisma.productSupplier.delete({ where: { id: linkId } });
    return { ok: true };
  }
}
