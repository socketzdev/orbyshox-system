import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';

describe('BillingService (Stripe Webhook & Invoices)', () => {
  let service: BillingService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      stripeEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-123' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'tenant-123' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      subscription: {
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      invoice: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: 0 } }),
      },
      plan: {
        findFirst: jest.fn().mockResolvedValue({ id: 'plan-default' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'plan-explicit' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: 'PRISMA', useValue: prismaMock },
        { provide: 'STRIPE_CLIENT', useValue: null },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('processStripeEvent (Webhook Idempotency)', () => {
    it('should ignore already processed event', async () => {
      prismaMock.stripeEvent.findUnique.mockResolvedValue({ id: 'evt_123', processed: true });
      await service.processStripeEvent({ id: 'evt_123', type: 'invoice.payment_succeeded' });
      expect(prismaMock.stripeEvent.create).not.toHaveBeenCalled();
      expect(prismaMock.invoice.upsert).not.toHaveBeenCalled();
    });

    it('rejects malformed events instead of writing partial state', async () => {
      await expect(service.processStripeEvent({ type: 'invoice.paid' })).rejects.toThrow(
        /id e type/,
      );
      expect(prismaMock.stripeEvent.create).not.toHaveBeenCalled();
    });

    it('swallows P2002 when the same event is delivered concurrently', async () => {
      prismaMock.stripeEvent.findUnique.mockResolvedValue(null);
      prismaMock.stripeEvent.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.processStripeEvent({ id: 'evt_race', type: 'invoice.payment_succeeded' }),
      ).resolves.toBeUndefined();
      // A outra execução é dona do processamento: nada de efeito colateral aqui.
      expect(prismaMock.invoice.upsert).not.toHaveBeenCalled();
    });

    it('resumes an event that was created but never finished', async () => {
      prismaMock.stripeEvent.findUnique.mockResolvedValue({
        id: 'evt_stuck',
        type: 'invoice.payment_succeeded',
        processed: false,
      });
      const event = {
        id: 'evt_stuck',
        type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_stuck', customer: 'cus_xyz', amount_paid: 5000, created: 1700000000 } },
      };
      await service.processStripeEvent(event);
      expect(prismaMock.stripeEvent.create).not.toHaveBeenCalled();
      expect(prismaMock.invoice.upsert).toHaveBeenCalled();
      expect(prismaMock.stripeEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
      );
    });

    it('attaches stripeCustomerId on checkout.session.completed', async () => {
      const event = {
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', client_reference_id: 'tenant-123', customer: 'cus_xyz' } },
      };
      await service.processStripeEvent(event);
      expect(prismaMock.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { stripeCustomerId: 'cus_xyz' },
      });
    });

    it('extracts the customer id when Stripe expands customer into an object', async () => {
      const event = {
        id: 'evt_checkout_expanded',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_2',
            client_reference_id: 'tenant-123',
            customer: { id: 'cus_expanded', object: 'customer' },
          },
        },
      };
      await service.processStripeEvent(event);
      // Antes gravava "[object Object]" no banco.
      expect(prismaMock.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { stripeCustomerId: 'cus_expanded' },
      });
    });

    it('should handle customer.subscription.updated and persist ACTIVE status', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      const event = {
        id: 'evt_sub_upd_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_xyz',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
          },
        },
      };
      await service.processStripeEvent(event);
      expect(prismaMock.subscription.create).toHaveBeenCalled();
      const created = prismaMock.subscription.create.mock.calls[0][0].data;
      expect(created.status).toBe('ACTIVE');
      expect(created.planId).toBe('plan-default');
      const tenantUpdateCalls = prismaMock.tenant.update.mock.calls.map((c: any) => c[0]);
      expect(tenantUpdateCalls).toContainEqual({
        where: { id: 'tenant-123' },
        data: { status: 'ACTIVE' },
      });
    });

    it('maps unmapped Stripe statuses to UNPAID instead of persisting raw values', async () => {
      const event = {
        id: 'evt_sub_incomplete',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_incomplete',
            customer: 'cus_xyz',
            status: 'incomplete_expired',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
          },
        },
      };
      await service.processStripeEvent(event);
      const created = prismaMock.subscription.create.mock.calls[0][0].data;
      // O `toUpperCase()` antigo gravava "INCOMPLETE_EXPIRED", fora do domínio.
      expect(created.status).toBe('UNPAID');
    });

    it('throws a clear error when no plan can be resolved (no more non-null assertion crash)', async () => {
      prismaMock.plan.findFirst.mockResolvedValue(null);
      const event = {
        id: 'evt_no_plan',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_no_plan',
            customer: 'cus_xyz',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
          },
        },
      };
      await expect(service.processStripeEvent(event)).rejects.toThrow(/Plano não resolvível/);
      expect(prismaMock.stripeEvent.update).not.toHaveBeenCalled();
    });

    it('handles null period dates without producing Invalid Date', async () => {
      const event = {
        id: 'evt_null_period',
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_null', customer: 'cus_xyz', status: 'active' } },
      };
      await service.processStripeEvent(event);
      const created = prismaMock.subscription.create.mock.calls[0][0].data;
      expect(created.currentPeriodStart).toBeNull();
      expect(created.currentPeriodEnd).toBeNull();
    });

    it('should handle customer.subscription.deleted and cancel subscription', async () => {
      const event = {
        id: 'evt_sub_del_1',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_stripe_123' } },
      };
      await expect(service.processStripeEvent(event)).resolves.not.toThrow();
      expect(prismaMock.subscription.updateMany).toHaveBeenCalled();
      const call = prismaMock.subscription.updateMany.mock.calls[0][0];
      expect(call.where.stripeSubscriptionId).toBe('sub_stripe_123');
      expect(call.data.status).toBe('CANCELED');
    });

    it('should handle invoice.payment_failed and persist PAST_DUE status', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      const event = {
        id: 'evt_inv_fail_1',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_stripe_fail',
            customer: 'cus_xyz',
            amount_due: 9900,
            created: 1700000000,
          },
        },
      };
      await service.processStripeEvent(event);
      expect(prismaMock.invoice.upsert).toHaveBeenCalled();
      const tenantUpdateCalls = prismaMock.tenant.update.mock.calls.map((c: any) => c[0]);
      expect(tenantUpdateCalls).toContainEqual({
        where: { id: 'tenant-123' },
        data: { status: 'PAST_DUE' },
      });
    });
  });

  describe('getInvoices', () => {
    it('filters by status when provided', async () => {
      await service.getInvoices({ page: 1, limit: 10, status: 'PAID' });
      const args = prismaMock.invoice.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('PAID');
    });
  });
});
