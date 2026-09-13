import { z } from 'zod';
import {
  BILLING_PERIOD,
  BILLING_PERIOD_VALUES,
  COUPON_DISCOUNT_TYPE,
  COUPON_DISCOUNT_TYPE_VALUES,
} from './enums';

// ─── Plan Schemas ───────────────────────────────────────────────────────────

export const BILLING_PERIODS = BILLING_PERIOD_VALUES;

export const createPlanSchema = z.object({
  name: z.string().min(2, 'Nome do plano é obrigatório'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  description: z.string().optional(),
  price: z.number().min(0, 'Preço não pode ser negativo'), // in cents
  billingPeriod: z.enum(BILLING_PERIODS).default('MONTHLY'),
  maxUsers: z.number().min(1).default(1),
  maxUnits: z.number().min(1).default(1),
  isVisible: z.boolean().default(true),
  features: z
    .array(
      z.object({
        featureKey: z.string(),
        featureLabel: z.string(),
        enabled: z.boolean().default(true),
      }),
    )
    .optional(),
});

export const updatePlanSchema = createPlanSchema.partial().omit({ slug: true });

// ─── Coupon Schemas ─────────────────────────────────────────────────────────

export const COUPON_DISCOUNT_TYPES = COUPON_DISCOUNT_TYPE_VALUES;

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Código deve conter apenas letras maiúsculas, números e hífens'),
  description: z.string().optional(),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: z.number().min(1, 'Valor do desconto deve ser maior que zero'),
  maxUses: z.number().min(1).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  planId: z.string().uuid().optional(),
});

export const updateCouponSchema = createCouponSchema.partial().omit({ code: true });

// ─── Types ──────────────────────────────────────────────────────────────────

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
