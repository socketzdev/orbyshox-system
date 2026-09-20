import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { RestaurantGateway } from './restaurant.gateway';
import { normalizePaymentMethod, normalizePaymentMethodOrOther } from '../tenant-app/payment-method';
import { buildPixBrCode, validatePixKey } from '../tenant-app/pix-brcode';
import { AuditService } from '../audit/audit.service';
import {
  DEFAULT_TIP_PERCENT_BPS,
  TIP_ELIGIBLE_ROLE_CODES,
  deriveTipStatus,
  suggestedTipCents,
  splitPayout,
  parseEligibleRoles,
} from './tip.utils';

/**
 * Teto de quantidade por item num pedido.
 *
 * As rotas de pedido do salão são públicas (QR do cliente) e não havia limite:
 * um único POST com quantidade absurda decrementava o estoque dos insumos para
 * um valor negativo enorme. 9999 é generoso para mesa de restaurante e ainda
 * assim impede o abuso.
 */
const MAX_ITEM_QUANTITY = 9999;

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
  /** Nome do garçom que lançou (vem do usuário logado no front). */
  waiterName?: string;
  /** Id do usuário que lançou — é o vínculo confiável p/ o alerta (nome repete). */
  waiterId?: string;
  items: CreateOrderItemInput[];
}

@Injectable()
export class RestaurantService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly gateway: RestaurantGateway,
    private readonly audit: AuditService,
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
      // Pedidos prontos aguardando o garçom buscar: alimentam o filtro
      // "Chamando Garçom" do mapa e o alerta no celular do responsável.
      // Dono do pedido ou herdado da comanda (QR não tem login).
      const readyOrders = activeOrders
        .filter((ord: any) => ord.status === 'READY')
        .map((ord: any) => ({
          orderNumber: ord.orderNumber,
          waiterName: ord.waiterName || activeSession?.waiterName || null,
          waiterId: (ord as any).waiterId || (activeSession as any)?.waiterId || null,
        }));

      return {
        id: table.id,
        number: table.number,
        label: table.label,
        capacity: table.capacity,
        status: table.status, // FREE | OCCUPIED
        hasPendingCall: pendingCalls.length > 0,
        pendingCalls,
        activeOrdersCount: activeOrders.length,
        readyOrdersCount: readyOrders.length,
        readyOrders,
        sessionTotalCents,
        activeSessionId: activeSession?.id || null,
        // Nome da comanda para o mapa exibir no lugar de "Ocupada".
        // Sessões abertas antes da migração ficam sem nome e a tela cai no
        // rótulo padrão — sem quebrar.
        comandaName: activeSession?.comandaName || null,
        // Garçom responsável: o mapa e o KDS mostram quem deve buscar.
        waiterName: activeSession?.waiterName || null,
        waiterId: (activeSession as any)?.waiterId || null,
        customerCount: activeSession?.customerCount ?? null,
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

        // Teto de quantidade: esta rota é pública (QR do cliente) e não havia
        // limite — um único POST com quantidade absurda derrubava o estoque dos
        // insumos para negativo. O mínimo de 1 já existia.
        const rawQty = Number(itemInput.quantity);
        if (!Number.isFinite(rawQty)) {
          throw new BadRequestException(`Quantidade inválida para o produto ${itemInput.productId}`);
        }
        const qty = Math.floor(rawQty);
        if (qty < 1 || qty > MAX_ITEM_QUANTITY) {
          throw new BadRequestException(
            `Quantidade deve estar entre 1 e ${MAX_ITEM_QUANTITY} (produto ${itemInput.productId})`,
          );
        }
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
      // `waiterName` é desnormalizado de propósito: QR/tablet lançam sem login
      // e o KDS precisa mostrar "buscar: X" sem join com User. `waiterId` é o
      // vínculo que decide para quem apitar (nome sozinho repete/falha).
      const waiterName =
        typeof input.waiterName === 'string' && input.waiterName.trim()
          ? input.waiterName.trim().slice(0, 80)
          : null;
      const waiterId =
        typeof input.waiterId === 'string' && input.waiterId.trim()
          ? input.waiterId.trim().slice(0, 80)
          : null;
      const order = await tx.order.create({
        data: {
          companyId,
          tenantId: companyId,
          tableId,
          tableSessionId: session.id,
          orderNumber,
          origin: input.origin || 'TABLET',
          status: 'PENDING',
          totalCents: totalOrderCents,
          subtotalCents: totalOrderCents,
          notes: input.notes || null,
          waiterName,
          waiterId,
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
          tableSession: { select: { id: true, comandaName: true, waiterName: true, waiterId: true } },
          items: {
            include: {
              product: { select: { id: true, name: true } },
              modifiers: true,
            },
          },
        },
      });

      // A mesa herda o garçom do primeiro lançamento com nome: assim o KDS
      // sabe quem deve buscar mesmo quando a comanda foi aberta pelo QR.
      // Preenche cada campo que estiver vazio (nome e id independentes).
      const sessionPatch: any = {};
      if (waiterName && !session.waiterName) sessionPatch.waiterName = waiterName;
      if (waiterId && !(session as any).waiterId) sessionPatch.waiterId = waiterId;
      if (Object.keys(sessionPatch).length > 0) {
        await tx.tableSession.update({
          where: { id: session.id },
          data: sessionPatch,
        });
      }

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
  /**
   * Métricas do dia para o topo do KDS.
   *
   * Consulta só as colunas necessárias e limita o volume: o painel da cozinha
   * atualiza isso a cada poucos segundos, então não pode arrastar pedido
   * inteiro com itens.
   *
   * Ressalva honesta: o tempo de preparo usa `updatedAt - createdAt` do pedido
   * que chegou a DELIVERED/COMPLETED. Serve como termômetro do dia, mas não é
   * o tempo real de preparo por prato — isso exigiria registrar a transição de
   * status em linha (histórico), que não existe hoje.
   */
  async getKitchenStats(companyId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [finished, active] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          OR: [{ companyId }, { tenantId: companyId }],
          status: { in: ['DELIVERED', 'COMPLETED'] },
          createdAt: { gte: startOfDay },
        },
        select: { createdAt: true, updatedAt: true },
        take: 500,
      }),
      this.prisma.order.findMany({
        where: {
          OR: [{ companyId }, { tenantId: companyId }],
          status: { in: ['PENDING', 'PREPARING', 'READY'] },
        },
        select: { createdAt: true, status: true },
        take: 100,
      }),
    ]);

    const durations = finished
      .map((o) => o.updatedAt.getTime() - o.createdAt.getTime())
      .filter((ms) => ms >= 0);

    const averagePrepMinutes = durations.length
      ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length / 60000
      : 0;

    const now = Date.now();
    const longestWaitingMinutes = active.length
      ? Math.max(...active.map((o) => (now - o.createdAt.getTime()) / 60000))
      : 0;

    return {
      completedToday: finished.length,
      averagePrepMinutes: Math.round(averagePrepMinutes * 10) / 10,
      longestWaitingMinutes: Math.round(longestWaitingMinutes),
      activeCount: active.length,
    };
  }

  async updateOrderStatus(companyId: string, orderId: string, newStatus: string) {
    const validStatuses = ['PENDING', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestException(`Status inválido: ${newStatus}`);
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [{ companyId }, { tenantId: companyId }],
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: {
        table: { select: { id: true, number: true, label: true } },
        tableSession: { select: { id: true, comandaName: true, waiterName: true, waiterId: true } },
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

  async updateOrderNotes(companyId: string, orderId: string, notes: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [{ companyId }, { tenantId: companyId }],
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { notes },
      include: {
        table: { select: { id: true, number: true, label: true } },
        tableSession: { select: { id: true, comandaName: true, waiterName: true, waiterId: true } },
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
   * Localiza um pedido garantindo que pertence à empresa.
   * `findFirst` com o escopo — nunca `findUnique({ id })` — para que um
   * `orderId` de outra empresa não abra o pedido.
   */
  private async findOwnedOrder(companyId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, OR: [{ companyId }, { tenantId: companyId }] },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  /** Recalcula os totais do pedido a partir dos itens restantes. */
  private async recalcOrderTotals(tx: any, orderId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { totalPrice: true, quantity: true, unitPriceCents: true },
    });

    const total = items.reduce((acc: number, i: any) => acc + (Number(i.totalPrice) || 0), 0);
    const subtotal = items.reduce(
      (acc: number, i: any) => acc + Math.round((Number(i.unitPriceCents) || 0) * (Number(i.quantity) || 0)),
      0,
    );

    await tx.order.update({
      where: { id: orderId },
      data: { totalCents: total, subtotalCents: subtotal },
    });

    return { total, count: items.length };
  }

  /**
   * Altera a quantidade de um item já lançado.
   *
   * Necessário porque o garçom errar quantidade era irreversível: não havia
   * como corrigir, só cancelar a comanda inteira ou lançar um item negativo.
   */
  async updateOrderItem(
    companyId: string,
    orderId: string,
    itemId: string,
    quantity: number,
  ) {
    const order = await this.findOwnedOrder(companyId, orderId);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Este pedido está cancelado e não pode ser alterado.');
    }

    const rawQty = Number(quantity);
    if (!Number.isFinite(rawQty)) {
      throw new BadRequestException('Quantidade inválida');
    }
    const qty = Math.floor(rawQty);
    if (qty < 1 || qty > MAX_ITEM_QUANTITY) {
      throw new BadRequestException(`Quantidade deve estar entre 1 e ${MAX_ITEM_QUANTITY}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId },
        include: { modifiers: true },
      });
      if (!item) throw new NotFoundException('Item não encontrado neste pedido');

      const modifiersTotal = (item.modifiers || []).reduce(
        (acc: number, m: any) => acc + (Number(m.priceCents) || 0),
        0,
      );
      const unitCents = (Number(item.unitPriceCents) || 0) + modifiersTotal;
      const lineTotal = unitCents * qty;

      await tx.orderItem.update({
        where: { id: itemId },
        data: { quantity: qty, totalPrice: lineTotal },
      });

      await this.recalcOrderTotals(tx, orderId);

      const updated = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          table: { select: { id: true, number: true, label: true } },
          tableSession: { select: { id: true, comandaName: true, waiterName: true, waiterId: true } },
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
    });
  }

  /**
   * Remove um item já lançado.
   *
   * Se for o último item, o pedido é cancelado em vez de ficar vazio — um
   * pedido com zero itens polui o KDS e os relatórios.
   */
  async removeOrderItem(companyId: string, orderId: string, itemId: string) {
    const order = await this.findOwnedOrder(companyId, orderId);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Este pedido está cancelado e não pode ser alterado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId },
      });
      if (!item) throw new NotFoundException('Item não encontrado neste pedido');

      await tx.orderItem.delete({ where: { id: itemId } });

      const { count } = await this.recalcOrderTotals(tx, orderId);

      if (count === 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', notes: 'Pedido cancelado: último item removido.' },
        });
      }

      const updated = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          table: { select: { id: true, number: true, label: true } },
          tableSession: { select: { id: true, comandaName: true, waiterName: true, waiterId: true } },
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
    });
  }

  /**
   * Listar pedidos ativos para Cozinha (KDS) ou Garçom
   */
  async listOrders(
    companyId: string,
    query?: { status?: string; tableId?: string; active?: boolean },
  ) {
    const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'READY'];

    const where: any = {
      OR: [{ companyId }, { tenantId: companyId }],
    };
    if (query?.status) where.status = query.status;
    else if (query?.active) where.status = { in: ACTIVE_STATUSES };
    if (query?.tableId) where.tableId = query.tableId;

    return this.prisma.order.findMany({
      where,
      take: query?.active ? 100 : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { id: true, number: true, label: true } },
        // O KDS precisa do garçom e da comanda sem buscar de novo: o pedido
        // leva `waiterName` próprio e herda o da sessão quando vazio.
        tableSession: { select: { id: true, comandaName: true, waiterName: true, waiterId: true } },
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
   * Gera a cobrança PIX automática da mesa (BR Code QRCPS-MPM).
   * Devolve payload para QR Code e código Copia e Cola.
   */
  async getTablePixCharge(companyId: string, tableId: string, customAmountCents?: number) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
      include: {
        company: true,
        tableSessions: {
          where: { status: 'OPEN' },
          include: {
            orders: {
              where: { status: { notIn: ['CANCELLED'] } },
            },
          },
          take: 1,
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    const session = table.tableSessions[0] || null;
    const sessionTotal = (session?.orders || []).reduce(
      (sum: number, ord: any) => sum + Number(ord.totalCents || 0),
      0,
    );
    const amountCents = customAmountCents && customAmountCents > 0 ? customAmountCents : sessionTotal;

    if (amountCents <= 0) {
      return {
        available: false,
        reason: 'O valor da conta deve ser maior que zero para gerar cobrança PIX.',
        amountCents: 0,
      };
    }

    // Busca configurações da loja (PIX) vinculadas à empresa ou tenant
    let settings = await this.prisma.storeSetting.findFirst({
      where: {
        OR: [
          { tenantId: companyId },
          { tenant: { slug: table.company?.slug } },
          { tenant: { id: companyId } },
        ],
      },
    });

    if (!settings || !settings.pixKey) {
      // Fallback para qualquer storeSetting com pixKey preenchida
      const fallbackSetting = await this.prisma.storeSetting.findFirst({
        where: { pixKey: { not: null } },
      });
      if (fallbackSetting) {
        settings = fallbackSetting;
      }
    }

    const pixKey = settings?.pixKey ?? null;
    const validation = validatePixKey(pixKey);
    if (!validation.valid) {
      return {
        available: false,
        reason: validation.reason ?? 'Chave PIX não cadastrada nas configurações da loja.',
        amountCents,
      };
    }

    const receiverName = settings?.pixReceiverName || settings?.storeName || table.company?.name || 'RESTAURANTE';
    const brCode = buildPixBrCode({
      pixKey: pixKey as string,
      merchantName: receiverName,
      merchantCity: settings?.pixReceiverCity || 'BRASIL',
      amountCents,
      description: `Mesa ${table.number}`,
    });

    if (!brCode) {
      return {
        available: false,
        reason: 'Não foi possível gerar o QR Code. Verifique a chave PIX nas configurações.',
        amountCents,
      };
    }

    return {
      available: true,
      amountCents,
      payload: brCode.payload,
      keyType: brCode.keyType,
      receiverName,
      pixKey,
    };
  }

  /**
   * Fechar comanda (TableSession) e liberar mesa para novos clientes.
   *
   * O `payment` chega do modal de forma de pagamento (o garçom escolhe como o
   * cliente vai pagar antes de a conta ser impressa). Quando vem, ele é a fonte
   * da verdade da forma de pagamento do fechamento — antes o recibo lia
   * `order.paymentMethod`, que o fluxo de garçom nunca preenche, e por isso a
   * linha "Pagamento" sumia do cupom.
   *
   * O `tip` (10%) segue junto: o consumo vai para o caixa da empresa (via
   * `paymentMethod` nos pedidos, como sempre) e o valor dos 10% vai para o
   * caixinha separado (`ServiceFeePayment`), vinculado a esta comanda — sem
   * nota, sem registro.
   */
  async closeTableSession(
    companyId: string,
    tableId: string,
    payment?: {
      method?: string;
      amountReceivedCents?: number;
      changeCents?: number;
      notes?: string;
      tip?: {
        paidCents?: number;
        method?: string;
      };
    },
    operator?: { id?: string; name?: string },
  ) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { companyId, tableId, status: 'OPEN' },
      });

      let receipt: any = null;

      if (session) {
        // A conta é lida ANTES de marcar os pedidos como COMPLETED, enquanto
        // ainda estão vinculados à sessão. Depois do updateMany eles seguem
        // existindo, mas o vínculo e o status em aberto já mudaram — ler antes
        // evita reconstruir a conta por fora da transação.
        // CANCELLED fica fora da conta: o cliente não consome e não paga.
        // (Antes não havia filtro e pedido cancelado era cobrado no fechamento.)
        const sessionOrders = await tx.order.findMany({
          where: { tableSessionId: session.id, status: { not: 'CANCELLED' } },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
                modifiers: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });

        const items = sessionOrders.flatMap((order: any) =>
          (order.items || []).map((it: any) => {
            // `||` e não `??`: itens antigos têm `unitPriceCents` = 0 (não
            // null), e 0 passaria direto, exibindo "R$ 0,00" no recibo.
            const unitPriceCents = Number(it.unitPriceCents || it.unitPrice || 0);
            const quantity = Number(it.quantity ?? 0);
            return {
              name: it.product?.name ?? 'Item',
              quantity,
              unitPriceCents,
              subtotalCents:
                Number(it.totalPrice ?? 0) || Math.round(unitPriceCents * quantity),
              notes: it.notes ?? null,
              modifiers: (it.modifiers || []).map((m: any) => m.name),
            };
          }),
        );

        const totalCents = sessionOrders.reduce((s: number, o: any) => s + Number(o.totalCents ?? 0), 0);

        // A forma de pagamento do fechamento tem prioridade sobre a dos pedidos
        // (que fica nula no fluxo de garçom). Sem `payment`, cai no comportamento
        // antigo para não quebrar chamadas já existentes.
        const paymentMethod = payment?.method
          ? normalizePaymentMethod(payment.method)
          : null;
        const methodsFromOrders = sessionOrders
          .map((o: any) => o.paymentMethod)
          .filter(Boolean);

        const paymentMethods = paymentMethod
          ? [paymentMethod]
          : [...new Set(methodsFromOrders)];

        // Troco só faz sentido em dinheiro — e é o dado que o operador confere
        // no cupom, então é calculado aqui para o recibo não depender de a tela
        // ter mandado o número certo.
        const amountReceivedCents =
          paymentMethod === 'DINHEIRO' && Number(payment?.amountReceivedCents) > 0
            ? Number(payment!.amountReceivedCents)
            : null;
        const changeCents =
          amountReceivedCents !== null ? Math.max(0, amountReceivedCents - totalCents) : null;

        receipt = {
          tableLabel: table.label,
          orderNumbers: sessionOrders.map((o: any) => o.orderNumber),
          openedAt: session.openedAt,
          closedAt: new Date(),
          items,
          subtotalCents: sessionOrders.reduce((s: number, o: any) => s + Number(o.subtotalCents ?? 0), 0),
          discountCents: sessionOrders.reduce((s: number, o: any) => s + Number(o.discountCents ?? 0), 0),
          totalCents,
          paymentMethods,
          paymentMethod: paymentMethods[0] ?? null,
          amountReceivedCents,
          changeCents,
          paymentNotes: paymentMethod && payment?.notes ? String(payment.notes).slice(0, 200) : null,
        };

        // ─── 10% da comanda → caixinha separado ──────────────────────────
        // O consumo (totalCents) segue para o caixa da empresa via
        // `paymentMethod`; só o valor dos 10% entra no `ServiceFeePayment`.
        // Status DERIVADO dos valores (não do que a tela "marcou").
        const tipConfig = await this.getTipConfig(companyId, tx as any);
        const tipSuggested = suggestedTipCents(totalCents, tipConfig.percentBps);
        const tipPaidRaw = Math.max(0, Math.round(Number(payment?.tip?.paidCents) || 0));
        const tipStatus = deriveTipStatus(tipPaidRaw, tipSuggested);
        const tipMethod =
          tipPaidRaw > 0
            ? normalizePaymentMethodOrOther(payment?.tip?.method || paymentMethod || '')
            : null;
        if (tipPaidRaw > 0 && (!tipMethod || tipMethod === 'OUTROS')) {
          throw new BadRequestException('Informe a forma de pagamento dos 10%.');
        }
        const waiterName = (session as any).waiterName || null;
        const waiterId = (session as any).waiterId || null;
        const tipRecord = await tx.serviceFeePayment.create({
          data: {
            companyId,
            tableSessionId: session.id,
            tableId,
            clientName: (session as any).comandaName || table.label,
            orderNumbers: JSON.stringify(sessionOrders.map((o: any) => o.orderNumber)),
            billTotalCents: totalCents,
            suggestedCents: tipSuggested,
            paidCents: tipPaidRaw,
            status: tipStatus,
            paymentMethod: tipMethod === 'OUTROS' ? null : tipMethod,
            responsibleName: waiterName || operator?.name || null,
            responsibleId: waiterId || operator?.id || null,
            snapshotJson: JSON.stringify({
              tableLabel: table.label,
              orderNumbers: sessionOrders.map((o: any) => o.orderNumber),
              openedAt: session.openedAt,
              closedAt: new Date(),
              items,
              subtotalCents: receipt.subtotalCents,
              discountCents: receipt.discountCents,
              totalCents,
              paymentMethods,
              clientName: (session as any).comandaName || table.label,
            }),
          },
        });
        receipt.tip = {
          suggestedCents: tipSuggested,
          paidCents: tipPaidRaw,
          status: tipStatus,
          paymentMethod: tipRecord.paymentMethod,
        };

        await tx.tableSession.update({
          where: { id: session.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });

        // Grava a forma de pagamento nos pedidos da comanda. Isso mantém os
        // relatórios por forma de pagamento corretos — antes o fechamento por
        // mesa não aparecia em nenhum relatório porque nenhum pedido tinha
        // `paymentMethod`.
        if (paymentMethod) {
          await tx.order.updateMany({
            where: { tableSessionId: session.id },
            data: { paymentMethod },
          });
        }

        // Marca pedidos em aberto como COMPLETED
        await tx.order.updateMany({
          where: { tableSessionId: session.id, status: { in: ['PENDING', 'PREPARING', 'READY', 'DELIVERED'] } },
          data: { status: 'COMPLETED' },
        });
      } else {
        // Fechar comanda de mesa livre não é operação válida. Antes devolvia
        // 200 com `receipt: null` e a tela abria um recibo vazio.
        throw new ConflictException('Esta mesa não possui comanda aberta.');
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
        // Antes o fechamento devolvia só "comanda encerrada" e a tela não tinha
        // o que mostrar: nem itens nem valor a pagar. Agora a conta vem pronta
        // para o recibo.
        receipt,
        message: 'Comanda encerrada e mesa liberada com sucesso!',
      };
    });
  }

  // ─── Caixinha dos 10% (taxa de serviço) ─────────────────────────────────
  // Regra principal: Nota → 10% pago → Caixa 10% → divisão → participantes.
  // O 10% nasce SÓ dentro do `closeTableSession` (1:1 com a comanda): não
  // existe endpoint de criação avulsa, então ninguém inventa pagamento.

  /** Config da taxa (cria com o padrão 10% + cargos base na primeira leitura). */
  async getTipConfig(companyId: string, db: any = this.prisma) {
    const found = await Promise.resolve(
      db.tipConfig.findFirst({ where: { companyId } }),
    ).catch(() => null);
    if (found) {
      return {
        ...found,
        eligibleRoles: parseEligibleRoles((found as any).eligibleRoles),
      };
    }
    const created = await Promise.resolve(
      db.tipConfig.create({ data: { companyId, percentBps: DEFAULT_TIP_PERCENT_BPS } }),
    ).catch(() => null);
    if (!created) {
      return { percentBps: DEFAULT_TIP_PERCENT_BPS, eligibleRoles: parseEligibleRoles(null), active: true };
    }
    return { ...created, eligibleRoles: parseEligibleRoles((created as any).eligibleRoles) };
  }

  async updateTipConfig(
    companyId: string,
    data: { percentBps?: number; eligibleRoles?: string[]; active?: boolean },
  ) {
    const patch: any = {};
    if (data.percentBps !== undefined) {
      const bps = Math.round(Number(data.percentBps) || 0);
      if (!Number.isFinite(bps) || bps < 0 || bps > 5000) {
        throw new BadRequestException('Taxa inválida (0 a 5000 bps = 0% a 50%)');
      }
      patch.percentBps = bps;
    }
    if (data.eligibleRoles !== undefined) {
      const roles = parseEligibleRoles(data.eligibleRoles, []);
      if (roles.length === 0) throw new BadRequestException('Selecione ao menos um cargo participante');
      patch.eligibleRoles = JSON.stringify(roles);
    }
    if (data.active !== undefined) patch.active = Boolean(data.active);
    if (Object.keys(patch).length === 0) return this.getTipConfig(companyId);
    const updated = await this.prisma.tipConfig.upsert({
      where: { companyId },
      create: { companyId, ...patch },
      update: patch,
    });
    return { ...updated, eligibleRoles: parseEligibleRoles((updated as any).eligibleRoles) };
  }

  /** Funcionários ativos que participam da divisão (cargo elegível ou tag). */
  async getTipParticipants(companyId: string) {
    const config = await this.getTipConfig(companyId);
    if (!config.active || config.eligibleRoles.length === 0) return [];
    const or: any[] = [{ role: { in: config.eligibleRoles } }];
    for (const role of config.eligibleRoles) {
      or.push({ tags: { contains: `"${role}"` } });
    }
    const users = await this.prisma.user.findMany({
      where: { companyId, isActive: true, OR: or },
      select: { id: true, name: true, role: true, position: true },
      orderBy: { name: 'asc' },
    });
    const seen = new Set<string>();
    return users.filter((u: any) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }

  /** Total ainda não distribuído = pagos desde o fim da última divisão. */
  async getUndistributedTotal(companyId: string) {
    const last = await this.prisma.serviceFeePayout.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    const since: Date | undefined = last?.periodEnd;
    const agg = await this.prisma.serviceFeePayment.aggregate({
      where: {
        companyId,
        paidCents: { gt: 0 },
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      _sum: { paidCents: true },
      _count: { id: true },
    });
    const oldest = await this.prisma.serviceFeePayment.findFirst({
      where: { companyId, paidCents: { gt: 0 }, ...(since ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return {
      totalCents: Number(agg._sum.paidCents ?? 0),
      count: Number(agg._count.id ?? 0),
      periodStart: oldest?.createdAt ?? null,
      lastPayoutEnd: since ?? null,
    };
  }

  /** Resumo do caixa 10%: saldo (pagos − distribuídos), semana e config. */
  async getTipsSummary(companyId: string) {
    const [config, undistributed, paidAgg, payoutAgg] = await Promise.all([
      this.getTipConfig(companyId),
      this.getUndistributedTotal(companyId),
      this.prisma.serviceFeePayment.aggregate({
        where: { companyId, paidCents: { gt: 0 } },
        _sum: { paidCents: true },
        _count: { id: true },
      }),
      this.prisma.serviceFeePayout.aggregate({
        where: { companyId },
        _sum: { totalCents: true },
      }),
    ]);
    const totalPaid = Number(paidAgg._sum.paidCents ?? 0);
    const totalPaidOut = Number(payoutAgg._sum.totalCents ?? 0);
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekAgg = await this.prisma.serviceFeePayment.aggregate({
      where: { companyId, paidCents: { gt: 0 }, createdAt: { gte: weekStart } },
      _sum: { paidCents: true },
      _count: { id: true },
    });
    return {
      balanceCents: totalPaid - totalPaidOut,
      undistributedCents: undistributed.totalCents,
      undistributedCount: undistributed.count,
      weekCents: Number(weekAgg._sum.paidCents ?? 0),
      weekCount: Number(weekAgg._count.id ?? 0),
      totalPaidCents: totalPaid,
      totalPaidOutCents: totalPaidOut,
      percentBps: (config as any).percentBps,
      active: (config as any).active,
    };
  }

  /** Histórico de pagamentos (filtros por status e busca livre). */
  async listTipPayments(companyId: string, query?: { status?: string; search?: string }) {
    const where: any = { companyId };
    if (query?.status && query.status !== 'ALL') where.status = query.status;
    if (query?.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { clientName: { contains: s } },
        { responsibleName: { contains: s } },
        { orderNumbers: { contains: s } },
      ];
    }
    return this.prisma.serviceFeePayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { table: { select: { id: true, number: true, label: true } } },
    });
  }

  /** Detalhe + itens da nota original (foto do fechamento). */
  async getTipPayment(companyId: string, id: string) {
    const fee: any = await this.prisma.serviceFeePayment.findFirst({
      where: { id, companyId },
      include: { table: { select: { id: true, number: true, label: true } } },
    });
    if (!fee) throw new NotFoundException('Pagamento de 10% não encontrado');
    let snapshot: any = {};
    try {
      snapshot = JSON.parse(fee.snapshotJson || '{}');
    } catch {
      snapshot = {};
    }
    return { ...fee, snapshot };
  }

  /**
   * Ajusta valor/forma de um 10% (só gerente/dono, via guard). Motivo
   * OBRIGATÓRIO: vai para o AuditLog (quem, quando, antes, depois) e para os
   * campos visíveis do registro.
   */
  async updateTipPayment(
    companyId: string,
    id: string,
    data: { paidCents?: number; paymentMethod?: string; reason: string },
    operator?: { id?: string; name?: string },
  ) {
    const reason = String(data.reason || '').trim();
    if (!reason) throw new BadRequestException('Informe o motivo do ajuste');
    const fee: any = await this.prisma.serviceFeePayment.findFirst({ where: { id, companyId } });
    if (!fee) throw new NotFoundException('Pagamento de 10% não encontrado');

    const paidCents =
      data.paidCents !== undefined ? Math.max(0, Math.round(Number(data.paidCents) || 0)) : fee.paidCents;
    let method = fee.paymentMethod;
    if (data.paymentMethod !== undefined) {
      const m = normalizePaymentMethodOrOther(data.paymentMethod);
      if (paidCents > 0 && m === 'OUTROS') throw new BadRequestException('Forma de pagamento inválida');
      method = paidCents > 0 ? m : null;
    }
    if (paidCents > 0 && !method) throw new BadRequestException('Informe a forma de pagamento dos 10%');
    const status = deriveTipStatus(paidCents, fee.suggestedCents);

    const before = { paidCents: fee.paidCents, paymentMethod: fee.paymentMethod, status: fee.status };
    const updated = await this.prisma.serviceFeePayment.update({
      where: { id },
      data: {
        paidCents,
        paymentMethod: method,
        status,
        editCount: (fee.editCount || 0) + 1,
        lastEditBy: operator?.name || null,
        lastEditAt: new Date(),
        lastEditReason: reason.slice(0, 300),
        lastEditBeforeCents: before.paidCents,
        lastEditAfterCents: paidCents,
      },
    });

    await this.audit.recordChangeSafe({
      userId: operator?.id,
      action: 'TIP_PAYMENT_UPDATED',
      targetType: 'ServiceFeePayment',
      targetId: id,
      before: { ...before, reason },
      after: { paidCents, paymentMethod: method, status },
    });

    return updated;
  }

  /** Exclui um 10% (só gerente/dono, com motivo + trilha — sem apagar rastro). */
  async deleteTipPayment(companyId: string, id: string, reason: string, operator?: { id?: string; name?: string }) {
    const why = String(reason || '').trim();
    if (!why) throw new BadRequestException('Informe o motivo da exclusão');
    const fee: any = await this.prisma.serviceFeePayment.findFirst({ where: { id, companyId } });
    if (!fee) throw new NotFoundException('Pagamento de 10% não encontrado');

    await this.prisma.serviceFeePayment.delete({ where: { id } });

    await this.audit.recordChangeSafe({
      userId: operator?.id,
      action: 'TIP_PAYMENT_DELETED',
      targetType: 'ServiceFeePayment',
      targetId: id,
      before: {
        clientName: fee.clientName,
        orderNumbers: fee.orderNumbers,
        billTotalCents: fee.billTotalCents,
        paidCents: fee.paidCents,
        paymentMethod: fee.paymentMethod,
        reason: why,
        deletedBy: operator?.name || null,
      },
      after: null,
    });

    return { success: true, id };
  }

  /** Prévia da divisão: total, participantes elegíveis ativos e valor de cada. */
  async getPayoutPreview(companyId: string) {
    const [undistributed, participants] = await Promise.all([
      this.getUndistributedTotal(companyId),
      this.getTipParticipants(companyId),
    ]);
    const { amountEachCents, remainderCents } = splitPayout(undistributed.totalCents, participants.length);
    return {
      totalCents: undistributed.totalCents,
      count: undistributed.count,
      periodStart: undistributed.periodStart,
      participants: participants.map((p: any) => ({
        userId: p.id,
        name: p.name,
        role: p.role,
        position: p.position,
        amountCents: amountEachCents,
      })),
      amountEachCents,
      remainderCents,
    };
  }

  /**
   * Confirma a divisão semanal: baixa o total do caixa e registra quem recebeu
   * quanto, quem confirmou e quando. Recalcula tudo dentro da transação para
   * duas confirmações simultâneas não distribuírem dobrado.
   */
  async createPayout(companyId: string, operator?: { id?: string; name?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.serviceFeePayout.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      });
      const since: Date | undefined = (last as any)?.periodEnd;
      const agg: any = await tx.serviceFeePayment.aggregate({
        where: { companyId, paidCents: { gt: 0 }, ...(since ? { createdAt: { gt: since } } : {}) },
        _sum: { paidCents: true },
        _count: { id: true },
      });
      const totalCents = Number(agg._sum.paidCents ?? 0);
      if (totalCents <= 0) throw new BadRequestException('Não há valor acumulado no Caixa 10%');

      const config = await this.getTipConfig(companyId, tx as any);
      const eligible = (config as any).eligibleRoles as string[];
      const or: any[] = [{ role: { in: eligible } }];
      for (const role of eligible) or.push({ tags: { contains: `"${role}"` } });
      const users: any[] = await tx.user.findMany({
        where: { companyId, isActive: true, OR: or },
        select: { id: true, name: true, role: true, position: true },
        orderBy: { name: 'asc' },
      });
      const seen = new Set<string>();
      const participants = users.filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
      if (participants.length === 0) {
        throw new BadRequestException('Nenhum funcionário participante ativo');
      }

      const { amountEachCents, remainderCents } = splitPayout(totalCents, participants.length);
      const oldest: any = await tx.serviceFeePayment.findFirst({
        where: { companyId, paidCents: { gt: 0 }, ...(since ? { createdAt: { gt: since } } : {}) },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      const payout = await tx.serviceFeePayout.create({
        data: {
          companyId,
          periodStart: oldest?.createdAt ?? new Date(),
          periodEnd: new Date(),
          totalCents,
          participantCount: participants.length,
          amountEachCents,
          remainderCents,
          participantsJson: JSON.stringify(
            participants.map((p) => ({ userId: p.id, name: p.name, role: p.role, position: p.position, amountCents: amountEachCents })),
          ),
          confirmedBy: operator?.id || null,
          confirmedByName: operator?.name || null,
        },
      });
      return payout;
    }).then(async (payout) => {
      await this.audit.recordChangeSafe({
        userId: operator?.id,
        action: 'TIP_PAYOUT_CONFIRMED',
        targetType: 'ServiceFeePayout',
        targetId: (payout as any).id,
        before: null,
        after: {
          totalCents: (payout as any).totalCents,
          participantCount: (payout as any).participantCount,
          amountEachCents: (payout as any).amountEachCents,
          confirmedBy: operator?.name || null,
        },
      });
      return payout;
    });
  }

  async listPayouts(companyId: string, limit = 30) {
    const rows: any[] = await this.prisma.serviceFeePayout.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Number(limit) || 30)),
    });
    return rows.map((r) => {
      let participants: any[] = [];
      try {
        participants = JSON.parse(r.participantsJson || '[]');
      } catch {
        participants = [];
      }
      return { ...r, participants };
    });
  }

  /**
   * Abre uma comanda / sessão para a mesa diretamente pelo operador / garçom
   */
  async openTableSession(
    companyId: string,
    tableId: string,
    data?: { customerCount?: number; notes?: string; comandaName?: string; waiterName?: string; waiterId?: string },
  ) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, companyId },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    return this.prisma.$transaction(async (tx) => {
      let session = await tx.tableSession.findFirst({
        where: { companyId, tableId, status: 'OPEN' },
      });

      if (!session) {
        // `data` era recebido e ignorado: o nome digitado no modal não ficava
        // gravado em lugar nenhum, e o mapa não tinha o que mostrar além de
        // um "Ocupada" genérico.
        const comandaName =
          typeof data?.comandaName === 'string' && data.comandaName.trim()
            ? data.comandaName.trim()
            : null;
        const parsedCount = Number(data?.customerCount);
        const customerCount =
          Number.isFinite(parsedCount) && parsedCount > 0 ? Math.trunc(parsedCount) : null;
        const waiterName =
          typeof data?.waiterName === 'string' && data.waiterName.trim()
            ? data.waiterName.trim().slice(0, 80)
            : null;
        const waiterId =
          typeof data?.waiterId === 'string' && data.waiterId.trim()
            ? data.waiterId.trim().slice(0, 80)
            : null;

        session = await tx.tableSession.create({
          data: {
            companyId,
            tableId,
            status: 'OPEN',
            comandaName,
            customerCount,
            waiterName,
            waiterId,
          },
        });
      } else {
        // Mesa ocupada assumida por outro garçom: preenche o que estiver vazio.
        const takeOverPatch: any = {};
        if (!session.waiterName && typeof data?.waiterName === 'string' && data.waiterName.trim()) {
          takeOverPatch.waiterName = data.waiterName.trim().slice(0, 80);
        }
        if (!(session as any).waiterId && typeof data?.waiterId === 'string' && data.waiterId.trim()) {
          takeOverPatch.waiterId = data.waiterId.trim().slice(0, 80);
        }
        if (Object.keys(takeOverPatch).length > 0) {
          // Reabrir/atualizar mesa ocupada com o nome de quem assumiu.
          session = await tx.tableSession.update({
            where: { id: session.id },
            data: takeOverPatch,
          });
        }
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
          (ai) =>
            ai.productId === pId &&
            JSON.stringify(ai.modifiers) === JSON.stringify(modNames) &&
            (ai.notes || '') === (item.notes || ''),
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
            comandaName: (session as any).comandaName ?? null,
            waiterName: (session as any).waiterName ?? null,
            waiterId: (session as any).waiterId ?? null,
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
        imageUrl: data.imageUrl ? String(data.imageUrl).trim() : null,
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

  async deleteCategory(companyId: string, categoryId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
    });
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: companyId }, { slug: companyId }] },
    });
    const effectiveCompanyId = company?.id || companyId;
    const effectiveTenantId = tenant?.id || company?.id || companyId;

    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        OR: [
          { tenantId: effectiveTenantId },
          { companyId: effectiveCompanyId },
        ],
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    await this.prisma.product.updateMany({
      where: { categoryId: category.id },
      data: { categoryId: null },
    });

    return this.prisma.productCategory.delete({
      where: { id: category.id },
    });
  }
}

