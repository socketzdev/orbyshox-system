import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CossSwitch, CossBadge } from '@/components/coss-ui';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mail, AlertTriangle, XCircle, CreditCard, Loader2, Save, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { apiGet, apiPatch } from '@/lib/api';
import { toast } from 'sonner';

interface DelinquencySettings {
  enabled: boolean;
  reminder1Days: number;
  reminder2Days: number;
  suspendDays: number;
  cancelDays: number;
}

const DEFAULTS: DelinquencySettings = {
  enabled: true,
  reminder1Days: 3,
  reminder2Days: 7,
  suspendDays: 15,
  cancelDays: 30,
};

export const DelinquencySettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DelinquencySettings>(DEFAULTS);

  const { data, isLoading } = useQuery({
    queryKey: ['delinquency-settings'],
    queryFn: () => apiGet<any>('/settings/delinquency'),
  });

  useEffect(() => {
    if (data) {
      setDraft({
        enabled: data.enabled ?? data.DELINQUENCY_AUTOMATION_ENABLED ?? DEFAULTS.enabled,
        reminder1Days: Number(data.reminder1Days ?? data.DELINQUENCY_REMINDER_1_DAYS ?? DEFAULTS.reminder1Days),
        reminder2Days: Number(data.reminder2Days ?? data.DELINQUENCY_REMINDER_2_DAYS ?? DEFAULTS.reminder2Days),
        suspendDays: Number(data.suspendDays ?? data.DELINQUENCY_SUSPEND_DAYS ?? DEFAULTS.suspendDays),
        cancelDays: Number(data.cancelDays ?? data.DELINQUENCY_CANCEL_DAYS ?? DEFAULTS.cancelDays),
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (newSettings: DelinquencySettings) =>
      apiPatch('/settings/delinquency', {
        enabled: newSettings.enabled,
        reminder1Days: newSettings.reminder1Days,
        reminder2Days: newSettings.reminder2Days,
        suspendDays: newSettings.suspendDays,
        cancelDays: newSettings.cancelDays,
      }),
    onSuccess: () => {
      toast.success('Régua de cobrança salva com sucesso');
      queryClient.invalidateQueries({ queryKey: ['delinquency-settings'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Falha ao salvar configurações');
    },
  });

  const handleSave = () => {
    mutation.mutate(draft);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-xs">
        <Loader2 className="w-6 h-6 animate-spin mr-2 text-zinc-400 mb-2" /> Carregando configurações...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Configure as ações e comunicações automáticas disparadas para clientes com faturas em atraso.
        </p>

        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="h-9 rounded-xl bg-zinc-900 text-xs font-semibold text-white hover:bg-zinc-800 shadow-2xs"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Salvar Alterações
            </>
          )}
        </Button>
      </div>

      {/* Warning Notice Banner */}
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-amber-900">Atenção sobre automações ativas</p>
          <p className="text-amber-800 leading-relaxed">
            As alterações aqui salvas afetam imediatamente a régua de cobrança de todos os clientes inadimplentes.
            As ações de bloqueio e cancelamento ocorrem de forma autônoma pelo cron job diário.
          </p>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-5">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Automação de Cobrança</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Habilita ou suspende o disparo automático da régua em toda a plataforma.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-700">
              {draft.enabled ? 'Ativada' : 'Pausada'}
            </span>
            <CossSwitch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-6 relative ml-3">
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-zinc-200 z-0" />

          {/* Step 1 */}
          <div className="flex items-start gap-4 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
              <Mail className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-2xl border border-zinc-200/80 p-4 bg-zinc-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-zinc-900">Primeiro Lembrete Amigável</h3>
                  <p className="text-[11px] text-zinc-500">
                    Notificação por e-mail com segunda via de boleto/Pix ou tentativa no cartão.
                  </p>
                </div>
                <CossBadge variant="neutral">Etapa 1</CossBadge>
              </div>
              <div className="flex items-center gap-2 max-w-[220px]">
                <Input
                  type="number"
                  value={draft.reminder1Days}
                  onChange={(e) => setDraft({ ...draft, reminder1Days: parseInt(e.target.value) || 0 })}
                  disabled={!draft.enabled}
                  min={1}
                  className="h-9 text-xs rounded-xl bg-white border-zinc-200 text-center font-bold"
                />
                <span className="text-xs text-zinc-500 whitespace-nowrap">dias de atraso</span>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shrink-0 shadow-2xs">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-2xl border border-zinc-200/80 p-4 bg-zinc-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-zinc-900">Segundo Lembrete e Alerta de Bloqueio</h3>
                  <p className="text-[11px] text-zinc-500">
                    E-mail enfático alertando sobre a iminente suspensão de acesso caso a pendência persista.
                  </p>
                </div>
                <CossBadge variant="warning">Etapa 2</CossBadge>
              </div>
              <div className="flex items-center gap-2 max-w-[220px]">
                <Input
                  type="number"
                  value={draft.reminder2Days}
                  onChange={(e) => setDraft({ ...draft, reminder2Days: parseInt(e.target.value) || 0 })}
                  disabled={!draft.enabled}
                  min={1}
                  className="h-9 text-xs rounded-xl bg-white border-zinc-200 text-center font-bold"
                />
                <span className="text-xs text-zinc-500 whitespace-nowrap">dias de atraso</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-4 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 shrink-0 shadow-2xs">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-2xl border border-orange-200/60 p-4 bg-orange-50/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-orange-950">Suspensão de Acesso ao Sistema</h3>
                  <p className="text-[11px] text-zinc-600">
                    O login dos operadores do cliente é redirecionado para a tela de regularização financeira.
                  </p>
                </div>
                <CossBadge variant="warning">Bloqueio</CossBadge>
              </div>
              <div className="flex items-center gap-2 max-w-[220px]">
                <Input
                  type="number"
                  value={draft.suspendDays}
                  onChange={(e) => setDraft({ ...draft, suspendDays: parseInt(e.target.value) || 0 })}
                  disabled={!draft.enabled}
                  min={1}
                  className="h-9 text-xs rounded-xl bg-white border-zinc-200 text-center font-bold"
                />
                <span className="text-xs text-zinc-500 whitespace-nowrap">dias de atraso</span>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex items-start gap-4 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0 shadow-2xs">
              <XCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-2xl border border-rose-200/60 p-4 bg-rose-50/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-rose-950">Cancelamento de Contrato (Churn Automático)</h3>
                  <p className="text-[11px] text-zinc-600">
                    A assinatura é rescindida, o tenant é marcado como CANCELADO e as cobranças futuras são canceladas.
                  </p>
                </div>
                <CossBadge variant="danger">Cancelamento</CossBadge>
              </div>
              <div className="flex items-center gap-2 max-w-[220px]">
                <Input
                  type="number"
                  value={draft.cancelDays}
                  onChange={(e) => setDraft({ ...draft, cancelDays: parseInt(e.target.value) || 0 })}
                  disabled={!draft.enabled}
                  min={1}
                  className="h-9 text-xs rounded-xl bg-white border-zinc-200 text-center font-bold"
                />
                <span className="text-xs text-zinc-500 whitespace-nowrap">dias de atraso</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
