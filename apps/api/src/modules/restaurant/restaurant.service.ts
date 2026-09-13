import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { RestaurantGateway } from './restaurant.gateway';

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  notes?: string;
  modifiers?: {
    modifierItemId: string;
  }[];
}

export interface CreateOrderDto {
  origin?: 'TABLET' | 'QR_CODE' | 'WAITER' | 'POS';
  notes?: string;
  items: CreateOrderItemInput[];
}

@Injectable()
export class RestaurantService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly gateway: RestaurantGateway,
  ) {}

  /**
   * Lista mesas do restaurante com status visual e contadores em tempo real.
   */
  async listTables(companyId: string) {
    const tables = await this.prisma.table.findMany({
      where: { companyId },
      orderBy: { number: 'asc' },
      include: {
        devices: {
          select: { id: true, name: true, type: true, status: true, lastHeartbeatAt: true },
        },
        waiterCalls: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        },
        tableSessions: {
          where: { status: 'OPEN' },
          include: {
            orders: {
              where: { status: { notIn: ['CANCELLED', 'COMPLETED'] } },
              include: { items: { include: { product: true } } },
            },
          },
          take: 1,
        },
      },
    });

    return tables.map((table) => {
      const activeSession = table.tableSessions[0] || null;
      const pendingCalls = table.waiterCalls;
      const activeOrders = activeSession?.orders || [];
      const sessionTotalCents = activeOrders.reduce((sum, ord) => sum + ord.totalCents, 0);

      return {
        id: table.id,
        number: table.number,
        label: table.label,
        capacity: table.capacity,
        status: table.status, // FREE | OCCUPIED
        hasPendingCall: pendingCalls.length > 0,
        pendingCalls,
        activeOrdersCount: activeOrders.length,
        sessionTotalCents,
        activeSessionId: activeSession?.id || null,
        devices: table.devices,
      };
    });
  }

  /**
   * Adiciona uma nova mesa ao restaurante.
   */
  async createTable(companyId: string, data: { number: number; label?: string; capacity?: number }) {
    const existing = await this.prisma.table.findUnique({
      where: { companyId_number: { companyId, number: data.number } },
    });
    if (existing) {
      throw new BadRequestException(`Já existe uma mesa com o número ${data.number}`);
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const qrTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const label = data.label || `Mesa ${String(data.number).padStart(2, '0')}`;

    const table = await this.prisma.table.create({
      data: {
        companyId,
        number: data.number,
        label,
        capacity: data.capacity || 4,
        status: 'FREE',
        qrTokenHash,
      },
    });

    return {
      ...table,
      qrToken: rawToken, // Exibido uma única vez para impressão
    };
  }

  /**
   * Criação de mesas em lote (usada no Assistente de Primeiro Acesso do Restaurante)
   */
  async batchCreateTables(
    companyId: string,
    data: { count: number; capacity?: number; startNumber?: number },
  ) {
    const count = Math.min(Math.max(1, data.count || 1), 100);
    const capacity = Math.max(1, data.capacity || 4);

    // Obter o maior número de mesa existente para não colidir
    const existingTables = await this.prisma.table.findMany({
      where: { companyId },
      select: { number: true },
      orderBy: { number: 'desc' },
      take: 1,
    });
    const defaultStart = existingTables.length > 0 ? existingTables[0].number + 1 : 1;
    const startNumber = data.startNumber || defaultStart;

    const created = [];
    for (let i = 0; i < count; i++) {
      const num = startNumber + i;
      const rawToken = crypto.randomBytes(24).toString('hex');
      const qrTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const label = `Mesa ${String(num).padStart(2, '0')}`;

      const table = await this.prisma.table.upsert({
        where: { companyId_number: { companyId, number: num } },
        create: {
          companyId,
          number: num,
          label,
          capacity,
          status: 'FREE',
          qrTokenHash,
        },
        update: {
          label,
          capacity,
        },
      });

      created.push({
        ...table,
        qrToken: rawToken,
      });
    }

    return created;
  }

  /**
   * Pareamento de Tablet Fixo na Mesa:
   * Gera um Device Token permanente, invalida dispositivos anteriores da mesa e salva o hash.
   */
  async pairDevice(companyId: string, tableId: string, deviceName?: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    // Revoga dispositivos anteriores vinculados a esta mesa
    await this.prisma.device.updateMany({
      where: { tableId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });

    const rawDeviceToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawDeviceToken).digest('hex');
    const name = deviceName || `Tablet ${table.label}`;

    const device = await this.prisma.device.create({
      data: {
        companyId,
        tableId,
        name,
        type: 'TABLET',
        tokenHash,
        status: 'ACTIVE',
        lastHeartbeatAt: new Date(),
      },
    });

    return {
      deviceId: device.id,
      deviceToken: rawDeviceToken, // Token em texto puro retornado uma única vez
      tableNumber: table.number,
      tableLabel: table.label,
    };
  }

  /**
   * Rotaciona o QR Code de uma mesa (caso o papel seja danificado/furtado).
   */
  async rotateTableQr(companyId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    const newRawToken = crypto.randomBytes(24).toString('hex');
    const qrTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

    await this.prisma.table.update({
      where: { id: tableId },
      data: { qrTokenHash },
    });

    return {
      tableId: table.id,
      tableNumber: table.number,
      newQrToken: newRawToken,
    };
  }

  /**
   * Resolução por QR Code (Cliente no Navegador via /q/:qrToken)
   * Zero-trust: descobre a empresa e a mesa a partir do token opaco hash.
   */
  async resolveByQrToken(qrToken: string) {
    const qrTokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');
    const table = await this.prisma.table.findFirst({
      where: { qrTokenHash },
      include: {
        company: {
          select: { id: true, name: true, category: true, branding: true, active: true },
        },
      },
    });

    if (!table || !table.company || !table.company.active) {
      throw new NotFoundException('Mesa ou QR Code não encontrado ou inativo');
    }

    const menu = await this.getCompanyMenu(table.companyId);

    // Verifica se já há sessão aberta
    const activeSession = await this.prisma.tableSession.findFirst({
      where: { companyId: table.companyId, tableId: table.id, status: 'OPEN' },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { items: { include: { product: true, modifiers: true } } },
        },
      },
    });

    return {
      table: { id: table.id, number: table.number, label: table.label, status: table.status },
      company: {
        id: table.company.id,
        name: table.company.name,
        category: table.company.category,
        branding: JSON.parse(table.company.branding || '{}'),
      },
      menu,
      activeSession,
    };
  }

  /**
   * Resolução por Device Token (Tablet Fixo de Mesa)
   */
  async resolveByDeviceToken(deviceToken: string) {
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const device = await this.prisma.device.findUnique({
      where: { tokenHash },
      include: {
        table: true,
        company: {
          select: { id: true, name: true, category: true, branding: true, active: true },
        },
      },
    });

    if (!device || device.status !== 'ACTIVE' || !device.table || !device.company.active) {
      throw new ForbiddenException('Dispositivo tablet não autorizado ou revogado');
    }

    // Atualiza heartbeat em background
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastHeartbeatAt: new Date() },
    });

    const menu = await this.getCompanyMenu(device.companyId);

    const activeSession = await this.prisma.tableSession.findFirst({
      where: { companyId: device.companyId, tableId: device.table.id, status: 'OPEN' },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { items: { include: { product: true, modifiers: true } } },
        },
      },
    });

    return {
      device: { id: device.id, name: device.name },
      table: {
        id: device.table.id,
        number: device.table.number,
        label: device.table.label,
        status: device.table.status,
      },
      company: {
        id: device.company.id,
        name: device.company.name,
        category: device.company.category,
        branding: JSON.parse(device.company.branding || '{}'),
      },
      menu,
      activeSession,
    };
  }

  /**
   * Retorna o cardápio estruturado da empresa.
   */
  async getCompanyMenu(companyId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
      select: { id: true },
    });
    const tenantId = tenant?.id || companyId;

    const categories: any[] = await this.prisma.productCategory.findMany({
      where: {
        OR: [{ companyId }, { tenantId }],
        active: true,
      },
      orderBy: { order: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          include: {
            modifierGroups: {
              include: { items: true },
            },
          },
        },
      },
    });

    // Produtos avulsos sem categoria cadastrada
    const uncategorizedProducts = await this.prisma.product.findMany({
      where: {
        OR: [{ companyId }, { tenantId }],
        categoryId: null,
        isActive: true,
      },
      include: {
        modifierGroups: {
          include: { items: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (uncategorizedProducts.length > 0) {
      categories.push({
        id: 'uncategorized',
        tenantId,
        companyId,
        name: 'Geral & Outros',
        color: '#64748b',
        sortOrder: 9999,
        order: 9999,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        products: uncategorizedProducts,
      });
    }

    return categories;
  }

  /**
   * Criação de Pedido:
   * Valida estritamente companyId e tableId a partir da credencial de contexto.
   * Abre/reutiliza comanda (TableSession).
   * Valida regras de modificadores e calcula preços no servidor.
   * Emite evento em tempo real para o KDS da Cozinha e o Garçom.
   */
  async createOrder(
    context: { companyId: string; tableId: string },
    input: CreateOrderDto,
  ) {
    const { companyId, tableId } = context;

    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('O pedido deve conter pelo menos 1 item');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Obter ou criar TableSession aberta
      let session = await tx.tableSession.findFirst({
        where: { companyId, tableId, status: 'OPEN' },
      });

      if (!session) {
        session = await tx.tableSession.create({
          data: {
            companyId,
            tableId,
            status: 'OPEN',
          },
        });
      }

      // Marcar mesa como OCCUPIED
      await tx.table.update({
        where: { id: tableId },
        data: { status: 'OCCUPIED' },
      });

      // 2. Obter próximo orderNumber sequencial
      const lastOrder = await tx.order.findFirst({
        where: { companyId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber || 100) + 1;

      // 3. Processar itens, validar regras de modificadores e calcular totais
      let totalOrderCents = 0;
      const orderItemsToCreate: any[] = [];

      for (const itemInput of input.items) {
        const product: any = await tx.product.findFirst({
          where: {
            id: itemInput.productId,
            OR: [
              { companyId },
              { tenantId: companyId },
              { company: { slug: companyId } },
              { tenant: { slug: companyId } },
            ],
            isActive: true,
          },
          include: {
            modifierGroups: {
              include: { items: true },
            },
          },
        });

        if (!product) {
          throw new BadRequestException(`Produto ${itemInput.productId} não encontrado ou inativo`);
        }

        const qty = Math.max(1, itemInput.quantity || 1);
        let itemUnitCost = product.salePriceCents || 0;
        const selectedModifiersToCreate: any[] = [];

        // Validar grupos de modificadores
        const modifierGroups = product.modifierGroups || [];
        if (modifierGroups.length > 0) {
          for (const group of modifierGroups) {
            const selectedInThisGroup = (itemInput.modifiers || []).filter((m: any) =>
              (group.items || []).some((gi: any) => gi.id === m.modifierItemId),
            );

            // Se for obrigatório e nenhum item foi selecionado pelo garçom / clique rápido,
            // auto-seleciona a(s) primeira(s) opção(ões) padrão (ex: "Ao Ponto", "Sem Pimenta")
            if (group.isRequired && selectedInThisGroup.length < group.minSelectable) {
              if ((input.origin === 'WAITER' || !input.origin) && group.items && group.items.length > 0) {
                const autoItems = group.items.slice(0, group.minSelectable);
                for (const autoItem of autoItems) {
                  itemUnitCost += autoItem.priceCents;
                  selectedModifiersToCreate.push({
                    modifierItemId: autoItem.id,
                    name: autoItem.name,
                    priceCents: autoItem.priceCents,
                  });
                }
                continue;
              }
              throw new BadRequestException(
                `O grupo "${group.name}" do produto "${product.name}" exige no mínimo ${group.minSelectable} opção(ões)`,
              );
            }

            if (selectedInThisGroup.length > group.maxSelectable) {
              throw new BadRequestException(
                `O grupo "${group.name}" do produto "${product.name}" permite no máximo ${group.maxSelectable} opção(ões)`,
              );
            }

            for (const modInput of selectedInThisGroup) {
              const matchedModItem = (group.items || []).find((gi: any) => gi.id === modInput.modifierItemId);
              if (matchedModItem) {
                itemUnitCost += matchedModItem.priceCents;
                selectedModifiersToCreate.push({
                  modifierItemId: matchedModItem.id,
                  name: matchedModItem.name,
                  priceCents: matchedModItem.priceCents,
                });
              }
            }
          }
        }

        const lineTotal = itemUnitCost * qty;
        totalOrderCents += lineTotal;

        orderItemsToCreate.push({
          productId: product.id,
          quantity: qty,
          unitPriceCents: itemUnitCost,
          unitPrice: itemUnitCost,
          totalPrice: lineTotal,
          notes: itemInput.notes || null,
          modifiers: selectedModifiersToCreate,
        });
      }

      // 4. Salvar Order
      const order = await tx.order.create({
        data: {
          companyId,
          tableId,
          tableSessionId: session.id,
          orderNumber,
          origin: input.origin || 'TABLET',
          status: 'PENDING',
          totalCents: totalOrderCents,
          subtotalCents: totalOrderCents,
          notes: input.notes || null,
          items: {
            create: orderItemsToCreate.map((oi) => ({
              productId: oi.productId,
              quantity: oi.quantity,
              unitPrice: oi.unitPrice,
              unitPriceCents: oi.unitPriceCents,
              totalPrice: oi.totalPrice,
              notes: oi.notes,
              modifiers: {
                create: oi.modifiers.map((m: any) => ({
                  modifierItemId: m.modifierItemId,
                  name: m.name,
                  priceCents: m.priceCents,
                })),
              },
            })),
          },
        },
        include: {
          table: { select: { id: true, number: true, label: true } },
          items: {
            include: {
              product: { select: { id: true, name: true } },
              modifiers: true,
            },
          },
        },
      });

      // 5. Emitir evento WebSocket para a Cozinha KDS e o Garçom
      this.gateway.notifyOrderCreated(companyId, order);
      this.gateway.notifyTableStatusChanged(companyId, { id: tableId, status: 'OCCUPIED' });

      return order;
    });
  }

  /**
   * Atualização de status da Cozinha KDS:
   * PENDING -> PREPARING -> READY -> DELIVERED -> COMPLETED
   */
  async updateOrderStatus(companyId: string, orderId: string, newStatus: string) {
    const validStatuses = ['PENDING', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestException(`Status inválido: ${newStatus}`);
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: {
        table: { select: { id: true, number: true, label: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            modifiers: true,
          },
        },
      },
    });

    this.gateway.notifyOrderStatusChanged(companyId, updated);
    return updated;
  }

  /**
   * Listar pedidos ativos para Cozinha (KDS) ou Garçom
   */
  async listOrders(companyId: string, query?: { status?: string; tableId?: string }) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.tableId) where.tableId = query.tableId;

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { id: true, number: true, label: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            modifiers: true,
          },
        },
      },
    });
  }

  /**
   * Chamada de Garçom pela Mesa (ASSISTANCE ou BILL)
   */
  async callWaiter(context: { companyId: string; tableId: string }, type: 'ASSISTANCE' | 'BILL' = 'ASSISTANCE') {
    const { companyId, tableId } = context;

    const call = await this.prisma.waiterCall.create({
      data: {
        companyId,
        tableId,
        type,
        status: 'PENDING',
      },
      include: {
        table: { select: { id: true, number: true, label: true } },
      },
    });

    this.gateway.notifyWaiterCalled(companyId, call);
    return call;
  }

  /**
   * Garçom marca chamado como atendido
   */
  async answerWaiterCall(companyId: string, callId: string) {
    const call = await this.prisma.waiterCall.findFirst({
      where: { id: callId, companyId },
    });
    if (!call) throw new NotFoundException('Chamado não encontrado');

    return this.prisma.waiterCall.update({
      where: { id: callId },
      data: {
        status: 'ANSWERED',
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Fechar comanda (TableSession) e liberar mesa para novos clientes
   */
  async closeTableSession(companyId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { companyId, tableId, status: 'OPEN' },
      });

      if (session) {
        await tx.tableSession.update({
          where: { id: session.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });

        // Marca pedidos em aberto como COMPLETED
        await tx.order.updateMany({
          where: { tableSessionId: session.id, status: { in: ['PENDING', 'PREPARING', 'READY', 'DELIVERED'] } },
          data: { status: 'COMPLETED' },
        });
      }

      // Finaliza chamados de garçom pendentes
      await tx.waiterCall.updateMany({
        where: { tableId, status: 'PENDING' },
        data: { status: 'ANSWERED', resolvedAt: new Date() },
      });

      // Libera a mesa
      const updatedTable = await tx.table.update({
        where: { id: tableId },
        data: { status: 'FREE' },
      });

      this.gateway.notifyTableStatusChanged(companyId, { id: tableId, status: 'FREE' });

      return {
        table: updatedTable,
        closedSessionId: session?.id || null,
        message: 'Comanda encerrada e mesa liberada com sucesso!',
      };
    });
  }

  /**
   * Abre uma comanda / sessão para a mesa diretamente pelo operador / garçom
   */
  async openTableSession(companyId: string, tableId: string, data?: { customerCount?: number; notes?: string }) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    return this.prisma.$transaction(async (tx) => {
      let session = await tx.tableSession.findFirst({
        where: { companyId, tableId, status: 'OPEN' },
      });

      if (!session) {
        session = await tx.tableSession.create({
          data: {
            companyId,
            tableId,
            status: 'OPEN',
          },
        });
      }

      const updatedTable = await tx.table.update({
        where: { id: tableId },
        data: { status: 'OCCUPIED' },
      });

      this.gateway.notifyTableStatusChanged(companyId, { id: tableId, status: 'OCCUPIED' });

      return {
        table: updatedTable,
        session,
      };
    });
  }

  /**
   * Obtém os detalhes da sessão ativa e comanda da mesa
   */
  async getTableSession(companyId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    const session = await this.prisma.tableSession.findFirst({
      where: { companyId, tableId, status: 'OPEN' },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, salePriceCents: true, imageUrl: true } },
                modifiers: true,
              },
            },
          },
        },
      },
    });

    const activeOrders = session?.orders || [];
    const totalCents = activeOrders.reduce((sum, ord) => sum + ord.totalCents, 0);

    // Agrupar itens para visualização fácil de comanda (ex: X-Burger 2x R$ 49,80)
    const aggregatedItems: {
      productId: string;
      productName: string;
      quantity: number;
      unitPriceCents: number;
      totalPriceCents: number;
      modifiers: string[];
      notes?: string;
    }[] = [];

    for (const order of activeOrders) {
      for (const item of order.items) {
        const pId = item.productId;
        const pName = item.product?.name || 'Item';
        const modNames = (item.modifiers || []).map((m: any) => m.name);
        const existing = aggregatedItems.find(
          (ai) => ai.productId === pId && JSON.stringify(ai.modifiers) === JSON.stringify(modNames),
        );
        if (existing) {
          existing.quantity += item.quantity;
          existing.totalPriceCents += item.totalPrice;
        } else {
          aggregatedItems.push({
            productId: pId,
            productName: pName,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents || item.unitPrice,
            totalPriceCents: item.totalPrice,
            modifiers: modNames,
            notes: item.notes || undefined,
          });
        }
      }
    }

    return {
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
        capacity: table.capacity,
        status: table.status,
      },
      session: session
        ? {
            id: session.id,
            openedAt: session.openedAt,
            totalCents,
            ordersCount: activeOrders.length,
            aggregatedItems,
            rawOrders: activeOrders,
          }
        : null,
    };
  }

  /**
   * Transfere uma comanda ativa de uma mesa para outra
   */
  async transferTable(companyId: string, fromTableId: string, toTableId: string) {
    if (fromTableId === toTableId) {
      throw new BadRequestException('A mesa de origem e destino devem ser diferentes');
    }

    const [fromTable, toTable] = await Promise.all([
      this.prisma.table.findFirst({ where: { id: fromTableId, companyId } }),
      this.prisma.table.findFirst({ where: { id: toTableId, companyId } }),
    ]);

    if (!fromTable) throw new NotFoundException('Mesa de origem não encontrada');
    if (!toTable) throw new NotFoundException('Mesa de destino não encontrada');

    if (toTable.status === 'OCCUPIED') {
      throw new BadRequestException(`A mesa ${toTable.number} já está ocupada. Escolha uma mesa livre.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const activeSession = await tx.tableSession.findFirst({
        where: { companyId, tableId: fromTableId, status: 'OPEN' },
      });

      if (!activeSession) {
        throw new BadRequestException('Não há comanda aberta na mesa de origem para transferir');
      }

      // Atualiza a sessão e pedidos para a nova mesa
      await tx.tableSession.update({
        where: { id: activeSession.id },
        data: { tableId: toTableId },
      });

      await tx.order.updateMany({
        where: { tableSessionId: activeSession.id },
        data: { tableId: toTableId },
      });

      // Transfere chamados de garçom pendentes
      await tx.waiterCall.updateMany({
        where: { tableId: fromTableId, status: 'PENDING' },
        data: { tableId: toTableId },
      });

      // Atualiza status das mesas
      const updatedFrom = await tx.table.update({
        where: { id: fromTableId },
        data: { status: 'FREE' },
      });

      const updatedTo = await tx.table.update({
        where: { id: toTableId },
        data: { status: 'OCCUPIED' },
      });

      this.gateway.notifyTableStatusChanged(companyId, { id: fromTableId, status: 'FREE' });
      this.gateway.notifyTableStatusChanged(companyId, { id: toTableId, status: 'OCCUPIED' });

      return {
        success: true,
        message: `Comanda transferida da Mesa ${fromTable.number} para a Mesa ${toTable.number} com sucesso!`,
        fromTable: updatedFrom,
        toTable: updatedTo,
      };
    });
  }

  /**
   * Atualiza dados de uma mesa (label, número, capacidade)
   */
  async updateTable(companyId: string, tableId: string, data: { number?: number; label?: string; capacity?: number }) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    if (data.number && data.number !== table.number) {
      const existing = await this.prisma.table.findUnique({
        where: { companyId_number: { companyId, number: data.number } },
      });
      if (existing) {
        throw new BadRequestException(`Já existe uma mesa com o número ${data.number}`);
      }
    }

    return this.prisma.table.update({
      where: { id: tableId },
      data: {
        number: data.number !== undefined ? data.number : undefined,
        label: data.label !== undefined ? data.label : undefined,
        capacity: data.capacity !== undefined ? data.capacity : undefined,
      },
    });
  }

  /**
   * Exclui uma mesa (desde que não esteja ocupada)
   */
  async deleteTable(companyId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    if (table.status === 'OCCUPIED') {
      throw new BadRequestException('Não é possível excluir uma mesa ocupada. Feche a comanda antes.');
    }

    await this.prisma.table.delete({
      where: { id: tableId },
    });

    return { success: true, message: `Mesa ${table.number} excluída com sucesso.` };
  }

  /**
   * Cadastra um novo produto / comida no cardápio do restaurante com opções (ponto, molhos, adicionais)
   */
  async createProduct(companyId: string, data: any) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
    });
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
    });
    const effectiveCompanyId = company?.id || companyId;
    const effectiveTenantId = tenant?.id || company?.id || companyId;

    const modifierGroupsCreate = (data.modifierGroups && Array.isArray(data.modifierGroups))
      ? data.modifierGroups
          .filter((g: any) => g && g.name && String(g.name).trim().length > 0)
          .map((group: any) => ({
            name: String(group.name).trim(),
            minSelectable: Number(group.minSelectable ?? (group.isRequired ? 1 : 0)),
            maxSelectable: Number(group.maxSelectable ?? 1),
            isRequired: Boolean(group.isRequired),
            items: {
              create: (group.items || [])
                .filter((i: any) => i && i.name && String(i.name).trim().length > 0)
                .map((item: any) => ({
                  name: String(item.name).trim(),
                  priceCents: Math.round(Number(item.priceCents || 0)),
                })),
            },
          }))
      : undefined;

    return this.prisma.product.create({
      data: {
        tenantId: effectiveTenantId,
        companyId: effectiveCompanyId,
        categoryId: data.categoryId || null,
        name: String(data.name || '').trim(),
        description: data.description ? String(data.description).trim() : null,
        salePriceCents: Math.round(Number(data.salePriceCents || 0)),
        costPriceCents: Math.round(Number(data.costPriceCents || 0)),
        stockQuantity: Number(data.stockQuantity ?? 100),
        minStockAlert: Number(data.minStockAlert ?? 5),
        unit: data.unit || 'UN',
        isActive: true,
        modifierGroups: modifierGroupsCreate && modifierGroupsCreate.length > 0 ? { create: modifierGroupsCreate } : undefined,
      },
      include: {
        category: true,
        modifierGroups: {
          include: { items: true },
        },
      },
    });
  }

  /**
   * Cria categoria de cardápio para o restaurante
   */
  async createCategory(companyId: string, data: { name: string; color?: string }) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
    });
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
    });
    const effectiveCompanyId = company?.id || companyId;
    const effectiveTenantId = tenant?.id || company?.id || companyId;

    return this.prisma.productCategory.create({
      data: {
        tenantId: effectiveTenantId,
        companyId: effectiveCompanyId,
        name: data.name.trim(),
        color: data.color || '#f59e0b',
        active: true,
      },
    });
  }
}

