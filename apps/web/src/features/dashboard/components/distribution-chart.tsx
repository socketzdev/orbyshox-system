import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface DistributionData {
  label: string;
  value: number;
  percentage: number;
}

interface DistributionChartProps {
  title: string;
  type: 'pie' | 'bar';
  data?: DistributionData[];
  isLoading?: boolean;
  description?: string;
  accent?: 'plan' | 'niche';
}

const PALETTE = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

function renderTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload as DistributionData;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-elevated">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{datum.label}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="font-semibold tabular-nums text-foreground">{datum.value}</span>
        <span className="text-muted-foreground">clientes</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
          {datum.percentage}%
        </span>
      </p>
    </div>
  );
}

export const DistributionChart: React.FC<DistributionChartProps> = ({
  title,
  type,
  data,
  isLoading,
  description,
  accent = 'plan',
}) => {
  if (isLoading || !data || data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const lead = [...data].sort((a, b) => b.value - a.value)[0];
  return (
    <Card className="h-full transition-shadow hover:shadow-elevated">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <p className="dashboard-kicker">{title}</p>
          <p className="tabular-nums text-2xl font-semibold tracking-tight text-foreground">
            {total.toLocaleString('pt-BR')}
          </p>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
        {lead && (
          <div
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-right text-[11px]',
              accent === 'plan'
                ? 'border-sky-100 bg-sky-50 text-sky-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700',
            )}
          >
            <p className="font-medium">Líder</p>
            <p className="font-semibold tabular-nums">{lead.percentage}%</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'pie' ? (
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="label"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {data.map((_, index) => (
                    <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
              </PieChart>
            ) : (
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: 16, left: 16, bottom: 0 }}
                barCategoryGap={12}
              >
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 4" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="label"
                  type="category"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tick={{ width: 0 }}
                  interval={0}
                  tickFormatter={(value: string) =>
                    value.length > 18 ? `${value.slice(0, 17)}…` : value
                  }
                />
                <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} content={renderTooltip} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {data.map((_, index) => (
                    <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        <ul className="mt-4 space-y-1.5">
          {data.map((item, idx) => (
            <li
              key={`${item.label}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2.5 py-1.5 text-xs transition-colors hover:border-border hover:bg-secondary/50"
            >
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-muted-foreground tabular-nums">{item.value}</span>
                <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-medium tabular-nums text-foreground">
                  {item.percentage}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
