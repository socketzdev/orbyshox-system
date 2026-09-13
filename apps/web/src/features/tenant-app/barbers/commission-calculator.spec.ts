import { describe, it, expect } from 'vitest';
import {
  calculateBarberCommissions,
  CommissionItemSale,
  BarberCommissionConfig,
} from './commission-calculator';

describe('Barber Commission Calculator (Services vs Products & Fiado Rules)', () => {
  const config: BarberCommissionConfig = {
    serviceCommissionRate: 0.5, // 50% on services
    productCommissionRate: 0.15, // 15% on products (pomadas, shampoos)
    releaseCommissionOnFiadoPaidOnly: true, // only release fiado commission once settled
  };

  it('calculates distinct commission rates for services and retail products', () => {
    const sales: CommissionItemSale[] = [
      { type: 'SERVICE', amount: 50.0, isFiado: false, isFiadoPaid: false }, // Corte Degradê: R$ 25 comissão
      { type: 'SERVICE', amount: 40.0, isFiado: false, isFiadoPaid: false }, // Barba Terapia: R$ 20 comissão
      { type: 'PRODUCT', amount: 60.0, isFiado: false, isFiadoPaid: false }, // Pomada Modeladora: R$ 9 comissão (15%)
    ];

    const result = calculateBarberCommissions(sales, config);

    expect(result.serviceRevenue).toBe(90.0);
    expect(result.productRevenue).toBe(60.0);
    expect(result.totalRevenue).toBe(150.0);
    expect(result.serviceCommission).toBe(45.0);
    expect(result.productCommission).toBe(9.0);
    expect(result.totalCommissionPaid).toBe(54.0);
    expect(result.pendingFiadoCommission).toBe(0);
  });

  it('defers commission for unpaid fiado sales when policy is active', () => {
    const sales: CommissionItemSale[] = [
      { type: 'SERVICE', amount: 50.0, isFiado: false, isFiadoPaid: false }, // paid upfront: R$ 25 comissão
      { type: 'SERVICE', amount: 60.0, isFiado: true, isFiadoPaid: false }, // fiado in open: R$ 30 comissão pendente
    ];

    const result = calculateBarberCommissions(sales, config);

    expect(result.serviceCommission).toBe(25.0);
    expect(result.totalCommissionPaid).toBe(25.0);
    expect(result.pendingFiadoCommission).toBe(30.0);
  });

  it('releases fiado commission once the customer settles the debt', () => {
    const sales: CommissionItemSale[] = [
      { type: 'SERVICE', amount: 50.0, isFiado: false, isFiadoPaid: false },
      { type: 'SERVICE', amount: 60.0, isFiado: true, isFiadoPaid: true }, // settled fiado
    ];

    const result = calculateBarberCommissions(sales, config);

    expect(result.serviceCommission).toBe(55.0);
    expect(result.totalCommissionPaid).toBe(55.0);
    expect(result.pendingFiadoCommission).toBe(0);
  });
});
