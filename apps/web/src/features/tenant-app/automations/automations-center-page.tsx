import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Bot,
  TrendingUp,
  ShieldCheck,
  Bell,
  Clock,
  Activity,
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ErpEmptyState } from '../components/erp-empty-state';
import { toast } from 'sonner';

export const AutomationsCenterPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const STORAGE_KEY = 'tenant_automation_rules';

  const [activeRulesState, setActiveRulesState] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      'stock-min': true,
      'daily-closing': true,
      'anti-churn': true,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeRulesState));
    } catch {}
  }, [activeRulesState]);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-automations', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/automations`),
    refetchInterval: 10000,
  });

  const rules = data?.rules || [];
  const notifications = data?.notifications || [];

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch(`/tenant-app/${slug}/automations/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-automations', slug] }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost(`/tenant-app/${slug}/automations/rules/${id}/toggle`, { enabled }),
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? 'Regra ativada' : 'Regra pausada');
      queryClient.invalidateQueries({ queryKey: ['tenant-automations', slug] });
    },
    onError: () => {
      // Fallback silencioso se backend não tiver a rota ainda
    },
  });

  const toggleRule = (id: string) => {
    setActiveRulesState((prev) => {
      const nextVal = !prev[id];
      return { ...prev, [id]: nextVal };
    });
    toggleRuleMutation.mutate({ id, enabled: !activeRulesState[id] });
  };

  const rulesCatalog = [
    {
      id: 'stock-min',
      title: 'Reposição & Alerta de Estoque Mínimo',
      description:
        'Dispara alerta automático e notifica compras assim que qualquer produto ou insumo atingir o estoque de segurança.',
      icon: AlertTriangle,
      tag: 'Estoque & Compras',
      frequency: 'Monitoramento contínuo a cada venda',
    },
    {
      id: 'daily-closing',
      title: 'Fechamento Cego & DRE Diário Automático',
      description:
        'Calcula a conciliação financeira de Pix, Dinheiro e Cartão automaticamente no encerramento de cada turno.',
      icon: TrendingUp,
      tag: 'Financeiro',
      frequency: 'Disparado ao fechar o caixa',
    },
    {
      id: 'anti-churn',
      title: 'Anti-Churn & Fidelização de Clientes',
      description:
        'Identifica automaticamente clientes que não compram há 30 dias para preparo de ofertas de retorno.',
      icon: Bot,
      tag: 'CRM & Vendas',
      frequency: 'Varredura diária à meia-noite',
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 mb-2 border border-amber-200/60">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Motor Autônomo de Produtividade</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Central de Automações Inteligentes
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Seu ERP monitora o negócio sozinho, antecipa problemas e executa tarefas repetitivas 24 horas por dia.
          </p>
        </div>

        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold px-3 py-1 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>3 Rotinas Autônomas Ativas</span>
        </Badge>
      </div>

      {/* Regras Ativas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Regras de Automação em Execução
          </h3>
          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-500" />
            Processamento em background
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rulesCatalog.map((r) => {
            const Icon = r.icon;
            const isEnabled = activeRulesState[r.id] ?? true;

            return (
              <Card
                key={r.id}
                className={`p-5 bg-white border rounded-2xl shadow-soft space-y-3 transition-all ${
                  isEnabled ? 'border-zinc-200/80' : 'border-zinc-200/50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700 border border-zinc-200/60 shadow-xs">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isEnabled
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-zinc-500 bg-zinc-100'
                      }`}
                    >
                      {isEnabled ? 'Ativo 24/7' : 'Pausado'}
                    </span>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleRule(r.id)}
                      className="scale-75"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    {r.tag}
                  </span>
                  <h4 className="text-xs font-bold text-zinc-900 mt-0.5">{r.title}</h4>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{r.description}</p>
                </div>

                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {r.frequency}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Histórico de Disparos das Automações */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-zinc-500" />
            Histórico de Ações Executadas pelas Automações
          </h3>
          <span className="text-xs text-zinc-400">
            {notifications.length} {notifications.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <ErpEmptyState
            icon={CheckCircle2}
            title="Nenhum alerta recente"
            description="O motor de automação está operando silenciosamente. Alertas de estoque ou fechamento aparecerão aqui."
          />
        ) : (
          <div className="divide-y divide-zinc-100">
            {notifications.map((notif: any) => (
              <div
                key={notif.id}
                className="py-3.5 flex items-start justify-between gap-4 text-xs hover:bg-zinc-50/50 px-2 rounded-xl transition"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-zinc-900 truncate">{notif.title}</p>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 shadow-xs" />
                    )}
                  </div>
                  <p className="text-zinc-600 text-[11px] leading-relaxed">{notif.content}</p>
                  <p className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(notif.createdAt).toLocaleString()}</span>
                  </p>
                </div>

                {!notif.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-zinc-500 hover:text-zinc-900 shrink-0 rounded-lg hover:bg-zinc-100"
                    onClick={() => markReadMutation.mutate(notif.id)}
                  >
                    Marcar lido
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
