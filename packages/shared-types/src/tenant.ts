import { z } from 'zod';
import { TENANT_NICHE, TENANT_NICHE_VALUES, TENANT_STATUS, TENANT_STATUS_VALUES, RESTAURANT_CATEGORY_VALUES, BARBERSHOP_CATEGORY_VALUES } from './enums';

// ─── Tenant Schemas ─────────────────────────────────────────────────────────

export const TENANT_NICHES = TENANT_NICHE_VALUES;
export const TENANT_STATUSES = TENANT_STATUS_VALUES;

export const createTenantSchema = z.object({
  companyName: z.string().min(2, 'Nome da empresa é obrigatório'),
  tradeName: z.string().optional(),
  slug: z.string().optional(),
  cnpj: z.string().optional(),
  niche: z.enum(TENANT_NICHES),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')).or(z.null()),
  phone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  logo: z.string().optional(),
  primaryColor: z.string().optional(),
  restaurantCategory: z.enum(RESTAURANT_CATEGORY_VALUES).optional(),
  barbershopCategory: z.enum(BARBERSHOP_CATEGORY_VALUES).optional(),
  tableCount: z.coerce.number().min(0).max(100).default(0).optional(),
  enableQrCode: z.boolean().default(true).optional(),
  enableTablet: z.boolean().default(true).optional(),
  enableWaiterCall: z.boolean().default(true).optional(),
  features: z.array(z.string()).optional(),
  planId: z.string().optional(),
  trialDays: z.number().min(1).max(90).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
});

export const createManagedTenantSchema = createTenantSchema.extend({
  adminName: z.string().min(2, 'Nome do administrador é obrigatório'),
  adminEmail: z.string().email('E-mail do administrador inválido'),
  adminPassword: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
});

export const updateTenantSchema = createTenantSchema.partial();

export const listTenantsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  niche: z.enum(TENANT_NICHES).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  planId: z.string().uuid().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  sortBy: z.enum(['companyName', 'createdAt', 'status', 'niche']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const suspendTenantSchema = z.object({
  reason: z.string().min(5, 'Motivo da suspensão é obrigatório (mín. 5 caracteres)'),
});

export const extendTrialSchema = z.object({
  days: z.number().min(1).max(90, 'Extensão máxima de 90 dias'),
});

export const tenantNoteSchema = z.object({
  content: z.string().min(1, 'Conteúdo da nota é obrigatório'),
});

export const tenantAccessLogSchema = z.object({
  reason: z.string().min(5, 'Motivo do acesso é obrigatório'),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateManagedTenantInput = z.infer<typeof createManagedTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
export type TenantNoteInput = z.infer<typeof tenantNoteSchema>;

// ─── Paginated Response ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
