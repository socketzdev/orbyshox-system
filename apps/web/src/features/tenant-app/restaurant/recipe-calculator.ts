export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: 'g' | 'kg' | 'ml' | 'L' | 'un' | 'fatia';
  unitCost: number; // Cost per 1 unit (e.g. per 1 un, per 1 kg, per 1 L)
}

export interface RecipeItem {
  id: string;
  name: string;
  category: string;
  salePrice: number;
  preparationTimeMinutes: number;
  ingredients: RecipeIngredient[];
}

/**
 * Calculates the total production cost of a recipe based on ingredients and units
 */
export function calculateRecipeCost(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((total, ing) => {
    let multiplier = ing.quantity;

    // Convert grams to kg if cost is per kg
    if (ing.unit === 'g') {
      multiplier = ing.quantity / 1000;
    }
    // Convert ml to liters if cost is per liter
    else if (ing.unit === 'ml') {
      multiplier = ing.quantity / 1000;
    }

    const itemCost = multiplier * ing.unitCost;
    return total + itemCost;
  }, 0);
}

/**
 * Calculates CMV % (Custo de Mercadoria Vendida / Preço de Venda * 100)
 */
export function calculateCmvPercentage(cost: number, salePrice: number): number {
  if (salePrice <= 0) return 0;
  return Number(((cost / salePrice) * 100).toFixed(1));
}

/**
 * Calculates gross margin in R$ and %
 */
export function calculateGrossMargin(cost: number, salePrice: number): { amount: number; percentage: number } {
  const amount = Math.max(0, salePrice - cost);
  const percentage = salePrice > 0 ? Number(((amount / salePrice) * 100).toFixed(1)) : 0;
  return { amount, percentage };
}

/**
 * Simulates fractional stock reduction when N portions are produced
 */
export function simulateStockConsumption(
  ingredients: RecipeIngredient[],
  portionsSold: number
): { name: string; consumed: number; unit: string }[] {
  return ingredients.map((ing) => ({
    name: ing.name,
    consumed: Number((ing.quantity * portionsSold).toFixed(3)),
    unit: ing.unit,
  }));
}
