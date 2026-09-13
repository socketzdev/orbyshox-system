import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/app-layout';
import { TenantProvider } from '../features/tenant-app/context/tenant-context';
import { NotFoundPage } from '../components/not-found';

// Super Admin Pages
const LoginPage = React.lazy(() => import('../features/auth/login-page').then(m => ({ default: m.LoginPage })));
const DashboardPage = React.lazy(() => import('../features/dashboard/dashboard-page').then(m => ({ default: m.DashboardPage })));
const TenantListPage = React.lazy(() => import('../features/tenants/tenant-list-page').then(m => ({ default: m.TenantListPage })));
const TenantDetailPage = React.lazy(() => import('../features/tenants/tenant-detail-page').then(m => ({ default: m.TenantDetailPage })));
const PlanListPage = React.lazy(() => import('../features/plans/plan-list-page').then(m => ({ default: m.PlanListPage })));
const PlanFormPage = React.lazy(() => import('../features/plans/plan-form-page').then(m => ({ default: m.PlanFormPage })));
const CouponListPage = React.lazy(() => import('../features/plans/coupon-list-page').then(m => ({ default: m.CouponListPage })));
const CouponFormPage = React.lazy(() => import('../features/plans/coupon-form-page').then(m => ({ default: m.CouponFormPage })));
const BillingOverviewPage = React.lazy(() => import('../features/billing/billing-overview-page').then(m => ({ default: m.BillingOverviewPage })));
const InvoiceListPage = React.lazy(() => import('../features/billing/invoice-list-page').then(m => ({ default: m.InvoiceListPage })));
const DelinquencyPage = React.lazy(() => import('../features/billing/delinquency-page').then(m => ({ default: m.DelinquencyPage })));
const RevenueProjectionPage = React.lazy(() => import('../features/billing/revenue-projection-page').then(m => ({ default: m.RevenueProjectionPage })));
const TicketListPage = React.lazy(() => import('../features/tickets/ticket-list-page').then(m => ({ default: m.TicketListPage })));
const TicketDetailPage = React.lazy(() => import('../features/tickets/ticket-detail-page').then(m => ({ default: m.TicketDetailPage })));
const KnowledgeListPage = React.lazy(() => import('../features/knowledge/knowledge-list-page').then(m => ({ default: m.KnowledgeListPage })));
const KnowledgeEditorPage = React.lazy(() => import('../features/knowledge/knowledge-editor-page').then(m => ({ default: m.KnowledgeEditorPage })));
const StaffListPage = React.lazy(() => import('../features/staff/staff-list-page').then(m => ({ default: m.StaffListPage })));
const StaffFormPage = React.lazy(() => import('../features/staff/staff-form-page').then(m => ({ default: m.StaffFormPage })));
const SettingsPage = React.lazy(() => import('../features/settings/settings-page').then(m => ({ default: m.SettingsPage })));
const DelinquencySettingsPage = React.lazy(() => import('../features/settings/delinquency-settings-page').then(m => ({ default: m.DelinquencySettingsPage })));
const TrialSettingsPage = React.lazy(() => import('../features/settings/trial-settings-page').then(m => ({ default: m.TrialSettingsPage })));
const EmailTemplatesPage = React.lazy(() => import('../features/settings/email-templates-page').then(m => ({ default: m.EmailTemplatesPage })));
const IntegrationsPage = React.lazy(() => import('../features/settings/integrations-page').then(m => ({ default: m.IntegrationsPage })));
const AuditLogPage = React.lazy(() => import('../features/audit/audit-log-page').then(m => ({ default: m.AuditLogPage })));
const TenantSiteBuilderPage = React.lazy(() => import('../features/client-sites/tenant-site-builder-page').then(m => ({ default: m.TenantSiteBuilderPage })));
const PublicSitePage = React.lazy(() => import('../features/client-sites/public-site-page').then(m => ({ default: m.PublicSitePage })));
const NotificationsPage = React.lazy(() => import('../features/notifications/notifications-page').then(m => ({ default: m.NotificationsPage })));

// Tenant ERP Pages (Painel do Cliente)
const TenantLoginPage = React.lazy(() => import('../features/tenant-app/auth/tenant-login-page').then(m => ({ default: m.TenantLoginPage })));
const TenantLayout = React.lazy(() => import('../features/tenant-app/layout/tenant-layout').then(m => ({ default: m.TenantLayout })));
const TenantDashboardPage = React.lazy(() => import('../features/tenant-app/dashboard/tenant-dashboard-page').then(m => ({ default: m.TenantDashboardPage })));
const PosTerminalPage = React.lazy(() => import('../features/tenant-app/pos/pos-terminal-page').then(m => ({ default: m.PosTerminalPage })));
const ProductListPage = React.lazy(() => import('../features/tenant-app/catalog/product-list-page').then(m => ({ default: m.ProductListPage })));
const OrdersKanbanPage = React.lazy(() => import('../features/tenant-app/orders/orders-kanban-page').then(m => ({ default: m.OrdersKanbanPage })));
const CustomerCrmPage = React.lazy(() => import('../features/tenant-app/customers/customer-crm-page').then(m => ({ default: m.CustomerCrmPage })));
const CashRegisterPage = React.lazy(() => import('../features/tenant-app/finance/cash-register-page').then(m => ({ default: m.CashRegisterPage })));
const AutomationsCenterPage = React.lazy(() => import('../features/tenant-app/automations/automations-center-page').then(m => ({ default: m.AutomationsCenterPage })));
const AppointmentsPage = React.lazy(() => import('../features/tenant-app/appointments/appointments-page').then(m => ({ default: m.AppointmentsPage })));
const PublicBookingPage = React.lazy(() => import('../features/tenant-app/appointments/public-booking-page').then(m => ({ default: m.PublicBookingPage })));
const BarbersTeamPage = React.lazy(() => import('../features/tenant-app/barbers/barbers-team-page').then(m => ({ default: m.BarbersTeamPage })));
const RestaurantTablesPage = React.lazy(() => import('../features/tenant-app/restaurant/restaurant-tables-page').then(m => ({ default: m.RestaurantTablesPage })));
const KitchenKdsPage = React.lazy(() => import('../features/tenant-app/restaurant/kitchen-kds-page').then(m => ({ default: m.KitchenKdsPage })));
const WaiterHubPage = React.lazy(() => import('../features/tenant-app/waiter/waiter-hub-page').then(m => ({ default: m.WaiterHubPage })));
const TabletMenuPage = React.lazy(() => import('../features/tenant-app/self-order/tablet-menu-page').then(m => ({ default: m.TabletMenuPage })));
const RecipeBookPage = React.lazy(() => import('../features/tenant-app/restaurant/recipe-book-page').then(m => ({ default: m.RecipeBookPage })));
const PurchaseNotesPage = React.lazy(() => import('../features/tenant-app/purchase-notes/purchase-notes-page').then(m => ({ default: m.PurchaseNotesPage })));
const SupermarketPosPage = React.lazy(() => import('../features/tenant-app/supermarket/supermarket-pos-page').then(m => ({ default: m.SupermarketPosPage })));
const StockBatchesPage = React.lazy(() => import('../features/tenant-app/supermarket/stock-batches-page').then(m => ({ default: m.StockBatchesPage })));
const XmlImportPage = React.lazy(() => import('../features/tenant-app/supermarket/xml-import-page').then(m => ({ default: m.XmlImportPage })));
const MarketplaceHomePage = React.lazy(() => import('../features/tenant-app/marketplace/marketplace-home-page').then(m => ({ default: m.MarketplaceHomePage })));
const SuppliersListPage = React.lazy(() => import('../features/tenant-app/marketplace/suppliers-list-page').then(m => ({ default: m.SuppliersListPage })));
const SupplierDetailPage = React.lazy(() => import('../features/tenant-app/marketplace/supplier-detail-page').then(m => ({ default: m.SupplierDetailPage })));
const NfeListPage = React.lazy(() => import('../features/tenant-app/marketplace/nfe-list-page').then(m => ({ default: m.NfeListPage })));
const BatchesListPage = React.lazy(() => import('../features/tenant-app/marketplace/batches-list-page').then(m => ({ default: m.BatchesListPage })));
const PurchaseOrdersListPage = React.lazy(() => import('../features/tenant-app/marketplace/purchase-orders-list-page').then(m => ({ default: m.PurchaseOrdersListPage })));
const PurchaseOrderWizardPage = React.lazy(() => import('../features/tenant-app/marketplace/purchase-order-wizard-page').then(m => ({ default: m.PurchaseOrderWizardPage })));
const PurchaseOrderDetailPage = React.lazy(() => import('../features/tenant-app/marketplace/purchase-order-detail-page').then(m => ({ default: m.PurchaseOrderDetailPage })));
const TeamListPage = React.lazy(() => import('../features/tenant-app/team/team-list-page').then(m => ({ default: m.TeamListPage })));
const TeamFormPage = React.lazy(() => import('../features/tenant-app/team/team-form-page').then(m => ({ default: m.TeamFormPage })));
const ReturnsPage = React.lazy(() => import('../features/tenant-app/supermarket/returns-page').then(m => ({ default: m.ReturnsPage })));
const StockOverviewPage = React.lazy(() => import('../features/tenant-app/supermarket/stock-overview-page').then(m => ({ default: m.StockOverviewPage })));
const InventoryPage = React.lazy(() => import('../features/tenant-app/supermarket/inventory-page').then(m => ({ default: m.InventoryPage })));
const LossesPage = React.lazy(() => import('../features/tenant-app/supermarket/losses-page').then(m => ({ default: m.LossesPage })));
const BillsPayablePage = React.lazy(() => import('../features/tenant-app/finance/bills-payable-page').then(m => ({ default: m.BillsPayablePage })));
const BillsReceivablePage = React.lazy(() => import('../features/tenant-app/finance/bills-receivable-page').then(m => ({ default: m.BillsReceivablePage })));
const ReportsPage = React.lazy(() => import('../features/tenant-app/reports/reports-page').then(m => ({ default: m.ReportsPage })));
const StoreSettingsPage = React.lazy(() => import('../features/tenant-app/settings/store-settings-page').then(m => ({ default: m.StoreSettingsPage })));

function RouteLoadingFallback() {
  return (
    <div className="w-full py-16 flex flex-col items-center justify-center space-y-3">
      <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-200 rounded-full animate-spin" />
      <span className="text-[11px] font-mono text-zinc-500 tracking-wider">Carregando módulo...</span>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* ─── Super Admin Auth ─── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ─── Rota Pública de Autoatendimento do Restaurante (Zero-Trust via Token) ─── */}
        <Route path="/q/:tableToken" element={<TabletMenuPage mode="qr" />} />
        <Route path="/tablet/:deviceToken" element={<TabletMenuPage mode="tablet" />} />

        {/* ─── Rota Pública de Agendamento Online da Barbearia / Empresa ─── */}
        <Route path="/:slug/agendar" element={<PublicBookingPage />} />

        {/* ─── Universal Tenant App (Sem slug na URL) ─── */}
        <Route path="/app/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <TenantProvider>
              <TenantLayout />
            </TenantProvider>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<TenantDashboardPage />} />
          <Route path="pos" element={<PosTerminalPage />} />
          <Route path="products" element={<ProductListPage />} />
          <Route path="orders" element={<OrdersKanbanPage />} />
          <Route path="customers" element={<CustomerCrmPage />} />
          <Route path="finance" element={<CashRegisterPage />} />
          <Route path="automations" element={<AutomationsCenterPage />} />
          {/* Barbearia */}
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="barbers" element={<BarbersTeamPage />} />
          {/* Restaurante */}
          <Route path="tables" element={<RestaurantTablesPage />} />
          <Route path="kds" element={<KitchenKdsPage />} />
          <Route path="waiter" element={<WaiterHubPage />} />
          <Route path="recipes" element={<RecipeBookPage />} />
          <Route path="purchase-notes" element={<PurchaseNotesPage />} />
          {/* Supermercado */}
          <Route path="supermarket-pos" element={<SupermarketPosPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="stock" element={<StockOverviewPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="losses" element={<LossesPage />} />
          <Route path="stock-batches" element={<StockBatchesPage />} />
          <Route path="xml-import" element={<XmlImportPage />} />
          <Route path="finance/payables" element={<BillsPayablePage />} />
          <Route path="finance/receivables" element={<BillsReceivablePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<StoreSettingsPage />} />
          {/* Marketplace */}
          <Route path="marketplace">
            <Route index element={<MarketplaceHomePage />} />
            <Route path="suppliers" element={<SuppliersListPage />} />
            <Route path="suppliers/:supplierId" element={<SupplierDetailPage />} />
            <Route path="nfe" element={<NfeListPage />} />
            <Route path="batches" element={<BatchesListPage />} />
            <Route path="purchase-orders" element={<PurchaseOrdersListPage />} />
            <Route path="purchase-orders/new" element={<PurchaseOrderWizardPage />} />
            <Route path="purchase-orders/:orderId" element={<PurchaseOrderDetailPage />} />
          </Route>
          {/* Funcionários (Equipe do Painel) */}
          <Route path="team" element={<TeamListPage />} />
          <Route path="team/new" element={<TeamFormPage />} />
          <Route path="team/:id/edit" element={<TeamFormPage />} />
        </Route>

        {/* ─── Redirecionamentos de Compatibilidade (Sem Slug na Web) ─── */}
        <Route path="/:slug/login" element={<Navigate to="/app/login" replace />} />
        <Route path="/:slug/app/*" element={<Navigate to="/app/dashboard" replace />} />

        {/* ─── Super Admin App ─── */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Tenants */}
          <Route path="tenants" element={<TenantListPage />} />
          <Route path="tenants/:id" element={<TenantDetailPage />} />
          <Route path="tenants/:id/site" element={<TenantSiteBuilderPage />} />

          {/* Plans */}
          <Route path="plans" element={<PlanListPage />} />
          <Route path="plans/new" element={<PlanFormPage />} />
          <Route path="plans/:id/edit" element={<PlanFormPage />} />
          <Route path="coupons" element={<CouponListPage />} />
          <Route path="coupons/new" element={<CouponFormPage />} />

          {/* Billing */}
          <Route path="billing" element={<BillingOverviewPage />} />
          <Route path="billing/invoices" element={<InvoiceListPage />} />
          <Route path="billing/delinquency" element={<DelinquencyPage />} />
          <Route path="billing/projection" element={<RevenueProjectionPage />} />

          {/* Support */}
          <Route path="tickets" element={<TicketListPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="knowledge" element={<KnowledgeListPage />} />
          <Route path="knowledge/new" element={<KnowledgeEditorPage />} />
          <Route path="knowledge/:id/edit" element={<KnowledgeEditorPage />} />

          {/* Staff */}
          <Route path="staff" element={<StaffListPage />} />
          <Route path="staff/:id/edit" element={<StaffFormPage />} />

          {/* Settings */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/delinquency" element={<DelinquencySettingsPage />} />
          <Route path="settings/trial" element={<TrialSettingsPage />} />
          <Route path="settings/email-templates" element={<EmailTemplatesPage />} />
          <Route path="settings/integrations" element={<IntegrationsPage />} />

          {/* Audit */}
          <Route path="audit" element={<AuditLogPage />} />

          {/* Notifications */}
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
