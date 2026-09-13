const fs = require('fs');
const path = require('path');

const files = {
  'apps/web/src/components/ui/button.tsx': \`import React from "react";\nexport const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, ...props }, ref) => <button ref={ref} className={className} {...props} />);\nButton.displayName = "Button";\`,
  'apps/web/src/components/ui/input.tsx': \`import React from "react";\nexport const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={className} {...props} />);\nInput.displayName = "Input";\`,
  'apps/web/src/components/ui/card.tsx': \`import React from "react";\nexport const Card = ({ className, ...props }: any) => <div className={className} {...props} />;\`,
  'apps/web/src/components/ui/badge.tsx': \`import React from "react";\nexport const Badge = ({ className, ...props }: any) => <span className={className} {...props} />;\`,
  'apps/web/src/features/dashboard/dashboard-page.tsx': \`import React from 'react';\nimport { KPICard } from './components/kpi-card';\nexport default function DashboardPage() { return <div><KPICard /></div>; }\`,
  'apps/web/src/features/dashboard/components/kpi-card.tsx': \`import React from 'react';\nimport { Card } from '../../../components/ui/card';\nexport function KPICard() { return <Card>KPI Card</Card>; }\`,
  'apps/web/src/features/dashboard/components/mrr-chart.tsx': \`import React from 'react';\nexport function MRRChart() { return <div>MRR Chart</div>; }\`,
  'apps/web/src/features/tenants/tenant-list-page.tsx': \`import React from 'react';\nexport default function TenantListPage() { return <div>Tenants</div>; }\`,
  'apps/web/src/features/tenants/tenant-detail-page.tsx': \`import React from 'react';\nexport default function TenantDetailPage() { return <div>Tenant Detail</div>; }\`,
  'apps/web/src/features/plans/plan-list-page.tsx': \`import React from 'react';\nexport default function PlanListPage() { return <div>Plans</div>; }\`,
  'apps/web/src/features/plans/plan-form-page.tsx': \`import React from 'react';\nexport default function PlanFormPage() { return <div>Plan Form</div>; }\`,
  'apps/web/src/features/billing/billing-overview-page.tsx': \`import React from 'react';\nexport default function BillingOverviewPage() { return <div>Billing Overview</div>; }\`,
  'apps/web/src/features/tickets/ticket-list-page.tsx': \`import React from 'react';\nexport default function TicketListPage() { return <div>Tickets</div>; }\`,
  'apps/web/src/features/staff/staff-list-page.tsx': \`import React from 'react';\nexport default function StaffListPage() { return <div>Staff</div>; }\`,
  'apps/web/src/features/settings/settings-page.tsx': \`import React from 'react';\nexport default function SettingsPage() { return <div>Settings</div>; }\`,
  'apps/web/src/features/audit/audit-log-page.tsx': \`import React from 'react';\nexport default function AuditLogPage() { return <div>Audit Log</div>; }\`,
  'apps/web/src/components/data-table/data-table.tsx': \`import React from 'react';\nexport function DataTable() { return <div>DataTable</div>; }\`,
  'apps/web/src/components/data-table/data-table-pagination.tsx': \`import React from 'react';\nexport function DataTablePagination() { return <div>Pagination</div>; }\`,
  'apps/web/src/components/data-table/data-table-toolbar.tsx': \`import React from 'react';\nexport function DataTableToolbar() { return <div>Toolbar</div>; }\`
};

for (const [filepath, content] of Object.entries(files)) {
  const fullPath = path.join(__dirname, filepath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}
console.log("Generated additional UI and Feature placeholders.");
