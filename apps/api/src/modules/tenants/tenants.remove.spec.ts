import { TenantsService } from './tenants.service';

/**
 * Exclusão definitiva de empresa: 404 se não existe; em ordem de
 * dependência (documentos → cadastros → usuários → company → tenant).
 */
describe('TenantsService — remove', () => {
  let service: TenantsService;
  let prisma: any;
  let tx: any;
  const order: string[] = [];

  const table = (name: string) => ({
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
    deleteMany: jest.fn(async () => {
      order.push(`delMany:${name}`);
      return { count: 0 };
    }),
    delete: jest.fn(async (args: any) => {
      order.push(`delete:${name}`);
      return args?.where || {};
    }),
  });

  const tableNames = [
    'tenant', 'user', 'order', 'orderItem', 'orderItemModifier', 'orderReturn',
    'waiterCall', 'tableSession', 'cashMovement', 'cashRegister', 'cashClosing',
    'serviceFeePayout', 'serviceFeePayment', 'billPayable', 'billReceivable',
    'invoice', 'couponUsage', 'subscription', 'purchaseNoteItem', 'purchaseNote',
    'purchaseOrderItem', 'purchaseOrder', 'nfeEntryItem', 'nfeEntry',
    'offlineSyncQueue', 'stockLoss', 'stockMovement', 'inventoryAudit',
    'inventoryAuditItem', 'stockBatch', 'appointment', 'calendarEvent', 'service',
    'gymClassBooking', 'gymClass', 'gymAssessment', 'gymWorkout', 'gymCheckIn', 'gymEnrollment',
    'gymStudent', 'serviceOrderItem', 'serviceOrder', 'serviceQuote', 'serviceEquipment',
    'task', 'aiConversation', 'aiMessage', 'automationNotification',
    'automationRule', 'supplier', 'product', 'productCategory', 'productBarcode',
    'productIngredient', 'productSupplier', 'productModifierGroup',
    'productModifierItem', 'customer', 'ticket', 'ticketMessage',
    'ticketStatusHistory', 'tenantNote', 'tenantAccessLog', 'tenantSite',
    'storeSetting', 'cashierTerminal', 'role', 'table', 'device', 'tipConfig',
    'company', 'refreshToken', 'recoveryCode', 'auditLog', 'barberProfile',
  ];

  beforeEach(() => {
    order.length = 0;
    tx = {};
    prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    for (const name of tableNames) {
      const t = table(name);
      (prisma as any)[name] = t;
      (tx as any)[name] = t;
    }
    service = new TenantsService(prisma, {} as any);
  });

  it('404 quando a empresa não existe (nada é apagado)', async () => {
    await expect(service.remove('ghost')).rejects.toThrow('Empresa não encontrada');
    expect(order).toEqual([]);
  });

  it('apaga filhos antes dos pais e retorna o nome', async () => {    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 't1',
      companyName: 'Loja X LTDA',
      tradeName: 'Loja X',
      slug: 'loja-x',
    });
    for (const name of [
      'user', 'order', 'product', 'ticket', 'aiConversation', 'nfeEntry',
      'purchaseOrder', 'inventoryAudit', 'productModifierGroup',
    ]) {
      ((prisma as any)[name].findMany as jest.Mock).mockResolvedValue([{ id: 'x1' }]);
    }
    const res: any = await service.remove('t1');
    expect(res).toEqual({ success: true, id: 't1', name: 'Loja X' });

    const idx = (prefix: string) => order.findIndex((o) => o === prefix);
    // Documentos antes de cadastros, usuários antes da company, company antes do tenant.
    expect(idx('delMany:orderItem')).toBeGreaterThan(-1);
    expect(idx('delMany:order')).toBeGreaterThan(-1);
    expect(idx('delMany:order')).toBeGreaterThan(idx('delMany:orderItem'));
    expect(idx('delMany:user')).toBeLessThan(idx('delMany:company'));
    expect(idx('delete:company')).toBeLessThan(idx('delete:tenant'));
    expect(idx('delete:tenant')).toBeGreaterThan(-1);
  });
});
