import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BillingMetricsService } from '../billing/billing-metrics.service';
import {
  INVOICE_STATUS,
  TICKET_STATUS,
  TENANT_STATUS,
} from '@projeto-saas/shared-types';

@Injectable()
export class DashboardService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private metrics: BillingMetricsService,
  ) {}

  /**
   * Returns all KPI values for the dashboard header cards.
   */
  async getKPIs() {
    const [mrr, churnRate, arpu, ltv, cac, activeClients, newClientsThisMonth] =
      await Promise.all([
        this.metrics.calculateMRR(),
        this.metrics.calculateChurnRate(new Date()),
        this.metrics.calculateARPU(),
        this.metrics.calculateLTV(),
        this.metrics.calculateCAC(),
        this.prisma.tenant.count({ where: { status: TENANT_STATUS.ACTIVE } }),
        this.prisma.tenant.count({
          where: {
            status: TENANT_STATUS.ACTIVE,
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      ]);

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMrrInvoices = await this.prisma.invoice.aggregate({
      where: {
        status: INVOICE_STATUS.PAID,
        paidAt: {
          gte: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1),
          lt: new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 1),
        },
      },
      _sum: { amountCents: true },
    });
    const prevMrr = prevMrrInvoices._sum.amountCents || 0;
    const mrrGrowth = prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0;

    return {
      mrr,
      mrrGrowth: Math.round(mrrGrowth * 100) / 100,
      activeClients,
      newClientsThisMonth,
      churnRate: Math.round(churnRate * 100) / 100,
      arpu: Math.round(arpu),
      ltv: Math.round(ltv),
      cac,
    };
  }

  /**
   * Returns MRR data points for the last 12 months.
   */
  async getMRRHistory() {
    const now = new Date();
    const history = [];

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthLabel = monthStart.toLocaleDateString('pt-BR', {
        month: 'short',
        year: 'numeric',
      });

      const revenue = await this.prisma.invoice.aggregate({
        where: {
          status: INVOICE_STATUS.PAID,
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amountCents: true },
      });

      history.push({
        month: monthLabel,
        mrr: revenue._sum.amountCents || 0,
      });
    }

    return history;
  }

  /**
   * Returns new vs canceled clients per month for the last 12 months.
   */
  async getAcquisition() {
    const now = new Date();
    const data = [];

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthLabel = monthStart.toLocaleDateString('pt-BR', {
        month: 'short',
        year: 'numeric',
      });

      const [newClients, canceledClients] = await Promise.all([
        this.prisma.tenant.count({
          where: {
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        }),
        this.prisma.subscription.count({
          where: {
            canceledAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);

      data.push({ month: monthLabel, newClients, canceledClients });
    }

    return data;
  }

  /**
   * Returns active tenant count grouped by plan.
   */
  async getPlanDistribution() {
    const groups = await this.prisma.subscription.groupBy({
      by: ['planId'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
    });

    const plans = await this.prisma.plan.findMany({
      where: { id: { in: groups.map((g) => g.planId) } },
      select: { id: true, name: true },
    });

    const total = groups.reduce((sum, g) => sum + g._count.id, 0);
    if (total === 0) {
      const allPlans = await this.prisma.plan.findMany({ select: { id: true, name: true }, take: 5 });
      return allPlans.map((p) => ({ label: p.name, value: 0, percentage: 0 }));
    }
    return groups.map((g) => ({
      label: plans.find((p) => p.id === g.planId)?.name || 'Unknown',
      value: g._count.id,
      percentage: Math.round((g._count.id / total) * 100),
    }));
  }

  /**
   * Returns active tenant count grouped by niche.
   */
  async getNicheDistribution() {
    const nicheLabels: Record<string, string> = {
      RESTAURANT: 'Restaurante',
      BARBERSHOP: 'Barbearia',
      SUPERMARKET: 'Supermercado',
    };

    const groups = await this.prisma.tenant.groupBy({
      by: ['niche'],
      _count: { id: true },
      where: { status: TENANT_STATUS.ACTIVE },
    });

    const total = groups.reduce((sum, g) => sum + g._count.id, 0);
    return groups.map((g) => ({
      label: nicheLabels[g.niche] || g.niche,
      value: g._count.id,
      percentage: total > 0 ? Math.round((g._count.id / total) * 100) : 0,
    }));
  }

  /**
   * Returns active tenant count grouped by state (from address JSON).
   */
  async getRegionDistribution() {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: TENANT_STATUS.ACTIVE },
      select: { address: true },
    });

    const regionCounts: Record<string, number> = {};
    for (const t of tenants) {
      const state = (t.address as any)?.state || 'Não informado';
      regionCounts[state] = (regionCounts[state] || 0) + 1;
    }

    const total = Object.values(regionCounts).reduce((sum, v) => sum + v, 0);
    return Object.entries(regionCounts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }

  /**
   * Returns alert counts for the dashboard banner.
   */
  async getAlerts() {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [paymentFailures, delinquent, ticketsOverdue, trialsExpiring] =
      await Promise.all([
        this.prisma.invoice.count({
          where: {
            status: INVOICE_STATUS.OVERDUE,
            updatedAt: { gte: twentyFourHoursAgo },
          },
        }),
        this.prisma.tenant.count({
          where: { status: TENANT_STATUS.PAST_DUE },
        }),
        this.prisma.ticket.count({
          where: {
            status: TICKET_STATUS.OPEN,
            createdAt: { lte: twoHoursAgo },
            messages: { none: {} },
          },
        }),
        this.prisma.tenant.count({
          where: {
            status: TENANT_STATUS.TRIAL,
            trialEndsAt: { lte: threeDaysFromNow, gte: now },
            stripeCustomerId: null,
          },
        }),
      ]);

    return [
      {
        type: 'payment_failed',
        count: paymentFailures,
        label: 'pagamentos recusados',
      },
      {
        type: 'delinquent',
        count: delinquent,
        label: 'clientes inadimplentes',
      },
      {
        type: 'ticket_overdue',
        count: ticketsOverdue,
        label: 'tickets sem resposta',
      },
      {
        type: 'trial_expiring',
        count: trialsExpiring,
        label: 'trials vencendo',
      },
    ].filter((a) => a.count > 0);
  }
}
