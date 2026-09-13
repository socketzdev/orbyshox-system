import React, { useState } from 'react';
import { Activity, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DayItem {
  day: string;
  value: number;
}

const DAYS: DayItem[] = [
  { day: 'Dom', value: 3400 },
  { day: 'Seg', value: 5200 },
  { day: 'Ter', value: 8162 },
  { day: 'Qua', value: 4100 },
  { day: 'Qui', value: 6300 },
  { day: 'Sex', value: 5800 },
  { day: 'Sáb', value: 4900 },
];

interface MostActiveDayCardProps {
  isLoading?: boolean;
}

export const MostActiveDayCard: React.FC<MostActiveDayCardProps> = ({ isLoading }) => {
  const [activeDay, setActiveDay] = useState('Ter');
  const focused = DAYS.find((day) => day.day === activeDay) ?? DAYS[0];
  const total = DAYS.reduce((acc, day) => acc + day.value, 0);
  const max = Math.max(...DAYS.map((day) => day.value));

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-44" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-[180px] w-full" />
          <Skeleton className="h-6 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-elevated">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-2">
          <p className="dashboard-kicker">Dia mais ativo</p>
          <p className="text-[1.65rem] font-semibold tabular-nums tracking-tight text-foreground">
            {focused.day} · {focused.value.toLocaleString('pt-BR')}
          </p>
          <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Activity className="h-3 w-3 text-emerald-600" />
            pico de acessos nesta semana
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between pt-0">
        <div className="flex h-44 items-end justify-between gap-3 rounded-lg border border-border bg-secondary/50 p-4">
          {DAYS.map((item) => {
            const heightPercent = Math.round((item.value / max) * 100);
            const isActive = item.day === activeDay;
            return (
              <button
                key={item.day}
                type="button"
                onClick={() => setActiveDay(item.day)}
                aria-pressed={isActive}
                className="group flex flex-1 flex-col items-center justify-end gap-2 focus:outline-none"
              >
                <span
                  className={cn(
                    'min-h-[1.1rem] tabular-nums text-[10px] font-semibold transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  {item.value.toLocaleString('pt-BR')}
                </span>
                <div className="flex h-full w-full max-w-[34px] items-end overflow-hidden rounded-md bg-card p-0.5">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={cn(
                      'w-full rounded transition-all duration-300',
                      isActive
                        ? 'bg-gradient-to-t from-sky-600 to-sky-400 shadow-sm shadow-sky-500/30'
                        : 'bg-muted group-hover:bg-sky-200',
                    )}
                  />
                </div>
                <span
                  className={cn(
                    'text-[11px] font-medium transition-colors',
                    isActive ? 'text-sky-600' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  {item.day}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
          <span>Total semanal</span>
          <span className="font-mono text-foreground tabular-nums">
            {total.toLocaleString('pt-BR')} acessos
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
