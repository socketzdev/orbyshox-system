import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useResolvedTheme } from './marketplace-ui';

/**
 * Gráficos do módulo de Compras.
 *
 * Recharts serializa cores em atributos SVG, onde `var(--token)` não resolve de
 * forma confiável. Por isso cada gráfico lê o tema já aplicado e passa valores
 * literais — é o que mantém o contraste correto no tema escuro.
 */

const SERIES = {
  light: {
    grid: '#e2e8f0',
    axis: '#94a3b8',
    indigo: '#6366f1',
    emerald: '#10b981',
    amber: '#f59e0b',
    sky: '#0ea5e9',
    slate: '#94a3b8',
    rose: '#f43f5e',
  },
  dark: {
    grid: '#1e293b',
    axis: '#64748b',
    indigo: '#818cf8',
    emerald: '#34d399',
    amber: '#fbbf24',
    sky: '#38bdf8',
    slate: '#64748b',
    rose: '#fb7185',
  },
};

// ─── Tooltip customizado ─────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, any>;
}

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  format: (value: any) => string;
}> = ({ active, payload, label, format }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-elevated">
      {label !== undefined && (
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      {payload.map((item, index) => (
        <p key={index} className="flex items-center gap-2 text-[12px]">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{item.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-foreground">
            {format(item.value)}
          </span>
        </p>
      ))}
    </div>
  );
};

// ─── Tendência de gasto (área) ───────────────────────────────────────────────

export interface TrendPoint {
  label: string;
  total: number;
}

export const SpendTrendChart: React.FC<{
  data: TrendPoint[];
  accent?: 'indigo' | 'emerald';
  height?: number;
}> = ({ data, accent = 'indigo', height = 200 }) => {
  const theme = useResolvedTheme();
  const c = SERIES[theme];
  const stroke = accent === 'emerald' ? c.emerald : c.indigo;
  const gradientId = `mk-trend-${accent}-${theme}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            stroke={c.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={6}
          />
          <YAxis
            stroke={c.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v) =>
              new Intl.NumberFormat('pt-BR', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
          />
          <Tooltip
            content={<ChartTooltip format={(v) => formatCurrencyCompact(Number(v))} />}
            cursor={{ stroke: c.axis, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Gasto"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: stroke, fill: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Pedidos por status (barras horizontais) ─────────────────────────────────

export interface StatusPoint {
  label: string;
  value: number;
  colorToken: keyof typeof SERIES.light;
}

export const OrdersStatusChart: React.FC<{ data: StatusPoint[]; height?: number }> = ({
  data,
  height,
}) => {
  const theme = useResolvedTheme();
  const c = SERIES[theme];
  const chartHeight = height ?? Math.max(data.length * 38 + 16, 120);

  return (
    <div style={{ height: chartHeight }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            stroke={c.axis}
            fontSize={11.5}
            tickLine={false}
            axisLine={false}
            width={86}
          />
          <Tooltip
            content={<ChartTooltip format={(v) => `${v} pedido(s)`} />}
            cursor={{ fill: theme === 'dark' ? '#1e293b55' : '#f1f5f955' }}
          />
          <Bar dataKey="value" name="Pedidos" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map((entry, index) => (
              <Cell key={index} fill={c[entry.colorToken]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Distribuição (rosca) ────────────────────────────────────────────────────

export interface DonutPoint {
  label: string;
  value: number;
  colorToken: keyof typeof SERIES.light;
}

export const DistributionDonut: React.FC<{
  data: DonutPoint[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}> = ({ data, height = 180, centerLabel, centerValue }) => {
  const theme = useResolvedTheme();
  const c = SERIES[theme];
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={c[entry.colorToken]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip format={(v) => `${v} (${formatShare(Number(v), total)})`} />} />
        </PieChart>
      </ResponsiveContainer>

      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[1.35rem] font-semibold leading-none tabular-nums text-foreground">
            {centerValue}
          </span>
          <span className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Formatadores ────────────────────────────────────────────────────────────

function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatShare(value: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
