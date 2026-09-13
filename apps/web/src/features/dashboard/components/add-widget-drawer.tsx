import React from 'react';
import { BarChart2, Check, LayoutDashboard, PieChart, Plus, TrendingUp, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AddWidgetDrawerProps {
  open: boolean;
  onClose: () => void;
  activeWidgets: string[];
  onToggleWidget: (widgetId: string) => void;
}

interface WidgetItem {
  id: string;
  title: string;
  description: string;
  tag: string;
  icon: React.ElementType;
  accent: string;
  preview: React.ReactNode;
}

const WIDGETS: WidgetItem[] = [
  {
    id: 'visitors-device',
    title: 'Visitantes por dispositivo',
    description: 'Acompanhe como os clientes acessam sua loja em celulares, desktops e tablets.',
    tag: 'Audiência',
    icon: PieChart,
    accent: 'border-sky-100 bg-sky-50 text-sky-700',
    preview: (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-sky-100 bg-sky-50">
        <div className="h-10 w-10 rounded-full border-[5px] border-sky-500 border-r-emerald-500 border-b-amber-500 p-1.5">
          <div className="h-full w-full rounded-full bg-card" />
        </div>
      </div>
    ),
  },
  {
    id: 'dashboard-overview',
    title: 'Visão geral do dashboard',
    description: 'Visualize as principais métricas e tendências de desempenho em um só lugar.',
    tag: 'Desempenho',
    icon: LayoutDashboard,
    accent: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    preview: (
      <div className="flex h-16 w-24 flex-col justify-between rounded-lg border border-indigo-100 bg-indigo-50 p-2">
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Visão geral
        </div>
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">1.682</p>
          <p className="text-[8px] font-medium text-emerald-700">+15,5% no período</p>
        </div>
      </div>
    ),
  },
  {
    id: 'orders-performance',
    title: 'Desempenho de pedidos',
    description: 'Monitore volume de pedidos, status de entrega e atividade de vendas em tempo real.',
    tag: 'Operações',
    icon: BarChart2,
    accent: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    preview: (
      <div className="flex h-16 w-16 items-end justify-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 p-2">
        <div className="h-5 w-2 rounded-t bg-emerald-500/50" />
        <div className="h-10 w-2 rounded-t bg-emerald-500" />
        <div className="h-7 w-2 rounded-t bg-emerald-500/70" />
        <div className="h-12 w-2 rounded-t bg-emerald-600" />
      </div>
    ),
  },
  {
    id: 'trend-analysis',
    title: 'Análise de tendências',
    description: 'Agrupe clientes por comportamento e dados demográficos para campanhas direcionadas.',
    tag: 'Estratégia',
    icon: TrendingUp,
    accent: 'border-amber-100 bg-amber-50 text-amber-700',
    preview: (
      <div className="flex h-16 w-16 items-end rounded-lg border border-amber-100 bg-amber-50 p-2">
        <svg viewBox="0 0 50 25" className="w-full text-amber-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M 0 20 Q 15 22 25 10 T 50 5" />
        </svg>
      </div>
    ),
  },
  {
    id: 'customer-segmentation',
    title: 'Segmentação de clientes',
    description: 'Agrupe clientes por frequência de compra, nicho e ticket médio de pedidos.',
    tag: 'Clientes',
    icon: Users,
    accent: 'border-violet-100 bg-violet-50 text-violet-700',
    preview: (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-violet-100 bg-violet-50">
        <Users className="h-6 w-6 text-violet-600" />
      </div>
    ),
  },
];

export const AddWidgetDrawer: React.FC<AddWidgetDrawerProps> = ({
  open,
  onClose,
  activeWidgets,
  onToggleWidget,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar painel de widgets"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-slate-900/30 backdrop-blur-sm animate-in fade-in-0"
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-elevated animate-in slide-in-from-right duration-300">
        <header className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-6">
          <div>
            <p className="dashboard-kicker">Personalização</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Adicionar widget</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Escolha os sinais que aparecem no seu painel.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {WIDGETS.map((widget) => {
            const isSelected = activeWidgets.includes(widget.id);
            const Icon = widget.icon;
            return (
              <div
                key={widget.id}
                className={cn(
                  'rounded-xl border bg-card p-3.5 transition-colors',
                  isSelected ? 'border-sky-300 ring-1 ring-sky-200' : 'border-border hover:border-sky-300',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0">{widget.preview}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <h3 className="text-sm font-semibold text-foreground">{widget.title}</h3>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{widget.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className={cn('rounded-md border px-2 py-1 text-[10px] font-medium', widget.accent)}>
                        {widget.tag}
                      </span>
                      <Button
                        size="sm"
                        variant={isSelected ? 'secondary' : 'outline'}
                        onClick={() => onToggleWidget(widget.id)}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        {isSelected ? 'Ativo' : 'Adicionar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-border bg-secondary/40 px-5 py-4 sm:px-6">
          <span className="text-xs text-muted-foreground">
            <strong className="font-semibold text-foreground">{activeWidgets.length}</strong> widgets ativos
          </span>
          <Button size="sm" onClick={onClose}>Concluir edição</Button>
        </footer>
      </aside>
    </div>
  );
};
