// ─── Barber Commission Calculator ───────────────────────────────────────────
// Pure function used by both backend (tenant-app.service) and frontend
// (barbers-team-page) to compute commission payouts.

export interface CommissionItemSale {
  type: 'SERVICE' | 'PRODUCT';
  amount: number;
  isFiado: boolean;
  isFiadoPaid: boolean;
}

export interface BarberCommissionConfig {
  serviceCommissionRate: number;
  productCommissionRate: number;
  releaseCommissionOnFiadoPaidOnly: boolean;
}

export interface CommissionCalculationResult {
  serviceRevenue: number;
  productRevenue: number;
  totalRevenue: number;
  serviceCommission: number;
  productCommission: number;
  totalCommissionPaid: number;
  pendingFiadoCommission: number;
}

export function calculateBarberCommissions(
  sales: CommissionItemSale[],
  config: BarberCommissionConfig,
): CommissionCalculationResult {
  let serviceRevenue = 0;
  let productRevenue = 0;
  let serviceCommission = 0;
  let productCommission = 0;
  let pendingFiadoCommission = 0;

  for (const sale of sales) {
    const isService = sale.type === 'SERVICE';
    const rate = isService ? config.serviceCommissionRate : config.productCommissionRate;

    if (isService) {
      serviceRevenue += sale.amount;
    } else {
      productRevenue += sale.amount;
    }

    const calculatedComm = sale.amount * rate;

    if (sale.isFiado && !sale.isFiadoPaid && config.releaseCommissionOnFiadoPaidOnly) {
      pendingFiadoCommission += calculatedComm;
    } else if (isService) {
      serviceCommission += calculatedComm;
    } else {
      productCommission += calculatedComm;
    }
  }

  return {
    serviceRevenue: Number(serviceRevenue.toFixed(2)),
    productRevenue: Number(productRevenue.toFixed(2)),
    totalRevenue: Number((serviceRevenue + productRevenue).toFixed(2)),
    serviceCommission: Number(serviceCommission.toFixed(2)),
    productCommission: Number(productCommission.toFixed(2)),
    totalCommissionPaid: Number((serviceCommission + productCommission).toFixed(2)),
    pendingFiadoCommission: Number(pendingFiadoCommission.toFixed(2)),
  };
}
