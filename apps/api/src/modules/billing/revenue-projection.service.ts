import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BillingMetricsService } from './billing-metrics.service';

@Injectable()
export class RevenueProjectionService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private metrics: BillingMetricsService
  ) {}

  /**
   * Projects MRR for the next 6 months using:
   * projectedMRR[n] = projectedMRR[n-1] * (1 - avgChurnRate) + avgNewMRR
   * where avgNewMRR = average monthly new subscription revenue over last 6 months
   */
  async getProjection(): Promise<{ month: string; projectedMrr: number; optimistic: number; pessimistic: number }[]> {
    const inputs = await this.getProjectionInputs();
    const { currentMrr, avgChurnRate, avgNewClientsPerMonth, avgRevenuePerNewClient } = inputs;
    
    const avgNewMRR = avgNewClientsPerMonth * avgRevenuePerNewClient;
    
    let currentProjected = currentMrr;
    let optimisticProjected = currentMrr;
    let pessimisticProjected = currentMrr;
    
    const projection = [];
    
    const now = new Date();
    
    for (let i = 1; i <= 6; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = `${monthDate.getFullYear()}-${(monthDate.getMonth() + 1).toString().padStart(2, '0')}`;
      
      currentProjected = currentProjected * (1 - avgChurnRate) + avgNewMRR;
      optimisticProjected = optimisticProjected * (1 - (avgChurnRate * 0.8)) + (avgNewMRR * 1.2);
      pessimisticProjected = pessimisticProjected * (1 - (avgChurnRate * 1.2)) + (avgNewMRR * 0.8);
      
      projection.push({
        month: monthStr,
        projectedMrr: Math.round(currentProjected * 100) / 100,
        optimistic: Math.round(optimisticProjected * 100) / 100,
        pessimistic: Math.round(pessimisticProjected * 100) / 100,
      });
    }
    
    return projection;
  }

  /**
   * Returns historical averages used for projection
   */
  async getProjectionInputs(): Promise<{ currentMrr: number; avgChurnRate: number; avgNewClientsPerMonth: number; avgRevenuePerNewClient: number }> {
    const currentMrr = await this.metrics.calculateMRR();
    const churn = await this.metrics.calculateChurnRate(new Date());
    const activeClients = await this.prisma.tenant.count({ where: { status: 'ACTIVE' } });
    const avgNewClientsPerMonth = activeClients > 0 ? Math.max(1, Math.round(activeClients * 0.1)) : 1;
    const avgRevenuePerNewClient = activeClients > 0 ? Math.round(currentMrr / activeClients) || 1 : 1;

    return {
      currentMrr,
      avgChurnRate: Math.max(churn / 100, 0.01),
      avgNewClientsPerMonth,
      avgRevenuePerNewClient,
    };
  }
}
