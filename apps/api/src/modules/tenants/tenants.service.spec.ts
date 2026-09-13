import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { NotFoundException } from '@nestjs/common';
import { SlugService } from '../../common/services/slug.service';

const TENANT_STATUS = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
} as const;

const SUBSCRIPTION_STATUS = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  UNPAID: 'UNPAID',
} as const;

describe('TenantsService', () => {
  let service: TenantsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      subscription: { updateMany: jest.fn() },
      user: { create: jest.fn() },
      productCategory: { create: jest.fn() },
      product: { create: jest.fn() },
      automationRule: { createMany: jest.fn() },
      automationNotification: { create: jest.fn() },
      tenantSite: { create: jest.fn() },
      tenantAccessLog: { create: jest.fn() },
      tenantNote: { findMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        SlugService,
        { provide: 'PRISMA', useValue: prismaMock },
      ],
    }).compile();
    service = module.get<TenantsService>(TenantsService);
  });

  describe('suspend & reactivate', () => {
    it('updates status to SUSPENDED', async () => {
      prismaMock.tenant.update.mockResolvedValue({ id: 't-1', status: TENANT_STATUS.SUSPENDED });
      const result = await service.suspend('t-1', 'Pagamento em atraso');
      expect(result.status).toBe(TENANT_STATUS.SUSPENDED);
      expect(prismaMock.tenant.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { status: TENANT_STATUS.SUSPENDED },
      });
    });

    it('updates status to ACTIVE on reactivate', async () => {
      prismaMock.tenant.update.mockResolvedValue({ id: 't-1', status: TENANT_STATUS.ACTIVE });
      const result = await service.reactivate('t-1');
      expect(result.status).toBe(TENANT_STATUS.ACTIVE);
    });
  });

  describe('cancel', () => {
    it('cancels tenant and cascades to active subscriptions', async () => {
      prismaMock.tenant.update.mockResolvedValue({ id: 't-1', status: TENANT_STATUS.CANCELED });
      prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cancel('t-1');
      expect(result.status).toBe(TENANT_STATUS.CANCELED);
      const args = prismaMock.subscription.updateMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t-1');
      expect(args.where.status).toEqual({ not: 'CANCELED' });
      expect(args.data.status).toBe(SUBSCRIPTION_STATUS.CANCELED);
    });
  });

  describe('extendTrial', () => {
    it('throws if tenant does not exist', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);
      await expect(service.extendTrial('nope', 7)).rejects.toThrow(NotFoundException);
    });

    it('extends trial by adding days', async () => {
      const base = new Date(Date.now() + 5 * 86400000);
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 't-1', trialEndsAt: base });
      prismaMock.tenant.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 't-1', ...data }));
      const result = await service.extendTrial('t-1', 7);
      expect(result.trialEndsAt!.getTime()).toBeGreaterThan(base.getTime());
    });
  });
});
