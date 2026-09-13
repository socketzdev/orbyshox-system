import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: number;
  format?: 'currency' | 'number' | 'percentage';
  previousValue?: number;
  icon?: React.ReactNode;
  isLoading?: boolean;
  trendLabel?: string;
  trendIsGood?: boolean;
  sparkline?: number[];
  accent?: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';
  className?: string;
}

const accentStyles = {
  sky: {
    icon: 'border-sky-100 bg-sky-50 text-sky-600',
    line: '#0ea5e9',
    fill: '#0ea5e9',
    pill: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  emerald: {
    icon: 'border-emerald-100 bg-emerald-50 text-emerald-600',
    line: '#10b981',
    fill: '#10b981',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  amber: {
    icon: 'border-amber-100 bg-amber-50 text-amber-700',
    line: '#f59e0b',
    fill: '#f59e0b',
    pill: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  rose: {
    icon: 'border-rose-100 bg-rose-50 text-rose-600',
    line: '#f43f5e',
    fill: '#f43f5e',
    pill: 'bg-rose-50 text-rose-700 border-rose-100',
  },
  violet: {
    icon: 'border-violet-100 bg-violet-50 text-violet-600',
    line: '#8b5cf6',
    fill: '#8b5cf6',
    pill: 'bg-violet-50 text-violet-700 border-violet-100',
  },
};

function Sparkline({ data, color, fill }: { data: number[]; color: string; fill: string }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 25 - ((value - min) / range) * 21;
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `0,25 ${points} 100,25`;
  const gradId = `spark-${color.replace('#', '')}`;

  return (
    <svg viewBox="0 0 100 26" className="h-9 w-24 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.24" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={areaPoints} fill={`url(#${gradId})`} stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  format = 'number',
  previousValue,
  icon,
  isLoading = false,
  trendLabel = 'vs. mês anterior',
  trendIsGood = true,
  sparkline = [],
  accent = 'sky',
  className,
}) => {
  const colors = accentStyles[accent];

  if (isLoading) {
    return (
      <Card className={cn('min-h-[156px]', className)}>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg" />
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-0">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-20" />
        </CardContent>
      </Card>
    );
  }

  const formatValue = (currentValue: number) => {
    if (format === 'currency') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 2,
      }).format(currentValue);
    }
    if (format === 'percentage') return `${currentValue.toFixed(2)}%`;
    return new Intl.NumberFormat('pt-BR').format(currentValue);
  };

  const trend =
    previousValue !== undefined && previousValue !== 0
      ? ((value - previousValue) / previousValue) * 100
      : null;
  const trendIsPositive = trend !== null && trend > 0;
  const trendIsNegative = trend !== null && trend < 0;
  const trendIsNeutral = trend === null || (!trendIsPositive && !trendIsNegative);
  const trendLooksGood = trendIsPositive ? trendIsGood : trendIsNegative ? !trendIsGood : true;

  return (
    <Card className={cn('group min-h-[156px] overflow-hidden transition-shadow hover:shadow-elevated', className)}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="min-w-0 space-y-2">
          <p className="dashboard-kicker truncate">{title}</p>
          <p className="tabular-nums text-[1.65rem] font-semibold tracking-[-0.04em] text-foreground">
            {formatValue(value)}
          </p>
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105',
              colors.icon,
            )}
          >
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-2 pt-0">
        {trendIsNeutral ? (
          <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex h-5 items-center gap-1 rounded-md border border-border bg-secondary px-1.5 font-medium text-muted-foreground">
              <Minus className="h-3 w-3" />
              Estável
            </span>
            <span className="truncate">{trendLabel}</span>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-semibold',
                trendLooksGood ? colors.pill : accentStyles.rose.pill,
              )}
            >
              {trendIsPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend).toFixed(1)}%
            </span>
            <span className="truncate">{trendLabel}</span>
          </div>
        )}
        <Sparkline data={sparkline} color={colors.line} fill={colors.fill} />
      </CardContent>
    </Card>
  );
};
