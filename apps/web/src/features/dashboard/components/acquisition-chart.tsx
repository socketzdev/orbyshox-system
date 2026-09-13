import React from 'react';
import { ArrowDownRight, ArrowUpRight, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface AcquisitionData {
  month: string;
  newClients: number;
  canceledClients: number;
}

interface AcquisitionChartProps {
  data?: AcquisitionData[];
  isLoading?: boolean;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[160px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-elevated">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {payload.map((item: any) => (
        <div key={item.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export const AcquisitionChart: React.FC<AcquisitionChartProps> = ({ data, isLoading }) => {
  if (isLoading || !data || data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const acquired = data.reduce((sum, item) => sum + item.newClients, 0);
  const canceled = data.reduce((sum, item) => sum + item.canceledClients, 0);
  const netGrowth = acquired - canceled;

  return (
    <Card className="h-full transition-shadow hover:shadow-elevated">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <p className="dashboard-kicker">Aquisição & churn</p>
          <p className="tabular-nums text-2xl font-semibold tracking-tight text-foreground">
            +{netGrowth.toLocaleString('pt-BR')}
          </p>
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
            saldo líquido no período
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-600">
          <Users className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-secondary/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Novos clientes</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" /> {acquired}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cancelamentos</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" /> {canceled}
            </p>
          </div>
        </div>
        <div className="h-[198px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barGap={4}>
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
                width={30}
              />
              <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                iconSize={6}
                wrapperStyle={{ paddingTop: 12, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}
              />
              <Bar dataKey="newClients" name="Novos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="canceledClients" name="Cancelados" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
