import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface MrrData {
  month: string;
  mrr: number;
}

interface MrrChartProps {
  data?: MrrData[];
  isLoading?: boolean;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0].value as number;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-elevated">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatBRL(value)}</p>
    </div>
  );
}

export const MrrChart: React.FC<MrrChartProps> = ({ data, isLoading }) => {
  if (isLoading || !data || data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const current = data[data.length - 1]?.mrr ?? 0;
  const previous = data[data.length - 2]?.mrr ?? 0;
  const growth = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  return (
    <Card className="h-full transition-shadow hover:shadow-elevated">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <p className="dashboard-kicker">Histórico de MRR</p>
          <p className="tabular-nums text-2xl font-semibold tracking-tight text-foreground">
            {formatBRL(current)}
          </p>
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
            <span className="text-emerald-700">{growth.toFixed(1)}%</span>
            vs. último período
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-sky-600" /> Receita recorrente
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={4}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `R$ ${Math.round(value / 1000)}k` : `R$ ${value}`
                }
              />
              <Tooltip cursor={{ stroke: '#0ea5e9', strokeDasharray: '4 4' }} content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke="#0ea5e9"
                strokeWidth={2.2}
                fill="url(#mrrFill)"
                activeDot={{ r: 4, fill: '#0ea5e9', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
