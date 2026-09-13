import { describe, it, expect } from 'vitest';
import {
  calculateRecipeCost,
  calculateCmvPercentage,
  calculateGrossMargin,
  simulateStockConsumption,
  RecipeIngredient,
} from './recipe-calculator';

describe('Recipe Calculator & CMV Engine (Restaurant Vertical)', () => {
  const sampleIngredients: RecipeIngredient[] = [
    { id: '1', name: 'Pão Brioche', quantity: 1, unit: 'un', unitCost: 1.8 },
    { id: '2', name: 'Blend Bovino 150g', quantity: 150, unit: 'g', unitCost: 28.0 }, // 0.150 * 28 = 4.20
    { id: '3', name: 'Queijo Cheddar 2 fatias', quantity: 2, unit: 'fatia', unitCost: 0.75 }, // 1.50
    { id: '4', name: 'Molho da Casa', quantity: 30, unit: 'g', unitCost: 20.0 }, // 0.030 * 20 = 0.60
    { id: '5', name: 'Embalagem Kraft', quantity: 1, unit: 'un', unitCost: 1.1 },
  ];

  it('calculates total recipe cost accurately converting grams and units', () => {
    // 1.80 + 4.20 + 1.50 + 0.60 + 1.10 = 9.20
    const cost = calculateRecipeCost(sampleIngredients);
    expect(Number(cost.toFixed(2))).toBe(9.2);
  });

  it('calculates CMV percentage correctly against retail sale price', () => {
    const cost = 9.2;
    const salePrice = 34.9;
    // (9.2 / 34.9) * 100 = 26.36% -> 26.4%
    const cmv = calculateCmvPercentage(cost, salePrice);
    expect(cmv).toBe(26.4);
  });

  it('calculates gross margin in R$ and percentage', () => {
    const cost = 9.2;
    const salePrice = 34.9;
    const margin = calculateGrossMargin(cost, salePrice);

    expect(Number(margin.amount.toFixed(2))).toBe(25.7);
    expect(margin.percentage).toBe(73.6);
  });

  it('simulates proportional fractional stock consumption for N sold portions', () => {
    const portions = 10;
    const consumption = simulateStockConsumption(sampleIngredients, portions);

    const patty = consumption.find((c) => c.name === 'Blend Bovino 150g');
    expect(patty?.consumed).toBe(1500); // 1500g consumed

    const buns = consumption.find((c) => c.name === 'Pão Brioche');
    expect(buns?.consumed).toBe(10); // 10 units consumed
  });
});
