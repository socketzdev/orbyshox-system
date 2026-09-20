import { BadRequestException } from '@nestjs/common';
import { TenantAppService } from './tenant-app.service';

/**
 * Confirmação da nota de compra: valida, abate por canal no turno e gera a
 * despesa paga. Os mocks simulam turno aberto/fechado e nota com 2 itens.
 */
describe('TenantAppService — confirmPurchaseNote', () => {
  let service: TenantAppService;
  let prisma: any;
  let tx: any;
  let audit: any;

  const NOTE = {
    id: 'note-1',
    title: 'Nota de Compra — Cozinha',
    status: 'IN_PROGRESS',
    items: [
      { id: 'i1', itemName: 'Arroz', quantity: '2 sacos', status: 'BOUGHT' },
      { id: 'i2', itemName: 'Ovo', quantity: '1 dz', status: 'BOUGHT' },
    ],
  };

  beforeEach(() => {
    tx = {
      purchaseNoteItem: { update: jest.fn() },
      purchaseNote: { update: jest.fn() },
      cashMovement: { deleteMany: jest.fn(), create: jest.fn((args: any) => ({ id: 'm', ...args.data })) },
      billPayable: { deleteMany: jest.fn(), create: jest.fn((args: any) => ({ id: 'b', ...args.data })) },
      cashRegister: { findFirst: jest.fn() },
    };
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      purchaseNote: { findFirst: jest.fn().mockResolvedValue({ ...NOTE }) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    audit = { recordChangeSafe: jest.fn() };

    service = new TenantAppService(prisma, {} as any, audit, {} as any);
  });

  const confirm = (payload: any) =>
    (service as any).confirmPurchaseNote('loja', 'note-1', payload, { id: 'u1', name: 'João' });

  it('pagamento único no PIX: 1 movimento + despesa paga', async () => {
    tx.cashRegister.findFirst.mockResolvedValue({ id: 'reg-1' });

    const res = await confirm({
      totalCents: 1500,
      payments: [{ method: 'PIX', amountCents: 1500 }],
    });

    expect(tx.purchaseNote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalCents: 1500, paidAt: expect.any(Date) }),
      }),
    );
    expect(JSON.parse(tx.purchaseNote.update.mock.calls[0][0].data.paymentsJson)).toEqual([
      { method: 'PIX', amountCents: 1500 },
    ]);
    expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'COMPRA', amountCents: 1500, paymentMethod: 'PIX' }),
      }),
    );
    expect(tx.billPayable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID', amountCents: 1500 }),
      }),
    );
    expect(res.payment.registerOpen).toBe(true);
  });

  it('combinado dinheiro+pix: 1 movimento por canal com valor exato', async () => {
    tx.cashRegister.findFirst.mockResolvedValue({ id: 'reg-1' });

    await confirm({
      totalCents: 1500,
      payments: [
        { method: 'DINHEIRO', amountCents: 1000 },
        { method: 'PIX', amountCents: 500 },
      ],
    });

    expect(tx.cashMovement.create).toHaveBeenCalledTimes(2);
    const amounts = tx.cashMovement.create.mock.calls
      .map((c: any) => c[0].data.amountCents)
      .sort((a: number, b: number) => a - b);
    expect(amounts).toEqual([500, 1000]);
  });

  it('sem turno aberto: sem movimento, mas nota + despesa registradas', async () => {
    tx.cashRegister.findFirst.mockResolvedValue(null);

    const res = await confirm({
      totalCents: 1500,
      payments: [{ method: 'CARTAO_CREDITO', amountCents: 1500 }],
    });

    expect(tx.cashMovement.create).not.toHaveBeenCalled();
    expect(tx.billPayable.create).toHaveBeenCalled();
    expect(res.payment.registerOpen).toBe(false);
  });

  it('reconfirmação apaga lançamentos anteriores antes de recriar', async () => {
    tx.cashRegister.findFirst.mockResolvedValue({ id: 'reg-1' });

    await confirm({ totalCents: 1500, payments: [{ method: 'PIX', amountCents: 1500 }] });

    expect(tx.cashMovement.deleteMany).toHaveBeenCalledWith({ where: { purchaseNoteId: 'note-1' } });
    expect(tx.billPayable.deleteMany).toHaveBeenCalledWith({ where: { purchaseNoteId: 'note-1' } });
  });

  it('recusa soma divergente, canal inválido e item estranho', async () => {
    await expect(
      confirm({ totalCents: 1500, payments: [{ method: 'PIX', amountCents: 1400 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      confirm({ totalCents: 1500, payments: [{ method: 'BITCOIN', amountCents: 1500 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      confirm({
        totalCents: 1500,
        payments: [{ method: 'PIX', amountCents: 1500 }],
        items: [{ itemId: 'outra-nota', priceCents: 1500 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rateio por item precisa fechar no total', async () => {
    await expect(
      confirm({
        totalCents: 1500,
        payments: [{ method: 'PIX', amountCents: 1500 }],
        items: [
          { itemId: 'i1', priceCents: 1000, paymentMethod: 'DINHEIRO' },
          { itemId: 'i2', priceCents: 400, paymentMethod: 'PIX' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.cashRegister.findFirst.mockResolvedValue(null);
    await confirm({
      totalCents: 1500,
      payments: [{ method: 'PIX', amountCents: 1500 }],
      items: [
        { itemId: 'i1', priceCents: 1000, paymentMethod: 'DINHEIRO' },
        { itemId: 'i2', priceCents: 500, paymentMethod: 'PIX' },
      ],
    });
    expect(tx.purchaseNoteItem.update).toHaveBeenCalledTimes(2);
  });
});
