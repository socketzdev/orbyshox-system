import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CossInput, CossSwitch, CossLabel, CossSpinner } from '@/components/coss-ui';
import { toast } from 'sonner';
import { Settings, Sparkles, DollarSign, ShieldAlert, Check } from 'lucide-react';

const TRIAL_KEY = 'TRIAL_DURATION_DAYS';
const TRIAL_CARD_KEY = 'TRIAL_REQUIRE_CARD';
const CURRENCY_KEY = 'DEFAULT_CURRENCY';
const SUSPEND_KEY = 'DELINQUENCY_SUSPEND_DAYS';
const CANCEL_KEY = 'DELINQUENCY_CANCEL_DAYS';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, any>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet('/settings'),
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      apiPatch(`/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao salvar configuração');
    },
  });

  const save = (keys: string[]) => {
    keys.forEach((key) => mutation.mutate({ key, value: draft[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <CossSpinner className="w-8 h-8 mb-3" />
        <p className="text-xs text-zinc-500">Carregando configurações globais...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* Header */}
      <div>
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Parâmetros do sistema SaaS, regras operacionais de trial, moeda padrão e políticas de faturamento.
        </p>
      </div>

      <div className="space-y-6">
        {/* Trial Card */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 md:p-8 shadow-2xs space-y-5">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Período de Demonstração (Trial)</h2>
              <p className="text-xs text-zinc-500">Defina as diretrizes para novas contas em teste gratuito.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5 max-w-xs">
              <CossLabel>Duração do Trial (em dias)</CossLabel>
              <CossInput
                type="number"
                min={1}
                value={draft[TRIAL_KEY] ?? 14}
                onChange={(e) => setDraft((s) => ({ ...s, [TRIAL_KEY]: Number(e.target.value) }))}
              />
              <span className="text-[11px] text-zinc-600">Tempo padrão concedido no cadastro da empresa.</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
              <div>
                <span className="text-xs font-semibold text-zinc-900 block">Exigir Cartão de Crédito</span>
                <p className="text-[11px] text-zinc-500">
                  Solicitar dados de pagamento logo no onboarding para retenção e cobrança automática.
                </p>
              </div>
              <CossSwitch
                checked={Boolean(draft[TRIAL_CARD_KEY])}
                onCheckedChange={(checked) => setDraft((s) => ({ ...s, [TRIAL_CARD_KEY]: checked }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => save([TRIAL_KEY, TRIAL_CARD_KEY])}
              disabled={mutation.isPending}
              className="h-9 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs"
            >
              Salvar Regras de Trial
            </Button>
          </div>
        </div>

        {/* Currency Card */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 md:p-8 shadow-2xs space-y-5">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Moeda & Localização</h2>
              <p className="text-xs text-zinc-500">Unidade monetária padrão para cálculo de faturamento e exibição.</p>
            </div>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <CossLabel>Moeda Padrão</CossLabel>
            <select
              value={draft[CURRENCY_KEY] || 'BRL'}
              onChange={(e) => setDraft((s) => ({ ...s, [CURRENCY_KEY]: e.target.value }))}
              className="h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3.5 text-xs font-medium text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none"
            >
              <option value="BRL">Real Brasileiro (BRL - R$)</option>
              <option value="USD">Dólar Americano (USD - $)</option>
              <option value="EUR">Euro (EUR - €)</option>
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => save([CURRENCY_KEY])}
              disabled={mutation.isPending}
              className="h-9 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs"
            >
              Salvar Moeda
            </Button>
          </div>
        </div>

        {/* Inadimplência Card */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 md:p-8 shadow-2xs space-y-5">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Políticas de Inadimplência</h2>
              <p className="text-xs text-zinc-500">Gatilhos automáticos para bloqueio e cancelamento por falta de pagamento.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <CossLabel>Dias até Suspensão</CossLabel>
              <CossInput
                type="number"
                min={1}
                value={draft[SUSPEND_KEY] ?? 15}
                onChange={(e) => setDraft((s) => ({ ...s, [SUSPEND_KEY]: Number(e.target.value) }))}
              />
              <span className="text-[11px] text-zinc-600">
                Dias de atraso até bloquear acesso do tenant ao sistema.
              </span>
            </div>

            <div className="space-y-1.5">
              <CossLabel>Dias até Cancelamento Definitivo</CossLabel>
              <CossInput
                type="number"
                min={1}
                value={draft[CANCEL_KEY] ?? 30}
                onChange={(e) => setDraft((s) => ({ ...s, [CANCEL_KEY]: Number(e.target.value) }))}
              />
              <span className="text-[11px] text-zinc-600">
                Dias de atraso até cancelar o contrato e liberar subdomínio.
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => save([SUSPEND_KEY, CANCEL_KEY])}
              disabled={mutation.isPending}
              className="h-9 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs"
            >
              Salvar Políticas de Inadimplência
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
