import { describe, it, expect } from 'vitest';

describe('KPI Formatting Logic', () => {
  const formatValue = (val: number, format: 'currency' | 'number' | 'percentage' = 'number') => {
    if (format === 'currency') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(val);
    }
    if (format === 'percentage') {
      return `${val.toFixed(2)}%`;
    }
    return new Intl.NumberFormat('pt-BR').format(val);
  };

  const calculateTrend = (value: number, previousValue?: number) => {
    if (previousValue === undefined || previousValue === 0) return null;
    const difference = value - previousValue;
    const percentage = (difference / previousValue) * 100;
    return {
      percentage: Math.abs(percentage).toFixed(1),
      isPositive: percentage > 0,
      isNegative: percentage < 0,
    };
  };

  it('should format currency correctly in Brazilian Real (BRL)', () => {
    const formatted = formatValue(12500.5, 'currency');
    const clean = formatted.replace(/\u00a0/g, ' ');
    expect(clean).toContain('R$');
    expect(clean).toContain('12.500,50');
  });

  it('should format percentage with two decimal places', () => {
    expect(formatValue(4.856, 'percentage')).toBe('4.86%');
    expect(formatValue(12, 'percentage')).toBe('12.00%');
  });

  it('should calculate positive MoM trend', () => {
    const trend = calculateTrend(120, 100);
    expect(trend).toEqual({
      percentage: '20.0',
      isPositive: true,
      isNegative: false,
    });
  });

  it('should calculate negative MoM trend', () => {
    const trend = calculateTrend(85, 100);
    expect(trend).toEqual({
      percentage: '15.0',
      isNegative: true,
      isPositive: false,
    });
  });

  it('should return null when previousValue is 0 or undefined', () => {
    expect(calculateTrend(100, 0)).toBeNull();
    expect(calculateTrend(100, undefined)).toBeNull();
  });
});
