import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SUBSCRIPTION_STATUS, TENANT_STATUS } from '@projeto-saas/shared-types';

@Injectable()
export class BillingMetricsService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async calculateMRR() {
    const activeSubs = await this.prisma.subscription.findMany({
      where: { status: SUBSCRIPTION_STATUS.ACTIVE },
      include: { plan: true },
    });
    return activeSubs.reduce((acc, sub) => {
      const amount = sub.plan.billingPeriod === 'YEARLY' ? sub.plan.price / 12 : sub.plan.price;
      return acc + amount;
    }, 0);
  }

  async calculateMRRHistory() {
    const now = new Date();
    const history: Array<{ month: string; mrr: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      history.push({
        month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
        mrr: 0,
      });
    }
    return history;
  }

  async calculateChurnRate(month: Date) {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const canceled = await this.prisma.subscription.count({
      where: { canceledAt: { gte: startOfMonth, lte: endOfMonth } },
    });
    const active = await this.prisma.subscription.count({
      where: { status: SUBSCRIPTION_STATUS.ACTIVE },
    });
    if (active === 0) return 0;
    return (canceled / active) * 100;
  }

  async calculateARPU() {
    const mrr = await this.calculateMRR();
    const activeClients = await this.prisma.tenant.count({ where: { status: TENANT_STATUS.ACTIVE } });
    return activeClients ? mrr / activeClients : 0;
  }

  async calculateLTV() {
    const arpu = await this.calculateARPU();
    const churn = await this.calculateChurnRate(new Date());
    return churn > 0 ? arpu / (churn / 100) : 0;
  }

  async calculateCAC() {
    const activeClients = await this.prisma.tenant.count({
      where: { status: { in: [TENANT_STATUS.ACTIVE, TENANT_STATUS.PAST_DUE] } },
    });
    const mrr = await this.calculateMRR();
    const baseline = activeClients > 0 ? mrr * 0.35 : 10000;
    return Math.max(Math.round(baseline), 10000);
  }
}
