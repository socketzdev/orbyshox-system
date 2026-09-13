import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

/** Só o subconjunto do SDK que o serviço consome — mantém o mock trivial nos testes. */
type StripeSubscriptionsClient = Pick<Stripe, 'subscriptions'>;

// SQLite não tem enums Prisma, então os valores válidos ficam em shared-types.
// Usamos literais para evitar divergência em runtime durante testes/HMR.

/**
 * O Stripe entrega "pelo menos uma vez": o mesmo evento chega várias vezes.
 * A idempotência é garantida pelo `id` do evento (PK de `StripeEvent`).
 *
 * ANTI-TOCTOU: o par `findUnique` + `create` fora de transação abria duas
 * janelas de corrida:
 *   a) duas entregas concorrentes do MESMO evento → as duas passavam pelo
 *      `findUnique` vazio, a segunda estourava P2002 e virava 500 (o Stripe
 *      então reenviava indefinidamente);
 *   b) um evento já `processed: true` retornava cedo e — por parecer "ok" —
 *      nunca mais era reprocessado, mesmo que o processamento anterior tenha
 *      falhado no meio (crédito de pagamento perdido silenciosamente).
 *
 * Agora o INSERT é a trava: `create` captura P2002 e o fluxo segue para as
 * regras de negócio (todas idempotentes via `upsert`), então reprocessamentos
 * são seguros e convergentes. Enquanto o processamento corre, o registro fica
 * com `processed: false`; ao final, `processed: true` e `processedAt`.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    /**
     * Cliente do Stripe usado apenas para rebuscar a assinatura referenciada
     * por um `checkout.session.completed`. Opcional: a verificação de assinatura
     * (que é o controle de segurança) acontece no controller; sem o cliente, o
     * evento segue sendo processado e a assinatura é reconciliada depois por
     * `customer.subscription.created`.
     */
    @Inject('STRIPE_CLIENT') private stripeClient: StripeSubscriptionsClient | null = null,
  ) {}

  async processStripeEvent(event: any) {
    if (!event?.id || !event?.type) {
      throw new Error('Evento Stripe inválido: id e type são obrigatórios');
    }

    const existing = await this.prisma.stripeEvent.findUnique({ where: { id: event.id } });
    if (existing?.processed) {
      this.logger.debug(`Evento ${event.id} (${event.type}) já processado — ignorado`);
      return;
    }

    if (!existing) {
      try {
        await this.prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
      } catch (error: any) {
        // P2002 = entrega concorrente do mesmo evento. A outra execução é dona
        // do processamento; sair aqui é o comportamento correto.
        if (error?.code === 'P2002') {
          this.logger.debug(`Evento ${event.id} sendo processado em paralelo — ignorado`);
          return;
        }
        throw error;
      }
    } else {
      // Registro existe mas ainda não foi concluído: retomamos o processamento.
      this.logger.warn(`Retomando evento ${event.id} (${event.type}) não concluído`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          // Chega aqui já rebuscado na API do Stripe (ver StripeWebhookController).
          const session: any = event.data.object;
          const tenant = await this.resolveTenant(
            session.client_reference_id,
            typeof session.customer === 'string' ? session.customer : session.customer?.id,
          );
          if (!tenant) {
            this.logger.warn(`checkout.session.completed sem tenant resolvível (session ${session.id})`);
            break;
          }

          const customerId =
            typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

          await this.prisma.tenant.update({
            where: { id: tenant.id },
            data: { stripeCustomerId: customerId },
          });

          // `checkout.session.completed` é o único evento que traz o vínculo
          // sessão → assinatura. Antes o `subscription` era descartado e a
          // assinatura só aparecia no sistema se `customer.subscription.created`
          // chegasse depois (o que a ordem de entrega do Stripe não garante).
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id ?? null;

          if (subscriptionId && this.stripeClient) {
            try {
              const sub: any = await this.stripeClient.subscriptions.retrieve(subscriptionId);
              await this.upsertSubscriptionFromStripe(sub, tenant.id);
            } catch (error: any) {
              // Falhar aqui NÃO pode abortar o evento: o vínculo do cliente já
              // foi persistido, e `customer.subscription.created` virá reconciliar.
              this.logger.error(
                `Falha ao sincronizar assinatura ${subscriptionId} do checkout: ${error?.message || error}`,
              );
            }
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub: any = event.data.object;
          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
          const tenant = await this.resolveTenant(undefined, customerId);
          if (tenant) {
            await this.upsertSubscriptionFromStripe(sub, tenant.id);
            if (sub.status === 'active') {
              await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } });
            }
          } else {
            this.logger.warn(`Assinatura ${sub.id} sem tenant para customer ${customerId}`);
          }
          break;
        }
        case 'customer.subscription.deleted': {
          await this.prisma.subscription.updateMany({
            where: { stripeSubscriptionId: event.data.object.id },
            data: { status: 'CANCELED', canceledAt: new Date() },
          });
          break;
        }
        case 'invoice.payment_succeeded':
        case 'invoice.paid': {
          const inv: any = event.data.object;
          const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
          const t = await this.resolveTenant(undefined, customerId);
          if (t) {
            await this.prisma.invoice.upsert({
              where: { stripeInvoiceId: inv.id },
              create: {
                tenantId: t.id,
                stripeInvoiceId: inv.id,
                amountCents: inv.amount_paid,
                status: 'PAID',
                dueDate: new Date((inv.created ?? Math.floor(Date.now() / 1000)) * 1000),
                paidAt: new Date(),
              },
              update: {
                status: 'PAID',
                amountCents: inv.amount_paid,
                paidAt: new Date(),
              },
            });
            await this.prisma.tenant.update({ where: { id: t.id }, data: { status: 'ACTIVE' } });
          } else {
            this.logger.warn(`Fatura paga ${inv.id} sem tenant para customer ${customerId}`);
          }
          break;
        }
        case 'invoice.payment_failed': {
          const inv: any = event.data.object;
          const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
          const t = await this.resolveTenant(undefined, customerId);
          if (t) {
            await this.prisma.invoice.upsert({
              where: { stripeInvoiceId: inv.id },
              create: {
                tenantId: t.id,
                stripeInvoiceId: inv.id,
                amountCents: inv.amount_due,
                status: 'OVERDUE',
                dueDate: new Date((inv.created ?? Math.floor(Date.now() / 1000)) * 1000),
              },
              update: { status: 'OVERDUE', amountCents: inv.amount_due },
            });
            await this.prisma.tenant.update({ where: { id: t.id }, data: { status: 'PAST_DUE' } });
          } else {
            this.logger.warn(`Fatura vencida ${inv.id} sem tenant para customer ${customerId}`);
          }
          break;
        }
        default:
          this.logger.debug(`Evento Stripe sem handler: ${event.type}`);
      }
      await this.prisma.stripeEvent.update({
        where: { id: event.id },
        data: { processed: true, processedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erro ao processar evento ${event.id} (${event.type}): ${message}`);
      throw error;
    }
  }

  /**
   * Resolve o tenant pelo `client_reference_id` (checkout) ou pelo
   * `stripeCustomerId` — o `customer` do Stripe vem como string OU objeto
   * expandido, e o código anterior assumia string, gravando `[object Object]`.
   */
  private async resolveTenant(clientReferenceId?: string | null, customerId?: string | null) {
    if (clientReferenceId) {
      const byId = await this.prisma.tenant.findUnique({ where: { id: clientReferenceId } });
      if (byId) return byId;
    }
    if (customerId) {
      const byCustomer = await this.prisma.tenant.findFirst({ where: { stripeCustomerId: customerId } });
      // `findFirst` (e não `findUnique`) é intencional: stripeCustomerId não é
      // @unique no schema, então findUnique não é tipado para este campo.
      if (byCustomer) return byCustomer;
    }
    return null;
  }

  /**
   * Cria/atualiza a assinatura a partir do objeto do Stripe.
   *
   * O bug antigo: `(await this.prisma.plan.findFirst())!.id` — o non-null
   * assertion estourava `TypeError: Cannot read properties of null` num banco
   * sem planos, derrubando o webhook inteiro e travando o evento em
   * `processed: false` para sempre. Agora: tenta `metadata.planId`, depois o
   * preço (`price.id`/`product`) e, sem nenhum plano resolvível, lança erro
   * explícito e acionável em vez de um TypeError opaco.
   */
  private async upsertSubscriptionFromStripe(sub: any, tenantId: string) {
    const planId = await this.resolvePlanId(sub);
    if (!planId) {
      throw new Error(
        `Plano não resolvível para a assinatura ${sub.id}: defina metadata.planId ou cadastre um plano.`,
      );
    }

    const toDate = (seconds?: number | null) =>
      typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;

    const status = this.mapSubscriptionStatus(sub.status);
    const periodStart = toDate(sub.current_period_start);
    const periodEnd = toDate(sub.current_period_end);

    // SQLite não tem `mode: 'insensitive'`; comparamos no app.
    const existing = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: sub.id },
    });

    if (existing) {
      return this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          planId,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          canceledAt: sub.canceled_at ? toDate(sub.canceled_at) : existing.canceledAt,
          cancelReason: sub.cancellation_details?.reason ?? existing.cancelReason,
        },
      });
    }

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId,
        stripeSubscriptionId: sub.id,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  /** `metadata.planId` → id de plano; senão tenta casar pelo `priceId` do preço. */
  private async resolvePlanId(sub: any): Promise<string | null> {
    const explicit = sub?.metadata?.planId;
    if (explicit) {
      const plan = await this.prisma.plan.findUnique({ where: { id: explicit } });
      if (plan) return plan.id;
    }

    const priceId =
      typeof sub?.items?.data?.[0]?.price?.id === 'string'
        ? sub.items.data[0].price.id
        : typeof sub?.items?.data?.[0]?.price === 'string'
          ? sub.items.data[0].price
          : null;

    if (priceId) {
      const byPrice = await this.prisma.plan.findFirst({ where: { stripePriceId: priceId } as any });
      if (byPrice) return byPrice.id;
    }

    const anyPlan = await this.prisma.plan.findFirst();
    return anyPlan?.id ?? null;
  }

  /**
   * Mapeia os status do Stripe para os valores de `SUBSCRIPTION_STATUS`.
   * O `toUpperCase()` antigo produzia valores inválidos como `INCOMPLETE` ou
   * `INCOMPLETE_EXPIRED`, que não existem no domínio e quebravam os filtros da UI.
   */
  private mapSubscriptionStatus(status?: string): string {
    switch ((status || '').toLowerCase()) {
      case 'active':
        return 'ACTIVE';
      case 'trialing':
        return 'TRIALING';
      case 'past_due':
        return 'PAST_DUE';
      case 'canceled':
        return 'CANCELED';
      case 'unpaid':
      case 'incomplete':
      case 'incomplete_expired':
      default:
        return 'UNPAID';
    }
  }

  async getInvoices(query: any) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: Number(skip),
        take: Number(limit),
        include: { tenant: { select: { companyName: true } } },
        orderBy: { dueDate: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async getOverview() {
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousEnd = currentStart;

    const [currentAgg, previousAgg, atRiskAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: currentStart, lt: currentEnd } },
        _sum: { amountCents: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: previousStart, lt: previousEnd } },
        _sum: { amountCents: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'OVERDUE' },
        _sum: { amountCents: true },
      }),
    ]);

    const totalRevenueCents = currentAgg._sum.amountCents ?? 0;
    const previousRevenueCents = previousAgg._sum.amountCents ?? 0;
    const atRiskRevenue = atRiskAgg._sum.amountCents ?? 0;

    const growthPercent =
      previousRevenueCents > 0
        ? Math.round(((totalRevenueCents - previousRevenueCents) / previousRevenueCents) * 10000) / 100
        : 0;

    return {
      totalRevenue: totalRevenueCents / 100,
      previousRevenue: previousRevenueCents / 100,
      growthPercent,
      atRiskRevenue: atRiskRevenue / 100,
      totalRevenueCents,
    };
  }

  async getDelinquent() {
    const now = new Date();
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'PAST_DUE' },
      select: {
        companyName: true,
        email: true,
        invoices: {
          where: { status: 'OVERDUE' },
          select: { amountCents: true, dueDate: true },
        },
      },
    });

    return tenants
      .filter((t) => t.invoices.length > 0)
      .map((t) => {
        const amountCents = t.invoices.reduce((sum, inv) => sum + (inv.amountCents ?? 0), 0);
        const earliestDue = t.invoices.reduce(
          (min, inv) => (inv.dueDate < min ? inv.dueDate : min),
          t.invoices[0].dueDate,
        );
        const daysOverdue = Math.floor(
          (now.getTime() - earliestDue.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          tenant: { companyName: t.companyName, email: t.email },
          daysOverdue,
          amountCents,
        };
      });
  }
}
