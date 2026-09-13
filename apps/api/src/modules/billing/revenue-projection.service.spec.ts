import { Test, TestingModule } from '@nestjs/testing';
import { RevenueProjectionService } from './revenue-projection.service';
import { BillingMetricsService } from './billing-metrics.service';

describe('RevenueProjectionService', () => {
  let service: RevenueProjectionService;
  let prismaMock: any;
  let metricsMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    metricsMock = {
      calculateMRR: jest.fn().mockResolvedValue(15000),
      calculateChurnRate: jest.fn().mockResolvedValue(5),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueProjectionService,
        { provide: 'PRISMA', useValue: prismaMock },
        { provide: BillingMetricsService, useValue: metricsMock },
      ],
    }).compile();
    service = module.get<RevenueProjectionService>(RevenueProjectionService);
  });

  it('produces six months of projection', async () => {
    const result = await service.getProjection();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(6);
    expect(typeof result[0].projectedMrr).toBe('number');
    expect(typeof result[0].optimistic).toBe('number');
    expect(typeof result[0].pessimistic).toBe('number');
  });

  it('month strings follow YYYY-MM format', async () => {
    const result = await service.getProjection();
    expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
  });
});
