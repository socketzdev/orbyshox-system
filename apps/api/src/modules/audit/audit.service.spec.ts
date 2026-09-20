import { AuditService, diffFields } from './audit.service';

describe('diffFields', () => {
  it('lista apenas os campos que mudaram', () => {
    const before = { status: 'PENDING', amountCents: 100, description: 'Luz' };
    const after = { status: 'PAID', amountCents: 100, description: 'Luz' };

    expect(diffFields(before, after)).toEqual(['status']);
  });

  it('ignora campos iguais e detecta múltiplas mudanças', () => {
    const before = { a: 1, b: 'x', c: true };
    const after = { a: 2, b: 'x', c: false };

    expect(diffFields(before, after)).toEqual(['a', 'c']);
  });

  it('compara datas por valor, não por referência', () => {
    const before = { expiryDate: new Date('2026-01-01T00:00:00Z') };
    const after = { expiryDate: new Date('2026-01-01T00:00:00Z') };

    expect(diffFields(before, after)).toEqual([]);
  });

  it('detecta data efetivamente alterada', () => {
    const before = { expiryDate: new Date('2026-01-01T00:00:00Z') };
    const after = { expiryDate: new Date('2026-02-01T00:00:00Z') };

    expect(diffFields(before, after)).toEqual(['expiryDate']);
  });

  it('nunca reporta campos sensíveis como alterados', () => {
    const before = { managerPin: '1234', status: 'ACTIVE' };
    const after = { managerPin: '9999', status: 'ACTIVE' };

    expect(diffFields(before, after)).toEqual([]);
  });

  it('trata ausência de estado (criação/exclusão) sem quebrar', () => {
    expect(diffFields(null, { a: 1 })).toEqual([]);
    expect(diffFields({ a: 1 }, null)).toEqual([]);
    expect(diffFields(undefined, undefined)).toEqual([]);
  });

  it('detecta campo que passou a existir', () => {
    expect(diffFields({ a: 1 }, { a: 1, b: 2 })).toEqual(['b']);
  });
});

describe('AuditService.recordChange', () => {
  function makeService(createImpl?: jest.Mock) {
    const prisma = {
      auditLog: {
        create: createImpl ?? jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };
    return { service: new AuditService(prisma as any), prisma };
  }

  it('grava metadata estruturado com before, after, fields e reason', async () => {
    const { service, prisma } = makeService();

    await service.recordChange({
      userId: 'u-1',
      action: 'STOCK_BATCH_UPDATE',
      targetType: 'StockBatch',
      targetId: 'b-1',
      before: { status: 'ACTIVE', quantity: 10 },
      after: { status: 'EXPIRED', quantity: 10 },
      reason: 'validade vencida',
    });

    const arg = prisma.auditLog.create.mock.calls[0][0];
    expect(arg.data.userId).toBe('u-1');
    expect(arg.data.action).toBe('STOCK_BATCH_UPDATE');
    expect(arg.data.targetType).toBe('StockBatch');
    expect(arg.data.targetId).toBe('b-1');

    const metadata = JSON.parse(arg.data.metadata);
    expect(metadata.before).toEqual({ status: 'ACTIVE', quantity: 10 });
    expect(metadata.after).toEqual({ status: 'EXPIRED', quantity: 10 });
    expect(metadata.fields).toEqual(['status']);
    expect(metadata.reason).toBe('validade vencida');
  });

  it('redige campos sensíveis antes de gravar', async () => {
    const { service, prisma } = makeService();

    await service.recordChange({
      userId: 'u-1',
      action: 'SETTINGS_UPDATE',
      targetType: 'StoreSettings',
      targetId: 's-1',
      before: { managerPin: '1234', nfceCscToken: 'abc' },
      after: { managerPin: '9999', nfceCscToken: 'def' },
    });

    const metadata = JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.metadata);
    expect(metadata.before.managerPin).toBe('[REDACTED]');
    expect(metadata.before.nfceCscToken).toBe('[REDACTED]');
    expect(metadata.after.managerPin).toBe('[REDACTED]');
    expect(JSON.stringify(metadata)).not.toContain('1234');
    expect(JSON.stringify(metadata)).not.toContain('9999');
  });

  it('não grava trilha sem usuário identificado', async () => {
    const { service, prisma } = makeService();

    const result = await service.recordChange({
      userId: undefined,
      action: 'ORDER_CREATE',
      targetType: 'Order',
      targetId: 'o-1',
    });

    expect(result).toBeNull();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('aceita exclusão (after nulo) preservando o estado anterior', async () => {
    const { service, prisma } = makeService();

    await service.recordChange({
      userId: 'u-1',
      action: 'STOCK_BATCH_DELETE',
      targetType: 'StockBatch',
      targetId: 'b-1',
      before: { lotNumber: 'L-1', quantity: 5 },
      after: null,
    });

    const metadata = JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.metadata);
    expect(metadata.before).toEqual({ lotNumber: 'L-1', quantity: 5 });
    expect(metadata.after).toBeNull();
  });

  it('recordChangeSafe não derruba a operação de negócio quando a trilha falha', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('banco fora'));
    const { service } = makeService(failing);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.recordChangeSafe({
        userId: 'u-1',
        action: 'BILL_PAYABLE_PAID',
        targetType: 'BillPayable',
        targetId: 'bp-1',
      }),
    ).resolves.toBeNull();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
