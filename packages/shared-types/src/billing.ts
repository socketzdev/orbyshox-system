import { z } from 'zod';
import {
  INVOICE_STATUS,
  INVOICE_STATUS_VALUES,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
} from './enums';

// ─── Billing Schemas ────────────────────────────────────────────────────────

export const INVOICE_STATUSES = INVOICE_STATUS_VALUES;
export const SUBSCRIPTION_STATUSES = SUBSCRIPTION_STATUS_VALUES;

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  tenantId: z.string().uuid().optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['dueDate', 'amountCents', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─── Dashboard KPI Types ────────────────────────────────────────────────────

export interface DashboardKPIs {
  mrr: number;
  mrrGrowth: number;
  activeClients: number;
  newClientsThisMonth: number;
  churnRate: number;
  arpu: number;
  ltv: number;
  cac: number;
}

export interface MrrHistoryPoint {
  month: string;
  mrr: number;
}

export interface AcquisitionPoint {
  month: string;
  newClients: number;
  canceledClients: number;
}

export interface DistributionItem {
  label: string;
  value: number;
  percentage: number;
}

export interface AlertItem {
  type: 'payment_failed' | 'delinquent' | 'ticket_overdue' | 'trial_expiring' | 'system_error';
  count: number;
  label: string;
}

export interface BillingOverview {
  totalRevenue: number;
  previousPeriodRevenue: number;
  revenueGrowth: number;
  revenueByPlan: DistributionItem[];
  revenueByNiche: DistributionItem[];
  totalAtRisk: number;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
