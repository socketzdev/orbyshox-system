import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantGateway } from './restaurant.gateway';
import { AuditService } from '../audit/audit.service';

/**
 * Testes do fechamento de comanda e da validação de quantidade.
 *
 * Cada teste aqui reproduz um bug real encontrado na auditoria. A regra é que
 * o teste FALHE antes da correção — por isso os cenários montam exatamente o
 * estado que causava o problema (pedido cancelado na conta, quantidade absurda,
 * mesa sem comanda aberta).
 */
describe('RestaurantService — fechamento e validações de pedido', () => {
  let service: RestaurantService;
  let prisma: any;
  let gateway: any;

  const COMPANY = 'company-1';
  const TABLE = 'table-1';

  beforeEach(async () => {
    prisma = {
      table: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      tableSession: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      order: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
      product: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
      waiterCall: { updateMany: jest.fn() },
      tipConfig: { findFirst: jest.fn(), create: jest.fn(), upsert: jest.fn() },
      serviceFeePayment: { create: jest.fn().mockResolvedValue({ id: 'fee-1' }), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), aggregate: jest.fn() },
      serviceFeePayout: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
      user: { findMany: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };

    gateway = {
      notifyOrderCreated: jest.fn(),
      notifyOrderStatusChanged: jest.fn(),
      notifyTableStatusChanged: jest.fn(),
      notifyWaiterCalled: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantService,
        { provide: 'PRISMA', useValue: prisma },
        { provide: RestaurantGateway, useValue: gateway },
        { provide: AuditService, useValue: { recordChangeSafe: jest.fn() } },
      ],
    }).compile();

    service = module.get<RestaurantService>(RestaurantService);
  });

  /** Monta o estado mínimo para um fechamento: mesa existe e há sessão aberta. */
  const givenOpenSession = (orders: any[]) => {
    prisma.table.findFirst.mockResolvedValue({
      id: TABLE,
      label: 'Mesa 01',
      companyId: COMPANY,
      status: 'OCCUPIED',
    });
    prisma.tableSession.findFirst.mockResolvedValue({
      id: 'session-1',
      openedAt: new Date('2026-09-13T18:00:00Z'),
    });
    prisma.tableSession.update.mockResolvedValue({ id: 'session-1' });
    prisma.table.update.mockResolvedValue({ id: TABLE, status: 'FREE' });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    prisma.waiterCall.updateMany.mockResolvedValue({ count: 0 });

    // O filtro de status vive na consulta, não no JavaScript — se o mock
    // devolvesse a lista crua, o teste passaria mesmo com o bug presente.
    // Então o mock simula o `where` que o Prisma aplicaria.
    prisma.order.findMany.mockImplementation(async (args: any) => {
      const excluded = args?.where?.status?.not;
      return excluded ? orders.filter((o: any) => o.status !== excluded) : orders;
    });
  };

  describe('A6 — conta do fechamento', () => {
    it('NÃO cobra pedido cancelado', async () => {
      givenOpenSession([
        {
          id: 'o1',
          orderNumber: 101,
          status: 'CANCELLED',
          subtotalCents: 5000,
          discountCents: 0,
          totalCents: 5000,
          paymentMethod: 'PIX',
          items: [
            { id: 'i1', quantity: 2, unitPriceCents: 2500, totalPrice: 5000, product: { name: 'Picanha' }, modifiers: [] },
          ],
        },
      ]);

      const result: any = await service.closeTableSession(COMPANY, TABLE);

      expect(result.receipt.totalCents).toBe(0);
      expect(result.receipt.items).toHaveLength(0);
    });

    it('cobra apenas os pedidos ativos quando há cancelado junto', async () => {
      givenOpenSession([
        {
          id: 'o1',
          orderNumber: 101,
          status: 'CANCELLED',
          subtotalCents: 5000,
          discountCents: 0,
          totalCents: 5000,
          paymentMethod: 'PIX',
          items: [{ id: 'i1', quantity: 2, unitPriceCents: 2500, totalPrice: 5000, product: { name: 'Picanha' }, modifiers: [] }],
        },
        {
          id: 'o2',
          orderNumber: 102,
          status: 'READY',
          subtotalCents: 3000,
          discountCents: 0,
          totalCents: 3000,
          paymentMethod: 'PIX',
          items: [{ id: 'i2', quantity: 1, unitPriceCents: 3000, totalPrice: 3000, product: { name: 'Suco' }, modifiers: [] }],
        },
      ]);

      const result: any = await service.closeTableSession(COMPANY, TABLE);

      expect(result.receipt.totalCents).toBe(3000);
      expect(result.receipt.orderNumbers).toEqual([102]);
    });

    it('pede ao Prisma para excluir CANCELLED na leitura da conta', async () => {
      givenOpenSession([]);
      await service.closeTableSession(COMPANY, TABLE);

      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ not: 'CANCELLED' });
    });
  });

  /**
   * A forma de pagamento do fechamento.
   *
   * O bug original: o recibo lia `order.paymentMethod`, que o fluxo de garçom
   * nunca preenche — então a linha "Pagamento" simplesmente não existia no
   * cupom. Agora o modal manda a forma no corpo do fechamento e ela é a fonte
   * da verdade.
   */
  describe('forma de pagamento no fechamento da comanda', () => {
    const ONE_ORDER = [
      {
        id: 'o1',
        orderNumber: 101,
        status: 'READY',
        subtotalCents: 5000,
        discountCents: 0,
        totalCents: 5000,
        // O fluxo de garçom deixa este campo nulo — é o que causava o sumiço.
        paymentMethod: null,
        items: [
          { id: 'i1', quantity: 2, unitPriceCents: 2500, totalPrice: 5000, product: { name: 'Picanha' }, modifiers: [] },
        ],
      },
    ];

    it('usa a forma enviada pelo modal mesmo sem paymentMethod nos pedidos', async () => {
      givenOpenSession(ONE_ORDER);

      const result: any = await service.closeTableSession(COMPANY, TABLE, { method: 'PIX' });

      expect(result.receipt.paymentMethod).toBe('PIX');
      expect(result.receipt.paymentMethods).toEqual(['PIX']);
    });

    it('normaliza a forma enviada (alias do terminal genérico)', async () => {
      givenOpenSession(ONE_ORDER);

      const credit = await service.closeTableSession(COMPANY, TABLE, { method: 'CREDIT_CARD' });
      const cash = await service.closeTableSession(COMPANY, TABLE, { method: 'cash' });

      expect((credit as any).receipt.paymentMethod).toBe('CARTAO_CREDITO');
      expect((cash as any).receipt.paymentMethod).toBe('DINHEIRO');
    });

    it('grava a forma nos pedidos para os relatórios não perderem a venda', async () => {
      givenOpenSession(ONE_ORDER);

      await service.closeTableSession(COMPANY, TABLE, { method: 'CARTAO_DEBITO' });

      const write = prisma.order.updateMany.mock.calls.find(
        (call: any[]) => call[0]?.data?.paymentMethod === 'CARTAO_DEBITO',
      );
      expect(write).toBeDefined();
      expect(write![0].where.tableSessionId).toBe('session-1');
    });

    it('calcula o troco só em dinheiro', async () => {
      givenOpenSession(ONE_ORDER);

      const dinheiro = await service.closeTableSession(COMPANY, TABLE, {
        method: 'DINHEIRO',
        amountReceivedCents: 10000,
      });
      expect((dinheiro as any).receipt.changeCents).toBe(5000);
      expect((dinheiro as any).receipt.amountReceivedCents).toBe(10000);

      // Cartão não tem troco, mesmo se a tela mandar um valor recebido.
      const cartao = await service.closeTableSession(COMPANY, TABLE, {
        method: 'CARTAO_CREDITO',
        amountReceivedCents: 10000,
      });
      expect((cartao as any).receipt.changeCents).toBeNull();
      expect((cartao as any).receipt.amountReceivedCents).toBeNull();
    });

    it('nunca devolve troco negativo (valor recebido menor que a conta)', async () => {
      givenOpenSession(ONE_ORDER);

      const result: any = await service.closeTableSession(COMPANY, TABLE, {
        method: 'DINHEIRO',
        amountReceivedCents: 3000,
      });

      expect(result.receipt.changeCents).toBe(0);
    });

    it('mantém o comportamento antigo quando o fechamento não manda forma', async () => {
      givenOpenSession([
        { ...ONE_ORDER[0], paymentMethod: 'PIX' },
      ]);

      const result: any = await service.closeTableSession(COMPANY, TABLE);

      expect(result.receipt.paymentMethods).toEqual(['PIX']);
      expect(result.receipt.amountReceivedCents).toBeNull();
    });

    it('não tenta gravar forma de pagamento quando nenhuma foi informada', async () => {
      givenOpenSession(ONE_ORDER);

      await service.closeTableSession(COMPANY, TABLE);

      const write = prisma.order.updateMany.mock.calls.find(
        (call: any[]) => call[0]?.data?.paymentMethod !== undefined,
      );
      expect(write).toBeUndefined();
    });

    it('devolve paymentMethod nulo quando nada foi informado', async () => {
      givenOpenSession(ONE_ORDER);

      const result: any = await service.closeTableSession(COMPANY, TABLE);

      expect(result.receipt.paymentMethod).toBeNull();
      expect(result.receipt.paymentMethods).toEqual([]);
    });

    it('limita as observações de pagamento para não estourar o cupom', async () => {
      givenOpenSession(ONE_ORDER);

      const result: any = await service.closeTableSession(COMPANY, TABLE, {
        method: 'PIX',
        notes: 'X'.repeat(500),
      });

      expect(result.receipt.paymentNotes).toHaveLength(200);
    });
  });

  describe('A17 — fechar mesa sem comanda', () => {
    it('recusa com 409 em vez de devolver 200 com recibo vazio', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: TABLE, label: 'Mesa 01', status: 'FREE' });
      prisma.tableSession.findFirst.mockResolvedValue(null);

      await expect(service.closeTableSession(COMPANY, TABLE)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('A16 — teto de quantidade', () => {
    it('recusa quantidade acima do máximo', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: TABLE, companyId: COMPANY });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Picanha',
        salePriceCents: 2500,
        isActive: true,
        isRecipe: false,
        modifierGroups: [],
      });
      prisma.order.findFirst.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue({ id: 'o1', orderNumber: 1 });

      await expect(
        service.createOrder({ companyId: COMPANY, tableId: TABLE }, {
          items: [{ productId: 'p1', quantity: 1000000 }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa quantidade zerada ou negativa', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: TABLE, companyId: COMPANY });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Picanha',
        salePriceCents: 2500,
        isActive: true,
        isRecipe: false,
        modifierGroups: [],
      });
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder({ companyId: COMPANY, tableId: TABLE }, {
          items: [{ productId: 'p1', quantity: -3 }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Garçom responsável (KDS + alerta no celular)', () => {
    const givenProduct = () => {
      prisma.table.findFirst.mockResolvedValue({ id: TABLE, companyId: COMPANY });
      prisma.table.update.mockResolvedValue({ id: TABLE, status: 'OCCUPIED' });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Picanha',
        salePriceCents: 2500,
        isActive: true,
        modifierGroups: [],
      });
      prisma.order.findFirst.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue({ id: 'o1', orderNumber: 101 });
    };

    it('grava o garçom no pedido e herda na comanda', async () => {
      givenProduct();
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'session-1', waiterName: null, waiterId: null });

      await service.createOrder({ companyId: COMPANY, tableId: TABLE }, {
        items: [{ productId: 'p1', quantity: 1 }],
        waiterName: '  Carlos  ',
        waiterId: 'user-carlos',
      } as any);

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ waiterName: 'Carlos', waiterId: 'user-carlos' }),
        }),
      );
      expect(prisma.tableSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ waiterName: 'Carlos', waiterId: 'user-carlos' }),
        }),
      );
    });

    it('sem garçom grava null e não herda nada', async () => {
      givenProduct();
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'session-1', waiterName: null, waiterId: null });

      await service.createOrder({ companyId: COMPANY, tableId: TABLE }, {
        items: [{ productId: 'p1', quantity: 1 }],
      } as any);

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ waiterName: null, waiterId: null }) }),
      );
      expect(prisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('não sobrescreve o garçom que já assumiu a mesa', async () => {
      givenProduct();
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'session-1', waiterName: 'Ana', waiterId: 'user-ana' });

      await service.createOrder({ companyId: COMPANY, tableId: TABLE }, {
        items: [{ productId: 'p1', quantity: 1 }],
        waiterName: 'Carlos',
        waiterId: 'user-carlos',
      } as any);

      // O pedido leva quem lançou, mas a mesa continua da Ana.
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ waiterName: 'Carlos', waiterId: 'user-carlos' }),
        }),
      );
      expect(prisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('abertura de mesa grava o garçom que assumiu', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: TABLE, companyId: COMPANY });
      prisma.tableSession.findFirst.mockResolvedValue(null);
      prisma.tableSession.create.mockResolvedValue({ id: 'session-1' });
      prisma.table.update.mockResolvedValue({ id: TABLE, status: 'OCCUPIED' });

      await service.openTableSession(COMPANY, TABLE, {
        comandaName: 'Mesa do João',
        waiterName: 'Ana',
        waiterId: 'user-ana',
      } as any);

      expect(prisma.tableSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ waiterName: 'Ana', waiterId: 'user-ana' }),
        }),
      );
    });
  });

  describe('Caixinha dos 10% (fechamento, ajuste e divisão)', () => {
    const givenBill = (totalCents: number) => {
      givenOpenSession([
        {
          id: 'o1',
          orderNumber: 108,
          status: 'READY',
          subtotalCents: totalCents,
          discountCents: 0,
          totalCents,
          paymentMethod: null,
          items: [
            { id: 'i1', quantity: 2, unitPriceCents: totalCents / 2, totalPrice: totalCents, product: { name: 'Burger' }, modifiers: [] },
          ],
        },
      ]);
    };

    it('fecha criando o 10% pago (134,00 → 13,40 PAID) vinculado à comanda', async () => {
      givenBill(13400);

      const res: any = await service.closeTableSession(
        COMPANY,
        TABLE,
        { method: 'PIX', tip: { paidCents: 1340, method: 'PIX' } },
        { id: 'u1', name: 'Carlos' },
      );

      expect(prisma.serviceFeePayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableSessionId: 'session-1',
            billTotalCents: 13400,
            suggestedCents: 1340,
            paidCents: 1340,
            status: 'PAID',
            paymentMethod: 'PIX',
          }),
        }),
      );
      expect(res.receipt.tip).toMatchObject({ paidCents: 1340, status: 'PAID' });
      // O consumo segue para o caixa da empresa, não para o caixinha.
      expect(res.receipt.totalCents).toBe(13400);
    });

    it('sem 10% registra NOT_PAID zerado (transparência)', async () => {
      givenBill(13400);

      await service.closeTableSession(COMPANY, TABLE, { method: 'DINHEIRO' });

      expect(prisma.serviceFeePayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paidCents: 0, status: 'NOT_PAID' }),
        }),
      );
    });

    it('deriva OVER e UNDER dos valores', async () => {
      givenBill(13400);
      await service.closeTableSession(COMPANY, TABLE, {
        method: 'PIX',
        tip: { paidCents: 1500, method: 'PIX' },
      });
      expect(prisma.serviceFeePayment.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OVER' }) }),
      );

      givenBill(13400);
      await service.closeTableSession(COMPANY, TABLE, {
        method: 'PIX',
        tip: { paidCents: 1000, method: 'PIX' },
      });
      expect(prisma.serviceFeePayment.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'UNDER' }) }),
      );
    });

    it('pagou sem informar o canal → 400', async () => {
      givenBill(13400);
      await expect(
        service.closeTableSession(COMPANY, TABLE, { tip: { paidCents: 500 } } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ajuste exige motivo, deriva status e registra trilha', async () => {
      prisma.serviceFeePayment.findFirst.mockResolvedValue({
        id: 'fee-1',
        paidCents: 1340,
        paymentMethod: 'PIX',
        status: 'PAID',
        suggestedCents: 1340,
        editCount: 0,
      });
      prisma.serviceFeePayment.update.mockResolvedValue({ id: 'fee-1' });

      await expect(
        service.updateTipPayment(COMPANY, 'fee-1', { paidCents: 1500 } as any, { id: 'u9', name: 'Dona' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const updated: any = await service.updateTipPayment(
        COMPANY,
        'fee-1',
        { paidCents: 1500, reason: 'Cliente completou depois' },
        { id: 'u9', name: 'Dona' },
      );

      expect(prisma.serviceFeePayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidCents: 1500,
            status: 'OVER',
            editCount: 1,
            lastEditBy: 'Dona',
            lastEditBeforeCents: 1340,
            lastEditAfterCents: 1500,
          }),
        }),
      );
      expect(updated).toEqual({ id: 'fee-1' });
    });

    it('divisão: 2000 ÷ 5 = 400 cada; sem saldo ou sem gente → 400', async () => {
      prisma.serviceFeePayout.findFirst.mockResolvedValue(null);
      prisma.serviceFeePayment.aggregate.mockResolvedValue({ _sum: { paidCents: 200000 }, _count: { id: 10 } });
      prisma.serviceFeePayment.findFirst.mockResolvedValue({ createdAt: new Date('2026-09-14') });
      prisma.user.findMany.mockResolvedValue(
        ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: `u${i}`, name: n, role: 'WAITER', position: 'Garçom' })),
      );
      prisma.tipConfig.findFirst.mockResolvedValue({
        percentBps: 1000,
        eligibleRoles: '["WAITER"]',
        active: true,
      });
      prisma.serviceFeePayout.create.mockImplementation(async (args: any) => ({ id: 'pay-1', ...args.data }));

      const payout: any = await service.createPayout(COMPANY, { id: 'boss', name: 'Dono' });

      expect(payout.totalCents).toBe(200000);
      expect(payout.participantCount).toBe(5);
      expect(payout.amountEachCents).toBe(40000);
      expect(payout.remainderCents).toBe(0);
      expect(payout.confirmedByName).toBe('Dono');

      prisma.serviceFeePayment.aggregate.mockResolvedValue({ _sum: { paidCents: 0 }, _count: { id: 0 } });
      await expect(service.createPayout(COMPANY)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('config valida taxa e cargos', async () => {
      await expect(service.updateTipConfig(COMPANY, { percentBps: 99999 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.updateTipConfig(COMPANY, { eligibleRoles: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      prisma.tipConfig.upsert.mockResolvedValue({ percentBps: 1000, eligibleRoles: '["WAITER"]' });
      await service.updateTipConfig(COMPANY, { eligibleRoles: ['WAITER', 'ROOT'] });
      expect(prisma.tipConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ eligibleRoles: '["WAITER"]' }) }),
      );
    });
  });

  describe('Mapa Chamando Garçom (prontos com dono)', () => {
    it('mapa expõe os prontos com o dono para o filtro Chamando Garçom', async () => {
      prisma.table.findMany.mockResolvedValue([
        {
          id: TABLE,
          number: 7,
          label: 'Mesa 07',
          capacity: 4,
          status: 'OCCUPIED',
          devices: [],
          waiterCalls: [],
          tableSessions: [
            {
              id: 'session-1',
              comandaName: 'João',
              waiterName: 'Carlos',
              waiterId: 'user-carlos',
              customerCount: 2,
              orders: [
                { orderNumber: 108, status: 'READY', totalCents: 5000, waiterName: 'Carlos', waiterId: 'user-carlos', items: [] },
                { orderNumber: 109, status: 'PREPARING', totalCents: 3000, waiterName: null, waiterId: null, items: [] },
              ],
            },
          ],
        },
      ]);

      const tables: any[] = await service.listTables(COMPANY);

      expect(tables).toHaveLength(1);
      expect(tables[0].readyOrdersCount).toBe(1);
      expect(tables[0].readyOrders).toEqual([
        { orderNumber: 108, waiterName: 'Carlos', waiterId: 'user-carlos' },
      ]);
    });

    it('pronto de QR herda o dono da comanda', async () => {
      prisma.table.findMany.mockResolvedValue([
        {
          id: TABLE,
          number: 7,
          label: 'Mesa 07',
          capacity: 4,
          status: 'OCCUPIED',
          devices: [],
          waiterCalls: [],
          tableSessions: [
            {
              id: 'session-1',
              comandaName: null,
              waiterName: 'Ana',
              waiterId: 'user-ana',
              customerCount: 1,
              orders: [
                { orderNumber: 110, status: 'READY', totalCents: 2000, waiterName: null, waiterId: null, items: [] },
              ],
            },
          ],
        },
      ]);

      const tables: any[] = await service.listTables(COMPANY);

      expect(tables[0].readyOrders).toEqual([
        { orderNumber: 110, waiterName: 'Ana', waiterId: 'user-ana' },
      ]);
    });
  });
});
