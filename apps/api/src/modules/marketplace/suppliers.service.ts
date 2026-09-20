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

    // H7: `create` checava CNPJ duplicado, `update` não. Sem isto o usuário
    // recebia um 500 cru da constraint do banco em vez de uma mensagem clara.
    let cnpjClean: string | undefined;
    if (data.cnpj !== undefined) {
      cnpjClean = data.cnpj ? String(data.cnpj).replace(/\D/g, '') : undefined;
      if (cnpjClean) {
        const dup = await this.prisma.supplier.findFirst({
          where: { tenantId: tenant.id, cnpj: cnpjClean, id: { not: id } },
          select: { id: true, legalName: true },
        });
        if (dup) {
          throw new BadRequestException(
            `Já existe outro fornecedor com o CNPJ ${cnpjClean} (${dup.legalName}).`,
          );
        }
      }
    }

    const leadTimeDays =
      data.leadTimeDays !== undefined ? Number(data.leadTimeDays) : undefined;
    if (leadTimeDays !== undefined && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) {
      throw new BadRequestException('Prazo de entrega não pode ser negativo');
    }

    const minOrderCents =
      data.minOrderCents !== undefined ? Number(data.minOrderCents) : undefined;
    if (minOrderCents !== undefined && (!Number.isFinite(minOrderCents) || minOrderCents < 0)) {
      throw new BadRequestException('Pedido mínimo não pode ser negativo');
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        legalName: data.legalName?.trim() ?? undefined,
        tradeName: data.tradeName?.trim() ?? undefined,
        cnpj: cnpjClean ?? undefined,
        email: data.email?.trim() ?? undefined,
        phone: data.phone?.trim() ?? undefined,
        leadTimeDays,
        minOrderCents,
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

  /**
   * Remove um fornecedor.
   *
   * M7: antes chamava `delete` direto. Com pedidos/NF-e/contas vinculados, o
   * banco barrava por FK e o usuário recebia um 500 cru. Agora a dependência é
   * detectada e explicada — e o caminho recomendado é inativar, não apagar.
   */
  async remove(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        _count: { select: { orders: true, nfeEntries: true, products: true, billsPayable: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');

    const { orders, nfeEntries, billsPayable } = supplier._count;
    if (orders > 0 || nfeEntries > 0 || billsPayable > 0) {
      const parts = [
        orders > 0 ? `${orders} pedido(s) de compra` : null,
        nfeEntries > 0 ? `${nfeEntries} NF-e` : null,
        billsPayable > 0 ? `${billsPayable} conta(s) a pagar` : null,
      ].filter(Boolean);

      throw new BadRequestException(
        `Este fornecedor tem ${parts.join(', ')} vinculados e não pode ser excluído — o histórico seria perdido. Inative-o em vez de excluir.`,
      );
    }

    // Sem histórico: os vínculos de produto podem ir junto (cascade).
    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  }

  async linkProduct(slug: string, supplierId: string, data: any) {
    const tenant = await this.getTenant(slug);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId: tenant.id } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    if (!data.productId) throw new BadRequestException('productId obrigatório');

    // H6: o `upsert` gravava o `tenantId` do fornecedor mas aceitava qualquer
    // `productId`. Isso permitia vincular um produto de OUTRO tenant a este
    // fornecedor. Agora o produto é validado dentro do tenant.
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado nesta empresa');

    const costCents = data.costCents !== undefined ? Number(data.costCents) : undefined;
    if (costCents !== undefined && (!Number.isFinite(costCents) || costCents < 0)) {
      throw new BadRequestException('Custo não pode ser negativo');
    }

    const packSize = data.packSize !== undefined ? Number(data.packSize) : undefined;
    if (packSize !== undefined && (!Number.isFinite(packSize) || packSize < 1)) {
      throw new BadRequestException('Tamanho da embalagem deve ser ao menos 1');
    }

    const minOrderQty = data.minOrderQty !== undefined ? Number(data.minOrderQty) : undefined;
    if (minOrderQty !== undefined && (!Number.isFinite(minOrderQty) || minOrderQty < 1)) {
      throw new BadRequestException('Quantidade mínima deve ser ao menos 1');
    }

    return this.prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: data.productId, supplierId } },
      create: {
        tenantId: tenant.id,
        productId: data.productId,
        supplierId,
        supplierSku: data.supplierSku || null,
        costCents: costCents ?? 0,
        packSize: packSize ?? 1,
        minOrderQty: minOrderQty ?? 1,
        isPreferred: data.isPreferred ?? false,
      },
      update: {
        supplierSku: data.supplierSku ?? undefined,
        costCents,
        packSize,
        minOrderQty,
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
