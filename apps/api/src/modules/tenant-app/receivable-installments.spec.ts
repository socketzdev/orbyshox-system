import { TenantAppService } from './tenant-app.service';

/**
 * Crediário (Pagamentos Pendentes): venda parcelada com entrada amortizada,
 * pagamento parcial com teto, quitação e estorno de grupo no saldo do cliente.
 */
describe('TenantAppService — receivable installments', () => {
  let service: TenantAppService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      billReceivable: {
        create: jest.fn(async (args: any) => ({ id: `b-${Math.random()}`, ...args.data })),
        update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
        deleteMany: jest.fn(async () => ({ count: 2 })),
      },
      receivablePayment: {
        create: jest.fn(async (args: any) => ({ id: 'p1', ...args.data })),
      },
      customer: {
        update: jest.fn(async (args: any) => args.data),
      },
    };
    prisma = {
      tenant: { findUnique: jest.fn(async () => ({ id: 't1' })) },
      company: { findFirst: jest.fn(async () => null) },
      customer: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async (args: any) => ({ id: 'c1', ...args.data })),
        update: jest.fn(async (args: any) => args.data),
      },
      billReceivable: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    service = new TenantAppService(prisma, {} as any, { recordChangeSafe: jest.fn() } as any, {} as any);
  });

  const salePayload = {
    customerName: 'Maria',
    customerPhone: '11999990000',
    description: 'Vestido + bolsa',
    totalCents: 10000,
    initialPaidCents: 2500,
    installmentsTotal: 3,
    firstDueDate: '2026-10-10',
    intervalDays: 30,
    paymentMethod: 'Pix',
  };

  it('divide em parcelas com resto na última e amortiza a entrada', async () => {
    const res: any = await service.createReceivableSale('loja', salePayload, 'u1');
    expect(res.bills).toHaveLength(3);
    const amounts = res.bills.map((b: any) => b.amountCents);
    expect(amounts.reduce((s: number, v: number) => s + v, 0)).toBe(10000);
    // 10000/3 = 3333 + 3333 + 3334
    expect(amounts).toEqual([3333, 3333, 3334]);
    // Entrada de 2500 cobre a 1ª parcela inteira (sem histórico de cliente).
    expect(res.bills[0].paidCents).toBe(2500);
    expect(res.bills[0].status).toBe('PARTIAL');
    // Saldo devedor = total - entrada.
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { currentDebtCents: { increment: 7500 } },
    });
    expect(res.groupId).toMatch(/^grp-/);
  });

  it('exige cliente e total válido', async () => {
    await expect(service.createReceivableSale('loja', { ...salePayload, totalCents: 0 }, 'u1')).rejects.toThrow(
      'valor total',
    );
    await expect(
      service.createReceivableSale('loja', { ...salePayload, customerName: undefined }, 'u1'),
    ).rejects.toThrow('cliente');
  });

  it('pagamento parcial: teto, status PARTIAL e baixa no saldo', async () => {
    (prisma.billReceivable.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      tenantId: 't1',
      customerId: 'c1',
      amountCents: 5000,
      paidCents: 1000,
      status: 'PENDING',
    });
    const res: any = await service.payReceivable('loja', 'b1', { amountCents: 2000, method: 'Pix' }, 'u1');
    expect(res.bill.status).toBe('PARTIAL');
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { currentDebtCents: { decrement: 2000 } },
    });
  });

  it('quita total quando cobre o restante', async () => {
    (prisma.billReceivable.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      tenantId: 't1',
      customerId: 'c1',
      amountCents: 5000,
      paidCents: 1000,
      status: 'PARTIAL',
    });
    const res: any = await service.payReceivable('loja', 'b1', { amountCents: 4000 }, 'u1');
    expect(res.bill.status).toBe('RECEIVED');
  });

  it('recusa valor acima do pendente e parcela quitada', async () => {
    (prisma.billReceivable.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      tenantId: 't1',
      amountCents: 5000,
      paidCents: 1000,
      status: 'PENDING',
    });
    await expect(service.payReceivable('loja', 'b1', { amountCents: 5000 }, 'u1')).rejects.toThrow('pendente');
    (prisma.billReceivable.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      tenantId: 't1',
      amountCents: 5000,
      paidCents: 5000,
      status: 'RECEIVED',
    });
    await expect(service.payReceivable('loja', 'b1', { amountCents: 100 }, 'u1')).rejects.toThrow('quitada');
  });

  it('excluir grupo estorna o pendente do cliente', async () => {
    (prisma.billReceivable.findMany as jest.Mock).mockResolvedValue([
      { id: 'b1', customerId: 'c1', amountCents: 3000, paidCents: 1000 },
      { id: 'b2', customerId: 'c1', amountCents: 3000, paidCents: 0 },
    ]);
    const res: any = await service.deleteReceivableGroup('loja', 'grp-x', 'u1');
    expect(res).toEqual({ ok: true, groupId: 'grp-x', removed: 2 });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { currentDebtCents: { decrement: 5000 } },
    });
  });

  it('grupo inexistente dá 404', async () => {
    await expect(service.deleteReceivableGroup('loja', 'grp-nope', 'u1')).rejects.toThrow('não encontrada');
  });
});
