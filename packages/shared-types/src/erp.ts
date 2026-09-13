import { z } from 'zod';

// ─── Enums & Consts ─────────────────────────────────────────────────────────

export const ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELED'] as const;
export type OrderStatusType = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'ON_CREDIT', 'VOUCHER'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHODS)[number];

export const CASH_REGISTER_STATUSES = ['OPEN', 'CLOSED'] as const;
export type CashRegisterStatusType = (typeof CASH_REGISTER_STATUSES)[number];

export const AUTOMATION_TRIGGERS = [
  'STOCK_BELOW_MIN',
  'DAILY_CLOSING',
  'APPOINTMENT_REMINDER',
  'CLIENT_INACTIVE_30D',
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGERS)[number];

// ─── Product & Category Schemas ─────────────────────────────────────────────

export const productCategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Nome da categoria é obrigatório'),
  color: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(2, 'Nome do produto é obrigatório'),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  ncm: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  salePriceCents: z.number().int().min(0, 'Preço de venda inválido'),
  costPriceCents: z.number().int().min(0).default(0),
  stockQuantity: z.number().default(0),
  minStockAlert: z.number().default(5),
  unit: z.string().default('UN'),
  cest: z.string().optional().nullable(),
  origin: z.number().int().min(0).max(8).default(0),
  csosn: z.string().optional().nullable(),
  cstIcms: z.string().optional().nullable(),
  cstPis: z.string().optional().nullable(),
  cstCofins: z.string().optional().nullable(),
  cfopDefault: z.string().optional().nullable(),
  packQuantity: z.number().positive().default(1),
  isActive: z.boolean().default(true),
  isRecipe: z.boolean().default(false),
});

export const productIngredientSchema = z.object({
  ingredientId: z.string().uuid(),
  quantityNeeded: z.number().positive('Quantidade deve ser maior que zero'),
});

export const customerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, 'Nome do cliente é obrigatório'),
  phone: z.string().optional().nullable(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  document: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  creditLimitCents: z.number().int().min(0).default(0),
  currentDebtCents: z.number().int().min(0).default(0),
  loyaltyPoints: z.number().int().min(0).default(0),
});

// ─── POS & Order Schemas ───────────────────────────────────────────────────

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().int().min(0),
});

export const createOrderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('PIX'),
  items: z.array(orderItemInputSchema).min(1, 'Adicione pelo menos um item à venda'),
  discountCents: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

// ─── Appointment Schemas (Barbearia) ────────────────────────────────────────

export const appointmentSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  serviceName: z.string().min(2, 'Nome do serviço é obrigatório'),
  priceCents: z.number().int().min(0),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().default(30),
  status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELED']).default('CONFIRMED'),
});

// ─── Cash Register ──────────────────────────────────────────────────────────

export const openCashRegisterSchema = z.object({
  initialBalanceCents: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

export const closeCashRegisterSchema = z.object({
  actualBalanceCents: z.number().int().min(0),
  notes: z.string().optional(),
});

export const createCashMovementSchema = z.object({
  type: z.enum(['SANGRIA', 'SUPRIMENTO']),
  amountCents: z.number().int().positive('Valor deve ser positivo'),
  reason: z.string().min(2, 'Informe o motivo da movimentação'),
});
export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;

export const productBarcodeSchema = z.object({
  barcode: z.string().min(3, 'Código de barras deve ter pelo menos 3 dígitos'),
  type: z.enum(['UNIT', 'PACK', 'BOX', 'DUN14']).default('UNIT'),
  multiplier: z.number().positive().default(1),
});
export type ProductBarcodeInput = z.infer<typeof productBarcodeSchema>;

// ─── Barber Commission (Barbearia) ───────────────────────────────────────────

export const BARBER_STATUS = ['ACTIVE', 'AWAY', 'VACATION'] as const;
export type BarberStatusType = (typeof BARBER_STATUS)[number];

export const FIADO_COMMISSION_RULE = ['UPON_SALE', 'UPON_PAYMENT'] as const;
export type FiadoCommissionRuleType = (typeof FIADO_COMMISSION_RULE)[number];

export const upsertBarberProfileSchema = z.object({
  nickname: z.string().trim().max(60).optional().nullable(),
  specialty: z.string().trim().max(120).optional().nullable(),
  avatarColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser um hex válido (#RRGGBB)')
    .optional(),
  serviceCommissionPct: z
    .number()
    .int('Use números inteiros')
    .min(0, 'Mínimo 0%')
    .max(100, 'Máximo 100%'),
  productCommissionPct: z
    .number()
    .int('Use números inteiros')
    .min(0, 'Mínimo 0%')
    .max(100, 'Máximo 100%'),
  commissionOnFiado: z.enum(FIADO_COMMISSION_RULE).default('UPON_PAYMENT'),
  monthlyGoalCents: z.number().int().min(0).default(0),
  workingHoursLabel: z.string().trim().max(120).optional().nullable(),
  status: z.enum(BARBER_STATUS).default('ACTIVE'),
});

export type UpsertBarberProfileInput = z.infer<typeof upsertBarberProfileSchema>;

// ─── Tenant Employee (Funcionários do Painel do Cliente) ─────────────────────

export const EMPLOYEE_ROLES = ['TENANT_ADMIN', 'TENANT_EMPLOYEE', 'STORE_MANAGER', 'CASHIER', 'STOCKIST'] as const;
export type EmployeeRoleType = (typeof EMPLOYEE_ROLES)[number];

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do funcionário'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
  role: z.enum(EMPLOYEE_ROLES).default('TENANT_EMPLOYEE'),
  phone: z.string().trim().optional(),
  position: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email('E-mail inválido').optional(),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres').optional(),
  role: z.enum(EMPLOYEE_ROLES).optional(),
  phone: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// ─── Supermarket & Retail Schemas ──────────────────────────────────────────

export const createStockLossSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive('Quantidade deve ser positiva'),
  reason: z.enum(['EXPIRED', 'DAMAGED', 'BREAKAGE', 'THEFT', 'DISCARD', 'OTHER']),
  costCents: z.number().int().min(0).default(0),
  notes: z.string().optional().nullable(),
});

export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  newQuantity: z.number().min(0, 'Estoque não pode ser negativo'),
  reason: z.string().min(2, 'Informe o motivo do ajuste'),
});

export const createBillPayableSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  description: z.string().min(2, 'Descrição é obrigatória'),
  category: z.string().default('FORNECEDOR'),
  amountCents: z.number().int().positive('Valor deve ser positivo'),
  dueDate: z.coerce.date(),
  notes: z.string().optional().nullable(),
});

export const createBillReceivableSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  description: z.string().min(2, 'Descrição é obrigatória'),
  amountCents: z.number().int().positive('Valor deve ser positivo'),
  dueDate: z.coerce.date(),
  type: z.enum(['FIADO', 'CREDIT_CARD', 'OTHER']).default('FIADO'),
  notes: z.string().optional().nullable(),
});

export const createOrderReturnSchema = z.object({
  orderId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  reason: z.string().min(3, 'Motivo da devolução é obrigatório'),
  refundMethod: z.enum(['CREDIT', 'CASH', 'PIX', 'REPLACEMENT']).default('CREDIT'),
  totalRefundCents: z.number().int().min(0),
  itemsSummary: z.string().optional().nullable(),
});

export const updateStoreSettingSchema = z.object({
  storeName: z.string().optional().nullable(),
  legalName: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  stateRegistration: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  thermalPrinter: z.enum(['58mm', '80mm', 'DISABLED']).default('80mm'),
  fiscalType: z.string().default('SIMPLES_NACIONAL'),
  nfceEnvironment: z.enum(['HOMOLOGATION', 'PRODUCTION']).default('HOMOLOGATION'),
  nfceCscId: z.string().optional().nullable(),
  nfceCscToken: z.string().optional().nullable(),
  maxCashierDiscount: z.number().int().min(0).max(100).default(10),
  managerPin: z.string().min(4).max(6).default('1234'),
  enabledPaymentMethods: z.string().default('DINHEIRO,PIX,CARTAO_DEBITO,CARTAO_CREDITO,VALE,FIADO'),
});

export const managerAuthorizeSchema = z.object({
  pin: z.string().min(4),
  action: z.string().default('AUTHORIZE'),
});

// ─── Niche Templates (Categorias e Produtos Iniciais Automáticos) ───────────

export const NICHE_DEFAULT_CATEGORIES: Record<string, Array<{ name: string; color: string }>> = {
  RESTAURANT: [
    { name: 'Pães & Salgados', color: '#f59e0b' },
    { name: 'Cafés & Bebidas', color: '#3b82f6' },
    { name: 'Doces & Confeitaria', color: '#ec4899' },
    { name: 'Lanches & Pratos', color: '#10b981' },
  ],
  BARBERSHOP: [
    { name: 'Cortes & Cabelo', color: '#6366f1' },
    { name: 'Barba & Bigode', color: '#8b5cf6' },
    { name: 'Tratamentos & Hidratação', color: '#06b6d4' },
    { name: 'Pomadas & Produtos', color: '#f97316' },
  ],
  SUPERMARKET: [
    { name: 'Hortifruti & Feira', color: '#10b981' },
    { name: 'Padaria & Confeitaria', color: '#f59e0b' },
    { name: 'Bebidas & Mercearia', color: '#3b82f6' },
    { name: 'Higiene & Limpeza', color: '#06b6d4' },
  ],
};

export const NICHE_DEFAULT_PRODUCTS: Record<string, Array<{ name: string; categoryIndex: number; priceCents: number; unit: string }>> = {
  RESTAURANT: [
    { name: 'Pão Francês (kg)', categoryIndex: 0, priceCents: 1890, unit: 'KG' },
    { name: 'Pão de Queijo Tradicional', categoryIndex: 0, priceCents: 500, unit: 'UN' },
    { name: 'Café Expresso Especial', categoryIndex: 1, priceCents: 650, unit: 'UN' },
    { name: 'Suco Natural de Laranja 400ml', categoryIndex: 1, priceCents: 1100, unit: 'UN' },
    { name: 'Bolo de Cenoura com Chocolate (fatia)', categoryIndex: 2, priceCents: 950, unit: 'UN' },
    { name: 'Misto Quente na Chapa', categoryIndex: 3, priceCents: 1400, unit: 'UN' },
  ],
  BARBERSHOP: [
    { name: 'Corte Degradê / Moderno', categoryIndex: 0, priceCents: 4500, unit: 'UN' },
    { name: 'Barba Terapia com Toalha Quente', categoryIndex: 1, priceCents: 3500, unit: 'UN' },
    { name: 'Combo Corte + Barba', categoryIndex: 0, priceCents: 7000, unit: 'UN' },
    { name: 'Pomada Modeladora Efeito Matte', categoryIndex: 3, priceCents: 4800, unit: 'UN' },
  ],
  SUPERMARKET: [
    { name: 'Banana Prata Selecionada (kg)', categoryIndex: 0, priceCents: 699, unit: 'KG' },
    { name: 'Leite Integral 1L', categoryIndex: 2, priceCents: 549, unit: 'UN' },
    { name: 'Arroz Tipo 1 - 5kg', categoryIndex: 2, priceCents: 2790, unit: 'UN' },
    { name: 'Detergente Líquido 500ml', categoryIndex: 3, priceCents: 289, unit: 'UN' },
  ],
};

// ─── Notas de Compra ─────────────────────────────────────────────────────────

export const PURCHASE_NOTE_STATUSES = ['PENDING', 'IN_PROGRESS', 'CONFIRMED', 'PARTIAL'] as const;
export type PurchaseNoteStatus = (typeof PURCHASE_NOTE_STATUSES)[number];

export const PURCHASE_NOTE_ITEM_STATUSES = ['PENDING', 'BOUGHT', 'NOT_BOUGHT'] as const;
export type PurchaseNoteItemStatus = (typeof PURCHASE_NOTE_ITEM_STATUSES)[number];

export const createPurchaseNoteItemSchema = z.object({
  itemName: z.string().min(1, 'Nome do item é obrigatório'),
  quantity: z.string().min(1, 'Quantidade é obrigatória'),
});

export const createPurchaseNoteSchema = z.object({
  title: z.string().default('Nota de Compra'),
  createdByName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(createPurchaseNoteItemSchema).min(1, 'Adicione pelo menos um item'),
});

export const updatePurchaseNoteItemSchema = z.object({
  status: z.enum(PURCHASE_NOTE_ITEM_STATUSES),
  buyerNotes: z.string().optional().nullable(),
});

export type CreatePurchaseNoteInput = z.infer<typeof createPurchaseNoteSchema>;
export type UpdatePurchaseNoteItemInput = z.infer<typeof updatePurchaseNoteItemSchema>;

