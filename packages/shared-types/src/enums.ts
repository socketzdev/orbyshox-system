// ─── Tenant Enums ───────────────────────────────────────────────────────────

export const TENANT_STATUS = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
} as const;
export type TenantStatus = (typeof TENANT_STATUS)[keyof typeof TENANT_STATUS];

export const TENANT_STATUS_VALUES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED'] as const;

export const TENANT_NICHE = {
  RESTAURANT: 'RESTAURANT',
  BARBERSHOP: 'BARBERSHOP',
  SUPERMARKET: 'SUPERMARKET',
  UNIVERSAL: 'UNIVERSAL',
} as const;
export type TenantNiche = (typeof TENANT_NICHE)[keyof typeof TENANT_NICHE];

export const TENANT_NICHE_VALUES = ['RESTAURANT', 'BARBERSHOP', 'SUPERMARKET', 'UNIVERSAL'] as const;

// ─── Sub-templates da Barbearia ──────────────────────────────────────────
// Barbearia usa o template nativo (estrutura intocada); os demais adaptam
// módulos existentes (agenda, equipe, finanças, estoque, tarefas).
// ACADEMIA é a vertical de gestão fitness (alunos, matrículas, check-in,
// treinos, aulas coletivas) com dados próprios.
export const BARBERSHOP_CATEGORY_VALUES = [
  'BARBEARIA',
  'SALAO_FEMININO',
  'REFRIGERACAO',
  'GRAFICA',
  'INTERNET',
  'LOJA_ROUPA',
  'ACADEMIA',
] as const;
export type BarbershopCategory = (typeof BARBERSHOP_CATEGORY_VALUES)[number];

// ─── User Roles ─────────────────────────────────────────────────────────────

export const USER_ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUPPORT_MANAGER: 'SUPPORT_MANAGER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  FINANCE: 'FINANCE',
  DEV: 'DEV',
  TENANT_ADMIN: 'TENANT_ADMIN',
  TENANT_EMPLOYEE: 'TENANT_EMPLOYEE',
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const USER_ROLE_VALUES = [
  'SUPER_ADMIN',
  'SUPPORT_MANAGER',
  'SUPPORT_AGENT',
  'FINANCE',
  'DEV',
  'TENANT_ADMIN',
  'TENANT_EMPLOYEE',
] as const;

export const STAFF_ROLES_VALUES = [
  'SUPER_ADMIN',
  'SUPPORT_MANAGER',
  'SUPPORT_AGENT',
  'FINANCE',
  'DEV',
] as const;

// ─── Subscription & Invoice ─────────────────────────────────────────────────

export const SUBSCRIPTION_STATUS = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  UNPAID: 'UNPAID',
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export const SUBSCRIPTION_STATUS_VALUES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID'] as const;

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELED: 'CANCELED',
  REFUNDED: 'REFUNDED',
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_VALUES = ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELED', 'REFUNDED'] as const;

export const COUPON_DISCOUNT_TYPE = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPE)[keyof typeof COUPON_DISCOUNT_TYPE];

export const COUPON_DISCOUNT_TYPE_VALUES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const;

export const BILLING_PERIOD = {
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
} as const;
export type BillingPeriod = (typeof BILLING_PERIOD)[keyof typeof BILLING_PERIOD];

export const BILLING_PERIOD_VALUES = ['MONTHLY', 'YEARLY'] as const;

// ─── Tickets ────────────────────────────────────────────────────────────────

export const TICKET_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_CUSTOMER: 'WAITING_CUSTOMER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const TICKET_STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;

export const TICKET_PRIORITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type TicketPriority = (typeof TICKET_PRIORITY)[keyof typeof TICKET_PRIORITY];

export const TICKET_PRIORITY_VALUES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export const TICKET_CATEGORY = {
  FINANCIAL: 'FINANCIAL',
  TECHNICAL: 'TECHNICAL',
  USAGE_QUESTION: 'USAGE_QUESTION',
  FEATURE_REQUEST: 'FEATURE_REQUEST',
  OTHER: 'OTHER',
} as const;
export type TicketCategory = (typeof TICKET_CATEGORY)[keyof typeof TICKET_CATEGORY];

export const TICKET_CATEGORY_VALUES = [
  'FINANCIAL',
  'TECHNICAL',
  'USAGE_QUESTION',
  'FEATURE_REQUEST',
  'OTHER',
] as const;

// ─── ERP ────────────────────────────────────────────────────────────────────

export const PRODUCT_UNIT = {
  UN: 'UN',
  KG: 'KG',
  L: 'L',
  M: 'M',
  CX: 'CX',
} as const;
export type ProductUnit = (typeof PRODUCT_UNIT)[keyof typeof PRODUCT_UNIT];

export const PRODUCT_UNIT_VALUES = ['UN', 'KG', 'L', 'M', 'CX'] as const;

export const CASH_REGISTER_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type CashRegisterStatus = (typeof CASH_REGISTER_STATUS)[keyof typeof CASH_REGISTER_STATUS];

export const CASH_REGISTER_STATUS_VALUES = ['OPEN', 'CLOSED'] as const;

export const AUTOMATION_TRIGGER = {
  STOCK_BELOW_MIN: 'STOCK_BELOW_MIN',
  DAILY_CLOSING: 'DAILY_CLOSING',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  CLIENT_INACTIVE_30D: 'CLIENT_INACTIVE_30D',
} as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGER)[keyof typeof AUTOMATION_TRIGGER];

export const AUTOMATION_TRIGGER_VALUES = [
  'STOCK_BELOW_MIN',
  'DAILY_CLOSING',
  'APPOINTMENT_REMINDER',
  'CLIENT_INACTIVE_30D',
] as const;

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_VALUES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELED'] as const;

export const PAYMENT_METHOD = {
  CASH: 'CASH',
  PIX: 'PIX',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  ON_CREDIT: 'ON_CREDIT',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_METHOD_VALUES = ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'ON_CREDIT'] as const;

export const APPOINTMENT_STATUS = {
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
} as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

export const APPOINTMENT_STATUS_VALUES = ['CONFIRMED', 'COMPLETED', 'CANCELED'] as const;

// ─── Audit Actions ──────────────────────────────────────────────────────────

export const AUDIT_ACTION = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  TENANT_CREATE: 'TENANT_CREATE',
  TENANT_UPDATE: 'TENANT_UPDATE',
  TENANT_SUSPEND: 'TENANT_SUSPEND',
  TENANT_REACTIVATE: 'TENANT_REACTIVATE',
  TENANT_CANCEL: 'TENANT_CANCEL',
  TENANT_VIEW_AS: 'TENANT_VIEW_AS',
  TENANT_NOTE_CREATE: 'TENANT_NOTE_CREATE',
  PLAN_CREATE: 'PLAN_CREATE',
  PLAN_UPDATE: 'PLAN_UPDATE',
  PLAN_ARCHIVE: 'PLAN_ARCHIVE',
  PRICE_CHANGE: 'PRICE_CHANGE',
  SUBSCRIPTION_CHANGE: 'SUBSCRIPTION_CHANGE',
  COUPON_CREATE: 'COUPON_CREATE',
  COUPON_UPDATE: 'COUPON_UPDATE',
  STAFF_CREATE: 'STAFF_CREATE',
  STAFF_UPDATE: 'STAFF_UPDATE',
  STAFF_DEACTIVATE: 'STAFF_DEACTIVATE',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  TRIAL_EXTEND: 'TRIAL_EXTEND',
  MANUAL_PAYMENT: 'MANUAL_PAYMENT',
  TICKET_ASSIGN: 'TICKET_ASSIGN',
  TICKET_ESCALATE: 'TICKET_ESCALATE',
  TICKET_CREATE: 'TICKET_CREATE',
  TICKET_STATUS_CHANGE: 'TICKET_STATUS_CHANGE',
  TICKET_MESSAGE_INTERNAL: 'TICKET_MESSAGE_INTERNAL',
  TICKET_AUTO_ASSIGN: 'TICKET_AUTO_ASSIGN',
  TICKET_SLA_WARNING: 'TICKET_SLA_WARNING',
  TICKET_SLA_BREACH: 'TICKET_SLA_BREACH',
  TICKET_RESOLVED: 'TICKET_RESOLVED',
  TICKET_CLOSED: 'TICKET_CLOSED',
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_ACTION_VALUES = [
  'LOGIN',
  'LOGOUT',
  'TENANT_CREATE',
  'TENANT_UPDATE',
  'TENANT_SUSPEND',
  'TENANT_REACTIVATE',
  'TENANT_CANCEL',
  'TENANT_VIEW_AS',
  'TENANT_NOTE_CREATE',
  'PLAN_CREATE',
  'PLAN_UPDATE',
  'PLAN_ARCHIVE',
  'PRICE_CHANGE',
  'SUBSCRIPTION_CHANGE',
  'COUPON_CREATE',
  'COUPON_UPDATE',
  'STAFF_CREATE',
  'STAFF_UPDATE',
  'STAFF_DEACTIVATE',
  'SETTINGS_UPDATE',
  'TRIAL_EXTEND',
  'MANUAL_PAYMENT',
  'TICKET_ASSIGN',
  'TICKET_ESCALATE',
  'TICKET_CREATE',
  'TICKET_STATUS_CHANGE',
  'TICKET_MESSAGE_INTERNAL',
  'TICKET_AUTO_ASSIGN',
  'TICKET_SLA_WARNING',
  'TICKET_SLA_BREACH',
  'TICKET_RESOLVED',
  'TICKET_CLOSED',
] as const;

// ─── Setting Keys ───────────────────────────────────────────────────────────

export const SETTING_KEY = {
  TRIAL_DURATION_DAYS: 'TRIAL_DURATION_DAYS',
  TRIAL_REQUIRE_CARD: 'TRIAL_REQUIRE_CARD',
  DEFAULT_CURRENCY: 'DEFAULT_CURRENCY',
  DELINQUENCY_SUSPEND_DAYS: 'DELINQUENCY_SUSPEND_DAYS',
  DELINQUENCY_CANCEL_DAYS: 'DELINQUENCY_CANCEL_DAYS',
  DELINQUENCY_CONFIG: 'DELINQUENCY_CONFIG',
  TRIAL_COMMUNICATION_CONFIG: 'TRIAL_COMMUNICATION_CONFIG',
  STRIPE_PUBLISHABLE_KEY: 'STRIPE_PUBLISHABLE_KEY',
  RESEND_API_KEY: 'RESEND_API_KEY',
  STRIPE_WEBHOOK_SECRET: 'STRIPE_WEBHOOK_SECRET',
} as const;
export type SettingKey = (typeof SETTING_KEY)[keyof typeof SETTING_KEY];

export const SETTING_KEY_VALUES = [
  'TRIAL_DURATION_DAYS',
  'TRIAL_REQUIRE_CARD',
  'DEFAULT_CURRENCY',
  'DELINQUENCY_SUSPEND_DAYS',
  'DELINQUENCY_CANCEL_DAYS',
  'DELINQUENCY_CONFIG',
  'TRIAL_COMMUNICATION_CONFIG',
  'STRIPE_PUBLISHABLE_KEY',
  'RESEND_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

// ─── Restaurant OS Enums ───────────────────────────────────────────────────

export const RESTAURANT_CATEGORY = {
  BURGER_HOUSE: 'BURGER_HOUSE',
  PIZZERIA: 'PIZZERIA',
  RESTAURANT: 'RESTAURANT',
  BAR: 'BAR',
  COFFEE_SHOP: 'COFFEE_SHOP',
  JAPANESE: 'JAPANESE',
  PASTRY: 'PASTRY',
} as const;
export type RestaurantCategory = (typeof RESTAURANT_CATEGORY)[keyof typeof RESTAURANT_CATEGORY];
export const RESTAURANT_CATEGORY_VALUES = [
  'BURGER_HOUSE',
  'PIZZERIA',
  'RESTAURANT',
  'BAR',
  'COFFEE_SHOP',
  'JAPANESE',
  'PASTRY',
] as const;

export const TABLE_STATUS = {
  FREE: 'FREE',
  OCCUPIED: 'OCCUPIED',
} as const;
export type TableStatus = (typeof TABLE_STATUS)[keyof typeof TABLE_STATUS];
export const TABLE_STATUS_VALUES = ['FREE', 'OCCUPIED'] as const;

export const DEVICE_TYPE = {
  TABLET: 'TABLET',
  KDS: 'KDS',
  WAITER: 'WAITER',
  POS: 'POS',
} as const;
export type DeviceType = (typeof DEVICE_TYPE)[keyof typeof DEVICE_TYPE];
export const DEVICE_TYPE_VALUES = ['TABLET', 'KDS', 'WAITER', 'POS'] as const;

export const DEVICE_STATUS = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;
export type DeviceStatus = (typeof DEVICE_STATUS)[keyof typeof DEVICE_STATUS];
export const DEVICE_STATUS_VALUES = ['ACTIVE', 'REVOKED'] as const;

export const TABLE_SESSION_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type TableSessionStatus = (typeof TABLE_SESSION_STATUS)[keyof typeof TABLE_SESSION_STATUS];
export const TABLE_SESSION_STATUS_VALUES = ['OPEN', 'CLOSED'] as const;

export const RESTAURANT_ORDER_STATUS = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type RestaurantOrderStatus = (typeof RESTAURANT_ORDER_STATUS)[keyof typeof RESTAURANT_ORDER_STATUS];
export const RESTAURANT_ORDER_STATUS_VALUES = [
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;

export const ORDER_ORIGIN = {
  TABLET: 'TABLET',
  QR_CODE: 'QR_CODE',
  WAITER: 'WAITER',
  POS: 'POS',
} as const;
export type OrderOrigin = (typeof ORDER_ORIGIN)[keyof typeof ORDER_ORIGIN];
export const ORDER_ORIGIN_VALUES = ['TABLET', 'QR_CODE', 'WAITER', 'POS'] as const;

export const WAITER_CALL_TYPE = {
  ASSISTANCE: 'ASSISTANCE',
  BILL: 'BILL',
} as const;
export type WaiterCallType = (typeof WAITER_CALL_TYPE)[keyof typeof WAITER_CALL_TYPE];
export const WAITER_CALL_TYPE_VALUES = ['ASSISTANCE', 'BILL'] as const;

export const WAITER_CALL_STATUS = {
  PENDING: 'PENDING',
  ANSWERED: 'ANSWERED',
} as const;
export type WaiterCallStatus = (typeof WAITER_CALL_STATUS)[keyof typeof WAITER_CALL_STATUS];
export const WAITER_CALL_STATUS_VALUES = ['PENDING', 'ANSWERED'] as const;
