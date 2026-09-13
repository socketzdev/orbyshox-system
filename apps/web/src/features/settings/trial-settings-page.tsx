import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CossSwitch, CossBadge } from '@/components/coss-ui';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, Save, Mail, Calendar, Loader2, Timer, CreditCard, Sparkles, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiGet, apiPatch } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TrialSettings {
  durationDays: number;
  requireCreditCard: boolean;
}

interface CommunicationRule {
  id: string;
  name: string;
  day: number;
  enabled: boolean;
}

const DEFAULT_COMMS: CommunicationRule[] = [
  { id: 'welcome', name: 'Boas-vindas ao Trial', day: 1, enabled: true },
  { id: 'tips', name: 'Dicas e Primeiros Passos', day: 7, enabled: true },
  { id: 'ending', name: 'Aviso de Término de Período', day: 12, enabled: true },
  { id: 'last', name: 'Último Dia de Teste', day: 14, enabled: true },
];

export const TrialSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [trialConfig, setTrialConfig] = useState<TrialSettings>({
    durationDays: 14,
    requireCreditCard: false,
  });
  const [communications, setCommunications] = useState<CommunicationRule[]>(DEFAULT_COMMS);

  const { data, isLoading } = useQuery({
    queryKey: ['trial-settings'],
    queryFn: () => apiGet<any>('/settings/trial'),
  });

  useEffect(() => {
    if (data) {
      setTrialConfig({
        durationDays: Number(data.durationDays ?? data.TRIAL_DURATION_DAYS ?? 14),
        requireCreditCard: Boolean(data.requireCreditCard ?? data.TRIAL_REQUIRE_CARD ?? false),
      });
      if (Array.isArray(data.communications) && data.communications.length > 0) {
        setCommunications(data.communications);
      }
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: { trialConfig: TrialSettings; communications: CommunicationRule[] }) =>
      apiPatch('/settings/trial', payload),
    onSuccess: () => {
      toast.success('Régua de trial salva com sucesso');
      queryClient.invalidateQueries({ queryKey: ['trial-settings'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Falha ao salvar configurações');
    },
  });

  const handleUpdateComm = (index: number, field: string, value: any) => {
    const updated = [...communications];
    updated[index] = { ...updated[index], [field]: value };
    setCommunications(updated);
  };

  const handleSave = () => {
    mutation.mutate({ trialConfig, communications });
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
          Gerencie as condições do período de testes gratuito e a régua de engajamento por e-mail.
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

      {/* Trial General Configuration */}
      <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-6">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">Parâmetros do Trial</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tempo de acesso sem cobrança e exigência de cartão na criação do tenant.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-zinc-100">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-zinc-700">Duração Padrão do Trial</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={90}
                value={trialConfig.durationDays}
                onChange={(e) =>
                  setTrialConfig({ ...trialConfig, durationDays: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="h-10 text-xs rounded-xl border-zinc-200 bg-zinc-50/50 max-w-[140px] text-center font-bold"
              />
              <span className="text-xs text-zinc-500 font-medium">dias corridos</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Novas contas criadas receberão este prazo de gratuidade antes do primeiro vencimento.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-zinc-600" />
                <Label className="text-xs font-bold text-zinc-900">Exigir Cartão de Crédito</Label>
              </div>
              <CossSwitch
                checked={trialConfig.requireCreditCard}
                onCheckedChange={(v) => setTrialConfig({ ...trialConfig, requireCreditCard: v })}
              />
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Quando ativado, o lead deve informar um cartão válido para iniciar os testes. A primeira cobrança será gerada automaticamente ao final do prazo.
            </p>
          </div>
        </div>
      </div>

      {/* Communication Sequence */}
      <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Régua de Comunicação do Trial</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              E-mails transacionais enviados ao longo da jornada do lead durante o período de testes.
            </p>
          </div>
          <CossBadge variant="neutral">{communications.filter(c => c.enabled).length} ativas</CossBadge>
        </div>

        <div className="space-y-4 relative ml-3">
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-zinc-200 z-0" />

          {communications.map((comm, index) => (
            <div key={comm.id} className="flex items-start gap-4 relative z-10">
              <div
                className={cn(
                  'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs transition-colors',
                  comm.enabled
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-400 border border-zinc-200',
                )}
              >
                <Mail className="h-4 w-4" />
              </div>

              <div
                className={cn(
                  'flex-1 flex flex-col md:flex-row gap-4 justify-between rounded-2xl border p-4 transition-all shadow-2xs',
                  comm.enabled
                    ? 'bg-white border-zinc-200/80'
                    : 'bg-zinc-50/70 border-zinc-200/50 opacity-65',
                )}
              >
                <div className="space-y-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-900">{comm.name}</span>
                      {!comm.enabled ? (
                        <CossBadge variant="neutral">Inativo</CossBadge>
                      ) : (
                        <CossBadge variant="success">Ativo</CossBadge>
                      )}
                    </div>
                    <CossSwitch
                      checked={comm.enabled}
                      onCheckedChange={(v) => handleUpdateComm(index, 'enabled', v)}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-600">Disparar no</span>
                    <Input
                      type="number"
                      className="w-16 h-8 text-xs font-bold text-center rounded-xl bg-zinc-50 border-zinc-200"
                      value={comm.day}
                      onChange={(e) => handleUpdateComm(index, 'day', Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={!comm.enabled}
                      min={1}
                    />
                    <span className="text-xs text-zinc-600">º dia de cadastro</span>
                  </div>
                </div>

                <div className="flex md:flex-col items-center justify-center border-t md:border-t-0 md:border-l border-zinc-100 pt-3 md:pt-0 md:pl-4">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full rounded-xl border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        Prévia
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl text-zinc-900">
                      <DialogHeader>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-800">
                            <Mail className="h-4 w-4" />
                          </div>
                          <DialogTitle className="text-base font-bold text-zinc-900">
                            {comm.name}
                          </DialogTitle>
                        </div>
                      </DialogHeader>
                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs whitespace-pre-wrap text-zinc-800 leading-relaxed shadow-2xs">
                        {`Assunto: [SaaS] — ${comm.name}

Olá {{nome_usuario}},

Este é o e-mail automático disparado no ${comm.day}º dia de avaliação do seu tenant.
Acesse Configurações > Templates de E-mail para customizar os textos e layouts.

Atenciosamente,
Equipe {{nome_plataforma}}`}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
