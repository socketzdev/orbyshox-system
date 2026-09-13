import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

interface ShoppersKpiCardProps {
  title: string;
  value: string | number;
  percentage: number;
  isPositive?: boolean;
  comparisonText: string;
  icon: React.ElementType;
}

export const ShoppersKpiCard: React.FC<ShoppersKpiCardProps> = ({
  title,
  value,
  percentage,
  isPositive = true,
  comparisonText,
  icon: Icon,
}) => {
  return (
    <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pt-5 pb-1">
        <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 shadow-xs">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold tracking-tight text-foreground font-sans">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </span>

          <span
            className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
              isPositive
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-rose-100 bg-rose-50 text-rose-700'
            }`}
          >
            {isPositive ? '▲' : '▼'} {Math.abs(percentage).toString().replace('.', ',')}%
          </span>
        </div>

        <p className="mt-1 truncate text-[11px] font-normal text-muted-foreground">{comparisonText}</p>
      </CardContent>
    </Card>
  );
};
