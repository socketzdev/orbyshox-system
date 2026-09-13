import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RevenueProjectionService } from '../billing/revenue-projection.service';
import { BillingMetricsService } from '../billing/billing-metrics.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly projectionService: RevenueProjectionService,
    private readonly metrics: BillingMetricsService,
  ) {}
  @Get('kpis') getKPIs() { return this.dashboardService.getKPIs(); }
  @Get('mrr-history') getMRRHistory() { return this.dashboardService.getMRRHistory(); }
  @Get('acquisition') getAcquisition() { return this.dashboardService.getAcquisition(); }
  @Get('distribution/plans') getPlanDistribution() { return this.dashboardService.getPlanDistribution(); }
  @Get('distribution/niches') getNicheDistribution() { return this.dashboardService.getNicheDistribution(); }
  @Get('distribution/regions') getRegionDistribution() { return this.dashboardService.getRegionDistribution(); }
  @Get('alerts') getAlerts() { return this.dashboardService.getAlerts(); }
  @Get('projection') getProjection() { return this.projectionService.getProjection(); }
  @Get('cac') async getCAC() { return { cac: await this.metrics.calculateCAC() }; }
}
