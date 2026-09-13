import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CossBadge, CossEmpty, CossSpinner } from '@/components/coss-ui';
import { toast } from 'sonner';
import { Plus, Archive, Search, Check, Users, Store, Layers, Sparkles, RefreshCw } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);

export const PlanListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiGet('/plans'),
  });

  const plans = Array.isArray(data) ? data : data?.data || [];

  const filteredPlans = useMemo(() => {
    const q = search.toLowerCase();
    return plans.filter((p: any) => {
      const matchSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q);
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && !p.isArchived) ||
        (statusFilter === 'ARCHIVED' && p.isArchived);
      return matchSearch && matchStatus;
    });
  }, [plans, search, statusFilter]);

  // Stat summary metrics
  const stats = useMemo(() => {
    const total = plans.length;
    const active = plans.filter((p: any) => !p.isArchived).length;
    const totalSubs = plans.reduce((acc: number, p: any) => acc + (p._count?.subscriptions || 0), 0);
    return { total, active, totalSubs };
  }, [plans]);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/plans/${id}/archive`, {}),
    onSuccess: () => {
      toast.success('Plano arquivado');
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: () => toast.error('Falha ao arquivar plano'),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/plans/${id}/unarchive`, {}),
    onSuccess: () => {
      toast.success('Plano reativado');
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: () => toast.error('Falha ao reativar plano'),
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Configuração de precificação, limites operacionais e pacotes de funcionalidades.
        </p>
        <Button
          onClick={() => navigate('/plans/new')}
          className="h-10 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs gap-2"
        >
          <Plus className="h-4 w-4" /> Novo Plano
        </Button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Total de Planos</span>
            <div className="text-xl font-bold text-zinc-900">{stats.total}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Planos Ativos</span>
            <div className="text-xl font-bold text-zinc-900">{stats.active}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Assinaturas Vinculadas</span>
            <div className="text-xl font-bold text-zinc-900">{stats.totalSubs}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>

        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
          {([
            { id: 'ALL', label: 'Todos' },
            { id: 'ACTIVE', label: 'Ativos' },
            { id: 'ARCHIVED', label: 'Arquivados' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStatusFilter(opt.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === opt.id
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Plans */}
      {isLoading ? (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-12 text-center shadow-2xs">
          <CossSpinner className="w-6 h-6 mb-2" />
          <p className="text-xs text-zinc-500">Carregando planos cadastrados...</p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/80 bg-white shadow-2xs">
          <CossEmpty
            icon={<Layers className="w-6 h-6 text-zinc-400" />}
            title="Nenhum plano encontrado"
            description={
              plans.length === 0
                ? 'Nenhum plano cadastrado no sistema. Crie o primeiro plano de assinatura.'
                : 'Nenhum resultado para a busca e filtros aplicados.'
            }
            action={
              plans.length === 0 ? (
                <Button
                  onClick={() => navigate('/plans/new')}
                  className="rounded-xl bg-zinc-900 text-white text-xs"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Criar Primeiro Plano
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredPlans.map((plan: any) => {
            const isArchived = plan.isArchived;
            return (
              <div
                key={plan.id}
                className={`flex flex-col justify-between rounded-3xl border bg-white p-6 shadow-2xs transition-all hover:shadow-md ${
                  isArchived ? 'border-zinc-200 opacity-75' : 'border-zinc-200/80'
                }`}
              >
                <div>
                  {/* Card Top */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-zinc-900 tracking-tight">{plan.name}</h3>
                    <CossBadge variant={isArchived ? 'neutral' : 'success'}>
                      {isArchived ? 'Arquivado' : 'Ativo'}
                    </CossBadge>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-2">
                    <span className="text-2xl font-extrabold text-zinc-900 tracking-tight">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-xs font-medium text-zinc-500">
                      / {plan.billingPeriod === 'MONTHLY' ? 'mês' : 'ano'}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-zinc-500 line-clamp-2 min-h-[32px] mb-4">
                    {plan.description || 'Sem descrição cadastrada.'}
                  </p>

                  {/* Limits Chips */}
                  <div className="flex flex-wrap gap-2 py-3 border-y border-zinc-100 text-[11px] font-medium text-zinc-600 mb-4">
                    <div className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200/60">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{plan.maxUsers} {plan.maxUsers === 1 ? 'usuário' : 'usuários'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200/60">
                      <Store className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{plan.maxUnits} {plan.maxUnits === 1 ? 'unidade' : 'unidades'}</span>
                    </div>
                  </div>

                  {/* Features Highlights */}
                  <div className="space-y-2 mb-6">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-600 block">
                      Recursos inclusos ({plan.features?.length || 0})
                    </span>
                    {plan.features && plan.features.length > 0 ? (
                      <ul className="space-y-1.5">
                        {plan.features.slice(0, 4).map((f: any, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-zinc-700">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{f.featureLabel || f.featureKey}</span>
                          </li>
                        ))}
                        {plan.features.length > 4 && (
                          <li className="text-[11px] text-zinc-600 pl-5">
                            + {plan.features.length - 4} outros recursos
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">Nenhum recurso específico configurado.</p>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-zinc-100 gap-2">
                  {!isArchived ? (
                    <button
                      type="button"
                      onClick={() => archiveMutation.mutate(plan.id)}
                      disabled={archiveMutation.isPending}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" /> Arquivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => unarchiveMutation.mutate(plan.id)}
                      disabled={unarchiveMutation.isPending}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reativar
                    </button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/plans/${plan.id}/edit`)}
                    className="rounded-xl h-8 px-3.5 text-xs font-semibold border-zinc-200 text-zinc-800 hover:bg-zinc-100"
                  >
                    Editar Plano
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
