import { z } from 'zod';
import {
  AUDIT_ACTION_VALUES,
  TICKET_CATEGORY,
  TICKET_CATEGORY_VALUES,
  TICKET_PRIORITY,
  TICKET_PRIORITY_VALUES,
  TICKET_STATUS,
  TICKET_STATUS_VALUES,
  USER_ROLE,
  USER_ROLE_VALUES,
} from './enums';

const STAFF_ROLES_TUPLE = [
  USER_ROLE.SUPER_ADMIN,
  USER_ROLE.SUPPORT_MANAGER,
  USER_ROLE.SUPPORT_AGENT,
  USER_ROLE.FINANCE,
  USER_ROLE.DEV,
] as const;

// ─── Ticket Schemas ─────────────────────────────────────────────────────────

export const TICKET_CATEGORIES = TICKET_CATEGORY_VALUES;
export const TICKET_PRIORITIES = TICKET_PRIORITY_VALUES;
export const TICKET_STATUSES = TICKET_STATUS_VALUES;
export const TICKET_SORT_FIELDS = ['createdAt', 'priority', 'status', 'slaDeadline', 'updatedAt'] as const;

export const createTicketSchema = z.object({
  tenantId: z.string().uuid().optional(),
  subject: z.string().min(5, 'Assunto é obrigatório (mín. 5 caracteres)'),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES).default('MEDIUM'),
  message: z.string().min(10, 'Mensagem é obrigatória (mín. 10 caracteres)'),
});

export const updateTicketSchema = z.object({
  assignedToId: z.string().uuid().nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  reason: z.string().max(280).optional(),
});

export const ticketMessageSchema = z.object({
  content: z.string().min(1, 'Mensagem não pode estar vazia'),
  isInternal: z.boolean().default(false),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  limit: z.coerce.number().min(1).max(100).optional(),
  tenantId: z.string().uuid().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(TICKET_SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─── Staff Schemas ──────────────────────────────────────────────────────────

export const USER_ROLES = USER_ROLE_VALUES;

export const createStaffSchema = z.object({
  email: z.string().email('E-mail inválido'),
  name: z.string().min(2, 'Nome é obrigatório'),
  role: z.enum(STAFF_ROLES_TUPLE),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

export const updateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(STAFF_ROLES_TUPLE).optional(),
  isActive: z.boolean().optional(),
});

// ─── Audit Schemas ──────────────────────────────────────────────────────────

export const AUDIT_ACTIONS = AUDIT_ACTION_VALUES;

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  userId: z.string().uuid().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.string().optional(),
  targetId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

// ─── Settings Schemas ───────────────────────────────────────────────────────

export const updateSettingSchema = z.object({
  value: z.any(),
});

// ─── Knowledge Article Schemas ──────────────────────────────────────────────

export const createArticleSchema = z.object({
  title: z.string().min(3, 'Título é obrigatório'),
  content: z.string().min(10, 'Conteúdo é obrigatório'),
  category: z.string().min(2, 'Categoria é obrigatória'),
  isPublished: z.boolean().default(false),
});

export const updateArticleSchema = createArticleSchema.partial();

// ─── Types ──────────────────────────────────────────────────────────────────

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

// ─── SLA Configuration ─────────────────────────────────────────────────────

export const SLA_RESPONSE_TIMES: Record<string, number> = {
  CRITICAL: 30,
  HIGH: 120,
  MEDIUM: 480,
  LOW: 2880,
};

export const SLA_WARNING_RATIO = 0.75;

export interface TicketSummary {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  tenantId: string;
  tenant?: { companyName: string } | null;
  assignee?: { id: string; name: string } | null;
  slaDeadline?: string | null;
  firstResponseAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt?: string | null;
  slaState: 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
}
