/**
 * Modelo de Dados Polimórfico Compartilhado do Catálogo ERP
 * Suporta as 3 naturezas essenciais:
 * - SERVICO (Barbearia): duração, comissão, não baixa estoque
 * - PESAVEL / SIMPLES (Supermercado): EAN-13, peso/balança, lote e validade
 * - COMPOSTO (Restaurante): ficha técnica com baixa fracionada de ingredientes e cálculo de CMV
 */

export type ItemType = 'SIMPLES' | 'PESAVEL' | 'SERVICO' | 'COMPOSTO';

export type UnitOfMeasure = {
  id: string;
  symbol: 'un' | 'kg' | 'g' | 'L' | 'ml' | 'cx' | 'fatia';
  name: string;
  type: 'unit' | 'weight' | 'volume';
};

export interface ServiceDetail {
  durationMinutes: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number; // e.g. 50% or R$ 25,00
  allowedStaffIds?: string[]; // IDs dos barbeiros/profissionais que realizam
}

export interface BatchDetail {
  batchNumber: string;
  expirationDate: string; // ISO format: YYYY-MM-DD
  quantity: number;
  unitCostCents: number;
  supplierId?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  ingredientName: string;
  quantityRequired: number; // e.g. 150 (grams) or 1 (unit)
  unitSymbol: string; // 'g', 'ml', 'un'
  unitCostCents: number; // Custo unitário para compor o CMV
}

export interface RecipeDetail {
  servings: number; // rendimento da receita (porções)
  preparationTimeMinutes: number;
  ingredients: RecipeIngredient[];
  preparationNotes?: string;
  totalCostCents: number; // CMV calculado: soma de (quantityRequired * unitCost)
}

export interface CatalogItem {
  id: string;
  tenantId: string;
  type: ItemType;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  priceCents: number;
  costCents?: number;
  unitSymbol: string;
  categoryId: string;
  categoryName?: string;
  imageUrl?: string;
  isActive: boolean;
  stockQuantity?: number;
  minStockAlert?: number;

  // Detalhes polimórficos conforme o type
  serviceDetail?: ServiceDetail;
  batchDetail?: BatchDetail[];
  recipeDetail?: RecipeDetail;

  createdAt: string;
  updatedAt?: string;
}
