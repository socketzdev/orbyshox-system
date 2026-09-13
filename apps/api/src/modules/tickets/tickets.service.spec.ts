import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';

const TICKET_PRIORITY = { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' } as const;
const TICKET_STATUS = { OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED' } as const;

describe('TicketsService', () => {
  let service: TicketsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      ticket: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      ticketMessage: { create: jest.fn() },
      ticketStatusHistory: { create: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TicketsService, { provide: 'PRISMA', useValue: prismaMock }],
    }).compile();
    service = module.get<TicketsService>(TicketsService);
  });

  describe('SLA calculation', () => {
    const cases: Array<[string, keyof typeof TICKET_PRIORITY, number]> = [
      ['CRITICAL', 'CRITICAL', 30 * 60 * 1000],
      ['HIGH', 'HIGH', 2 * 60 * 60 * 1000],
      ['MEDIUM', 'MEDIUM', 8 * 60 * 60 * 1000],
      ['LOW', 'LOW', 48 * 60 * 60 * 1000],
    ];

    for (const [label, key, expected] of cases) {
      it(`sets SLA deadline for ${label} priority`, async () => {
        prismaMock.ticket.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 't-1', ...data }));
        const before = Date.now();
        const result = await service.create(
          {
            tenantId: 'tenant-1',
            subject: `Teste ${label}`,
            category: 'USAGE_QUESTION',
            priority: TICKET_PRIORITY[key],
            initialMessage: 'Mensagem',
          },
          'admin-1',
        );
        const diff = result.slaDeadline!.getTime() - before;
        expect(diff).toBeGreaterThanOrEqual(expected - 1000);
        expect(diff).toBeLessThanOrEqual(expected + 5000);
      });
    }
  });

  describe('addMessage', () => {
    it('creates an internal note', async () => {
      prismaMock.ticketMessage.create.mockResolvedValue({ id: 'm-1', isInternal: true });
      const result = await service.addMessage('t-1', 'a-1', 'Nota interna', true);
      expect(result.isInternal).toBe(true);
      expect(prismaMock.ticketMessage.create).toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('transitions to RESOLVED', async () => {
      prismaMock.ticket.findUnique.mockResolvedValue({ id: 't-1', status: 'OPEN' });
      prismaMock.ticket.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 't-1', status: data.status, resolvedAt: data.resolvedAt }),
      );
      const result = await service.resolve('t-1');
      expect(result.status).toBe(TICKET_STATUS.RESOLVED);
    });
  });
});
