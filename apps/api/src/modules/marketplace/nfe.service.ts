import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

interface ParsedNfeItem {
  cProd: string;
  xProd: string;
  ncm?: string;
  cfop?: string;
  cEAN?: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
}

export interface ParsedNfeDup {
  nDup: string;
  dVenc: Date;
  vDupCents: number;
}

interface ParsedNfe {
  accessKey: string;
  nfeNumber: string;
  series: string;
  issueDate: Date;
  totalProducts: number;
  totalNfe: number;
  supplierCnpj?: string;
  supplierName?: string;
  items: ParsedNfeItem[];
  duplicatas: ParsedNfeDup[];
}

function pickText(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return undefined;
  return m[1].trim();
}

function pickNumber(xml: string, tag: string): number {
  const t = pickText(xml, tag);
  if (!t) return 0;
  return Number(t.replace(',', '.')) || 0;
}

@Injectable()
export class NfeService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private async getTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" não encontrado`);
    return tenant;
  }

  /**
   * Fator de conversão caixa/fardo → unidade.
   *
   * H8: `reconcile` gravava `costPriceCents = vUnCom` (preço da caixa) enquanto
   * `finalize` gravava `vUnCom / multiplier` (preço da unidade). O mesmo
   * produto ficava com dois custos diferentes dependendo de qual caminho rodou
   * por último. Extraído aqui para que os dois usem a mesma regra.
   */
  private packMultiplier(product: { packQuantity?: number | null } | null, uCom?: string | null): number {
    const packFactor = Number(product?.packQuantity) || 1;
    const isBoxUnit = ['CX', 'FD', 'PCT', 'FARDO', 'CAIXA'].includes(
      (uCom || '').toUpperCase(),
    );
    return isBoxUnit && packFactor > 1 ? packFactor : 1;
  }

  /** Custo unitário real, já normalizado pela conversão de embalagem. */
  private unitCostCents(vUnCom: number, multiplier: number): number {
    return multiplier > 1 ? Math.round(vUnCom / multiplier) : vUnCom;
  }

  parseXml(xmlRaw: string): ParsedNfe {
    if (!xmlRaw || xmlRaw.length < 200) {
      throw new BadRequestException('XML vazio ou muito pequeno');
    }
    const infNFeMatch = xmlRaw.match(/<infNFe[^>]*Id="NFe(\d{44})"/i);
    const accessKey = infNFeMatch?.[1] || pickText(xmlRaw, 'chNFe') || '';
    if (!accessKey || accessKey.length !== 44) {
      throw new BadRequestException('Chave de acesso NF-e não encontrada (precisa ter 44 dígitos)');
    }

    const ide = xmlRaw.match(/<ide>([\s\S]*?)<\/ide>/i)?.[1] || '';
    const nfeNumber = pickText(ide, 'nNF') || '0';
    const series = pickText(ide, 'serie') || '1';
    const dtEmi = pickText(ide, 'dhEmi') || pickText(ide, 'dEmi') || new Date().toISOString();
    const issueDate = new Date(dtEmi);
    if (isNaN(issueDate.getTime())) {
      throw new BadRequestException('Data de emissão inválida');
    }

    const emit = xmlRaw.match(/<emit>([\s\S]*?)<\/emit>/i)?.[1] || '';
    const supplierCnpj = (pickText(emit, 'CNPJ') || pickText(emit, 'CPF') || '').replace(/\D/g, '') || undefined;
    const supplierName = pickText(emit, 'xNome');

    const total = xmlRaw.match(/<ICMSTotal>([\s\S]*?)<\/ICMSTotal>/i)?.[1] || '';
    const totalProducts = Math.round(pickNumber(total, 'vProd') * 100);
    const totalNfe = Math.round(pickNumber(total, 'vNF') * 100);

    const dets = [...xmlRaw.matchAll(/<det[^>]*>([\s\S]*?)<\/det>/gi)].map((m) => m[1]);
    const items: ParsedNfeItem[] = dets.map((det) => {
      const prod = det.match(/<prod>([\s\S]*?)<\/prod>/i)?.[1] || '';
      return {
        cProd: pickText(prod, 'cProd') || '',
        xProd: pickText(prod, 'xProd') || 'Item sem descrição',
        ncm: pickText(prod, 'NCM'),
        cfop: pickText(prod, 'CFOP'),
        cEAN: pickText(prod, 'cEAN') || undefined,
        uCom: pickText(prod, 'uCom') || 'UN',
        qCom: pickNumber(prod, 'qCom'),
        vUnCom: Math.round(pickNumber(prod, 'vUnCom') * 100),
        vProd: Math.round(pickNumber(prod, 'vProd') * 100),
      };
    });

    if (!items.length) {
      throw new BadRequestException('Nenhum item encontrado no XML');
    }

    // Cobrança & Duplicatas (Contas a Pagar)
    const cobr = xmlRaw.match(/<cobr>([\s\S]*?)<\/cobr>/i)?.[1] || '';
    const dupMatches = [...cobr.matchAll(/<dup>([\s\S]*?)<\/dup>/gi)].map((m) => m[1]);
    const duplicatas: ParsedNfeDup[] = dupMatches.map((dupXml, idx) => {
      const nDup = pickText(dupXml, 'nDup') || String(idx + 1);
      const dVencStr = pickText(dupXml, 'dVenc') || new Date().toISOString().slice(0, 10);
      const dVenc = new Date(dVencStr);
      const vDupCents = Math.round(pickNumber(dupXml, 'vDup') * 100);
      return { nDup, dVenc, vDupCents };
    });

    return {
      accessKey,
      nfeNumber,
      series,
      issueDate,
      totalProducts,
      totalNfe,
      supplierCnpj,
      supplierName,
      items,
      duplicatas,
    };
  }

  async import(slug: string, xmlRaw: string) {
    const tenant = await this.getTenant(slug);
    const parsed = this.parseXml(xmlRaw);

    // C7: checagem escopada por tenant. Antes era `findUnique({ accessKey })`,
    // global — o tenant B recebia "já foi importada" para uma nota do tenant A.
    const dup = await this.prisma.nfeEntry.findFirst({
      where: { tenantId: tenant.id, accessKey: parsed.accessKey },
      select: { id: true },
    });
    if (dup) {
      throw new BadRequestException('Esta NF-e já foi importada nesta empresa.');
    }

    // H3: fornecedor + NF-e na mesma transação. Antes o fornecedor era criado
    // fora e, se a NF-e falhasse, ficava órfão no cadastro.
    const nfe = await this.prisma.$transaction(async (tx) => {
      let supplierId: string | undefined;

      if (parsed.supplierCnpj) {
        const existing = await tx.supplier.findFirst({
          where: { tenantId: tenant.id, cnpj: parsed.supplierCnpj },
          select: { id: true },
        });

        if (existing) {
          supplierId = existing.id;
        } else if (parsed.supplierName) {
          const created = await tx.supplier.create({
            data: {
              tenantId: tenant.id,
              legalName: parsed.supplierName,
              cnpj: parsed.supplierCnpj,
              isActive: true,
            },
            select: { id: true },
          });
          supplierId = created.id;
        }
      }

      return tx.nfeEntry.create({
        data: {
          tenantId: tenant.id,
          supplierId,
          accessKey: parsed.accessKey,
          nfeNumber: parsed.nfeNumber,
          series: parsed.series,
          issueDate: parsed.issueDate,
          totalCents: parsed.totalNfe,
          xmlRaw,
          status: 'PENDING_RECONCILE',
          items: {
            create: parsed.items.map((i) => ({
              cProd: i.cProd,
              xProd: i.xProd,
              ncm: i.ncm,
              cfop: i.cfop,
              cEAN: i.cEAN,
              uCom: i.uCom,
              qCom: i.qCom,
              vUnCom: i.vUnCom,
              vProd: i.vProd,
              reconciliationType: null,
              productId: null,
            })),
          },
        },
        include: { items: true, supplier: true },
      });
    });

    await this.autoReconcile(tenant.id, nfe.id);

    return this.get(slug, nfe.id);
  }

  async autoReconcile(tenantId: string, nfeEntryId: string) {
    const items = await this.prisma.nfeEntryItem.findMany({ where: { nfeEntryId } });
    for (const item of items) {
      if (item.productId) continue;
      let matched: { id: string } | null = null;
      let type: 'AUTOMATIC_EAN' | 'AUTOMATIC_SKU' | null = null;
      if (item.cEAN && item.cEAN !== 'SEM GTIN') {
        matched = await this.prisma.product.findFirst({
          where: { tenantId, barcode: item.cEAN },
          select: { id: true },
        });
        if (matched) type = 'AUTOMATIC_EAN';
      }
      if (!matched && item.cProd) {
        matched = await this.prisma.product.findFirst({
          where: { tenantId, sku: item.cProd },
          select: { id: true },
        });
        if (matched) type = 'AUTOMATIC_SKU';
      }
      if (matched) {
        await this.prisma.nfeEntryItem.update({
          where: { id: item.id },
          data: { productId: matched.id, reconciliationType: type },
        });
      }
    }
    const remaining = await this.prisma.nfeEntryItem.count({
      where: { nfeEntryId, productId: null },
    });
    if (remaining === 0) {
      await this.prisma.nfeEntry.update({
        where: { id: nfeEntryId },
        data: { status: 'RECONCILED' },
      });
    }
  }

  async list(slug: string) {
    const tenant = await this.getTenant(slug);
    return this.prisma.nfeEntry.findMany({
      where: { tenantId: tenant.id },
      orderBy: { issueDate: 'desc' },
      include: {
        supplier: true,
        _count: { select: { items: true, batches: true } },
      },
    });
  }

  async get(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const nfe = await this.prisma.nfeEntry.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    return nfe;
  }

  async reconcile(slug: string, id: string, itemId: string, data: any) {
    const tenant = await this.getTenant(slug);
    const item = await this.prisma.nfeEntryItem.findFirst({
      where: { id: itemId, nfeEntry: { tenantId: tenant.id } },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    let productId: string | null = null;
    let type: string | null = null;

    if (data.action === 'LINK_EXISTING') {
      if (!data.productId) throw new BadRequestException('productId obrigatório');
      const product = await this.prisma.product.findFirst({
        where: { id: data.productId, tenantId: tenant.id },
      });
      if (!product) throw new NotFoundException('Produto não encontrado');

      // H8: mesmo cálculo de custo usado em `finalize` — antes aqui entrava o
      // preço da caixa e o produto ficava com custo divergente.
      const multiplier = this.packMultiplier(product, item.uCom);
      productId = product.id;
      type = 'MANUAL';
      await this.prisma.product.update({
        where: { id: product.id },
        data: { costPriceCents: this.unitCostCents(item.vUnCom, multiplier) },
      });
    } else if (data.action === 'CREATE_NEW') {
      if (!data.name) throw new BadRequestException('name obrigatório');

      // M3: `Product.barcode` não é único no schema, então um EAN já existente
      // gerava um produto duplicado em silêncio. Melhor vincular ao existente.
      const barcode = item.cEAN && item.cEAN !== 'SEM GTIN' ? item.cEAN : null;
      if (barcode) {
        const alreadyExists = await this.prisma.product.findFirst({
          where: { tenantId: tenant.id, barcode },
          select: { id: true },
        });
        if (alreadyExists) {
          throw new BadRequestException(
            `Já existe um produto com o código de barras ${barcode}. Use "Vincular existente".`,
          );
        }
      }

      const multiplier = this.packMultiplier(null, item.uCom);
      const costCents = this.unitCostCents(item.vUnCom, multiplier);

      const product = await this.prisma.product.create({
        data: {
          tenantId: tenant.id,
          name: data.name,
          barcode: barcode ?? undefined,
          sku: item.cProd || undefined,
          salePriceCents: Math.round(costCents * 1.4),
          costPriceCents: costCents,
          stockQuantity: 0,
          unit: item.uCom || 'UN',
          isActive: true,
        },
      });
      productId = product.id;
      type = 'NEW_PRODUCT';
    } else {
      throw new BadRequestException('Ação inválida');
    }

    await this.prisma.nfeEntryItem.update({
      where: { id: itemId },
      data: { productId, reconciliationType: type },
    });

    const remaining = await this.prisma.nfeEntryItem.count({
      where: { nfeEntryId: id, productId: null },
    });
    if (remaining === 0) {
      await this.prisma.nfeEntry.update({
        where: { id },
        data: { status: 'RECONCILED' },
      });
    }

    return this.get(slug, id);
  }

  async finalize(slug: string, id: string) {
    const tenant = await this.getTenant(slug);
    const nfe = await this.prisma.nfeEntry.findFirst({
      where: { id, tenantId: tenant.id },
      include: { items: { include: { product: true } }, supplier: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status === 'STOCKED') return nfe;

    const unreconciled = nfe.items.filter((i) => !i.productId);
    if (unreconciled.length > 0) {
      throw new BadRequestException(
        `Existem ${unreconciled.length} item(ns) sem produto vinculado. Faça a conciliação antes de efetivar.`,
      );
    }

    // H9: antes o parse era envolto em `catch {}` silencioso e, na falha, uma
    // conta a pagar era criada com vencimento chutado em 30 dias. Um erro de
    // leitura não pode virar lançamento financeiro inventado — agora falha.
    let parsedDups: ParsedNfeDup[] = [];
    if (nfe.xmlRaw) {
      const parsed = this.parseXml(nfe.xmlRaw);
      parsedDups = parsed.duplicatas;
    }

    return this.prisma.$transaction(async (tx) => {
      // C6: a guarda de idempotência precisa ser ATÔMICA. Antes ficava fora da
      // transação (`if (nfe.status === 'STOCKED') return`), então duas chamadas
      // concorrentes passavam ambas e lançavam estoque em dobro, além de criar
      // contas a pagar duplicadas. Este updateMany condicional é a trava: só
      // uma chamada consegue mudar o status para STOCKED.
      const claimed = await tx.nfeEntry.updateMany({
        where: { id, tenantId: tenant.id, status: { not: 'STOCKED' } },
        data: { status: 'STOCKED' },
      });

      if (claimed.count === 0) {
        // Outra chamada efetivou primeiro — devolve o estado atual sem relançar.
        return tx.nfeEntry.findUniqueOrThrow({
          where: { id },
          include: { items: { include: { product: true } } },
        });
      }

      // 1. Processar itens de estoque e Kardex
      for (const item of nfe.items) {
        if (!item.productId) continue;

        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) continue;

        // Fator de conversão (fardo/caixa vs unidade) — mesma regra do reconcile
        const multiplier = this.packMultiplier(product, item.uCom);
        const totalQuantityToAdd = item.qCom * multiplier;

        // M1: quantidade não positiva gera lote e saldo negativos.
        if (!(totalQuantityToAdd > 0)) {
          throw new BadRequestException(
            `Quantidade inválida no item "${item.xProd}" (${item.qCom} ${item.uCom}).`,
          );
        }

        const costCents = this.unitCostCents(item.vUnCom, multiplier);

        // Criar lote
        await tx.stockBatch.create({
          data: {
            tenantId: tenant.id,
            productId: item.productId,
            lotNumber: `${nfe.series}-${nfe.nfeNumber}-${item.cProd}`.slice(0, 32),
            quantity: totalQuantityToAdd,
            costCents,
            nfeEntryId: nfe.id,
            status: 'ACTIVE',
          },
        });

        // Atualizar estoque e preço de custo
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { increment: totalQuantityToAdd },
            costPriceCents: costCents,
          },
        });

        // Registrar no Kardex (StockMovement)
        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: item.productId,
            type: 'ENTRY_NFE',
            quantity: totalQuantityToAdd,
            balanceAfter: Number(updatedProduct.stockQuantity),
            referenceId: nfe.id,
            notes: `Entrada NF-e #${nfe.nfeNumber} (${nfe.supplier?.tradeName || nfe.supplier?.legalName || 'Fornecedor'})${multiplier > 1 ? ` [Conv. 1 ${item.uCom} = ${multiplier} UN]` : ''}`,
          },
        });
      }

      // 2. Gerar Contas a Pagar (duplicatas do fornecedor)
      if (parsedDups.length > 0) {
        for (const dup of parsedDups) {
          await tx.billPayable.create({
            data: {
              tenantId: tenant.id,
              supplierId: nfe.supplierId || null,
              description: `NF-e #${nfe.nfeNumber} Parc. ${dup.nDup} (${nfe.supplier?.tradeName || nfe.supplier?.legalName || 'Fornecedor'})`,
              category: 'FORNECEDOR',
              amountCents: dup.vDupCents,
              dueDate: dup.dVenc,
              status: 'PENDING',
              notes: `Chave NF-e: ${nfe.accessKey}`,
            },
          });
        }
      } else if (nfe.totalCents > 0) {
        // Se a nota não detalhou duplicatas mas tem valor total, cria 1 título com 30 dias
        await tx.billPayable.create({
          data: {
            tenantId: tenant.id,
            supplierId: nfe.supplierId || null,
            description: `NF-e #${nfe.nfeNumber} (${nfe.supplier?.tradeName || nfe.supplier?.legalName || 'Fornecedor'})`,
            category: 'FORNECEDOR',
            amountCents: nfe.totalCents,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'PENDING',
            notes: `Chave NF-e: ${nfe.accessKey}`,
          },
        });
      }

      // 3. Status já foi reivindicado como STOCKED no início da transação;
      // aqui apenas devolvemos o estado final consistente.
      return tx.nfeEntry.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { product: true } } },
      });
    });
  }
}
