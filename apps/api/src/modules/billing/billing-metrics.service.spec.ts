import { Test, TestingModule } from '@nestjs/testing';
import { BillingMetricsService } from './billing-metrics.service';

describe('BillingMetricsService', () => {
  let service: BillingMetricsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      subscription: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      tenant: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingMetricsService,
        { provide: 'PRISMA', useValue: prismaMock },
      ],
    }).compile();

    service = module.get<BillingMetricsService>(BillingMetricsService);
  });

  describe('calculateMRR', () => {
    it('should correctly normalize monthly and yearly subscriptions into Monthly Recurring Revenue', async () => {
      prismaMock.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          plan: { price: 10000, billingPeriod: 'MONTHLY' }, // R$ 100,00/mês
        },
        {
          id: 'sub-2',
          plan: { price: 20000, billingPeriod: 'MONTHLY' }, // R$ 200,00/mês
        },
        {
          id: 'sub-3',
          plan: { price: 120000, billingPeriod: 'YEARLY' }, // R$ 1.200,00/ano -> R$ 100,00/mês
        },
      ]);

      const mrr = await service.calculateMRR();

      // 10000 + 20000 + (120000 / 12) = 40000 cents (R$ 400,00)
      expect(mrr).toBe(40000);
    });

    it('should return 0 when there are no active subscriptions', async () => {
      prismaMock.subscription.findMany.mockResolvedValue([]);

      const mrr = await service.calculateMRR();
      expect(mrr).toBe(0);
    });
  });

  describe('calculateARPU', () => {
    it('should divide MRR by active tenants count', async () => {
      prismaMock.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', plan: { price: 50000, billingPeriod: 'MONTHLY' } },
        { id: 'sub-2', plan: { price: 50000, billingPeriod: 'MONTHLY' } },
      ]);
      prismaMock.tenant.count.mockResolvedValue(2);

      const arpu = await service.calculateARPU();

      // MRR = 100000 / 2 = 50000
      expect(arpu).toBe(50000);
    });

    it('should return 0 when there are no active tenants', async () => {
      prismaMock.subscription.findMany.mockResolvedValue([]);
      prismaMock.tenant.count.mockResolvedValue(0);

      const arpu = await service.calculateARPU();
      expect(arpu).toBe(0);
    });
  });

  describe('calculateChurnRate', () => {
    it('should calculate the percentage of canceled over active subscriptions', async () => {
      prismaMock.subscription.count
        .mockResolvedValueOnce(5) // canceled
        .mockResolvedValueOnce(100); // active

      const churn = await service.calculateChurnRate(new Date());

      expect(churn).toBe(5); // 5%
    });

    it('should return 0 when active subscriptions count is 0', async () => {
      prismaMock.subscription.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const churn = await service.calculateChurnRate(new Date());
      expect(churn).toBe(0);
    });
  });

  describe('calculateLTV', () => {
    it('should estimate LTV using ARPU / (churnRate / 100)', async () => {
      // Setup ARPU: MRR = 10000, Active = 1 -> ARPU = 10000
      prismaMock.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', plan: { price: 10000, billingPeriod: 'MONTHLY' } },
      ]);
      prismaMock.tenant.count.mockResolvedValue(1);

      // Setup Churn: 5 canceled, 100 active -> 5%
      prismaMock.subscription.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(100);

      const ltv = await service.calculateLTV();

      // ARPU = 10000, Churn = 5% (0.05) -> LTV = 10000 / 0.05 = 200000
      expect(ltv).toBe(200000);
    });
  });
});
