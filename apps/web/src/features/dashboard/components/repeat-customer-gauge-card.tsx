import React, { useState } from 'react';
import { CheckCircle2, MoreHorizontal, Target, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RepeatCustomerGaugeCardProps {
  isLoading?: boolean;
}

export const RepeatCustomerGaugeCard: React.FC<RepeatCustomerGaugeCardProps> = ({ isLoading }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const percentage = 68;
  const target = 80;
  const totalTicks = 28;
  const filledTicks = Math.round((percentage / 100) * totalTicks);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
        </CardHeader>
        <CardContent>
          <div className="mx-auto h-36 w-52 animate-pulse rounded-full bg-secondary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex h-full flex-col transition-shadow hover:shadow-elevated">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-2">
            <p className="dashboard-kicker">Retenção de clientes</p>
            <p className="text-[1.65rem] font-semibold tracking-tight text-foreground">Boa tração</p>
            <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              12 p.p. até a meta anual
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-between pt-0">
          <div className="relative mt-2 flex h-40 w-56 items-end justify-center">
            <svg viewBox="0 0 200 115" className="h-32 w-52 overflow-visible" aria-hidden="true">
              {Array.from({ length: totalTicks }).map((_, index) => {
                const angle = 180 - (index / (totalTicks - 1)) * 180;
                const radians = (angle * Math.PI) / 180;
                const innerRadius = 70;
                const outerRadius = 84;
                const centerX = 100;
                const centerY = 100;
                const x1 = centerX + innerRadius * Math.cos(radians);
                const y1 = centerY - innerRadius * Math.sin(radians);
                const x2 = centerX + outerRadius * Math.cos(radians);
                const y2 = centerY - outerRadius * Math.sin(radians);
                const filled = index < filledTicks;
                return (
                  <line
                    key={index}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={filled ? '#10b981' : 'hsl(var(--border))'}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    className="transition-colors duration-300"
                  />
                );
              })}
            </svg>
            <div className="absolute bottom-1 flex flex-col items-center text-center">
              <span className="text-4xl font-semibold tabular-nums tracking-[-0.06em] text-foreground">
                {percentage}%
              </span>
              <span className="mt-1 text-[10px] text-muted-foreground">meta: {target}%</span>
            </div>
          </div>
          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-secondary/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ciclo atual</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">68%</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gap da meta</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-amber-700">12 p.p.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsModalOpen(true)} className="mt-4 w-full">
            <Target className="h-3.5 w-3.5" />
            Ver detalhes de retenção
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Análise de cohort & retenção
            </DialogTitle>
            <DialogDescription>
              Taxa de recompra mensal consolidada dos clientes cadastrados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div>
                <p className="text-xs font-medium text-emerald-700">Retenção trimestral</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">68,0%</p>
              </div>
              <div className="text-right text-[11px] text-emerald-700">
                <p className="rounded-md border border-emerald-100 bg-white px-2 py-1 font-medium">Meta: 80%</p>
                <p className="mt-1">Faltam 12 p.p.</p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground">Evolução por ciclo de compra</p>
              {[
                ['1º mês', 82],
                ['2º mês', 74],
                ['3º mês', 68],
              ].map(([label, value]) => (
                <div key={label as string} className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{label as string}</span>
                    <span className="font-mono font-medium text-foreground">{value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <p className="leading-relaxed">
                Clientes do canal <strong className="font-semibold text-foreground">Varejistas</strong> apresentaram fidelização 14% acima da média.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
