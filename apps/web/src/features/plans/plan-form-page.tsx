import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CossInput, CossTextarea, CossLabel, CossSwitch, CossSpinner } from '@/components/coss-ui';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

interface Feature {
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

interface PlanForm {
  name: string;
  slug: string;
  description?: string;
  price: number;
  billingPeriod: 'MONTHLY' | 'YEARLY';
  maxUsers: number;
  maxUnits: number;
  isVisible: boolean;
}

export const PlanFormPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', id],
    queryFn: () => apiGet(`/plans/${id}`),
    enabled: isEdit,
  });

  const [features, setFeatures] = useState<Feature[]>([]);
  const [newFeatureKey, setNewFeatureKey] = useState('');
  const [newFeatureLabel, setNewFeatureLabel] = useState('');

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<PlanForm>({
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      price: 0,
      billingPeriod: 'MONTHLY',
      maxUsers: 1,
      maxUnits: 1,
      isVisible: true,
    },
  });

  const isVisible = watch('isVisible');

  useEffect(() => {
    if (plan) {
      reset({
        name: plan.name,
        slug: plan.slug,
        description: plan.description ?? '',
        price: plan.price,
        billingPeriod: plan.billingPeriod,
        maxUsers: plan.maxUsers,
        maxUnits: plan.maxUnits,
        isVisible: plan.isVisible,
      });
      const loaded = (plan.features || []).map((f: any) => ({
        featureKey: f.featureKey,
        featureLabel: f.featureLabel,
        enabled: f.enabled,
      }));
      setFeatures(loaded);
    }
  }, [plan, reset]);

  const mutation = useMutation({
    mutationFn: (data: PlanForm & { features: Feature[] }) =>
      isEdit ? apiPatch(`/plans/${id}`, data) : apiPost('/plans', data),
    onSuccess: () => {
      toast.success(isEdit ? 'Plano atualizado com sucesso!' : 'Plano criado com sucesso!');
      navigate('/plans');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao salvar plano');
    },
  });

  const onSubmit = (data: PlanForm) => {
    mutation.mutate({
      ...data,
      price: Number(data.price),
      maxUsers: Number(data.maxUsers),
      maxUnits: Number(data.maxUnits),
      features,
    });
  };

  const addFeature = () => {
    if (!newFeatureKey.trim() || !newFeatureLabel.trim()) {
      toast.error('Informe a chave e o rótulo do recurso');
      return;
    }
    setFeatures((prev) => [
      ...prev,
      { featureKey: newFeatureKey.trim(), featureLabel: newFeatureLabel.trim(), enabled: true },
    ]);
    setNewFeatureKey('');
    setNewFeatureLabel('');
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <CossSpinner className="w-8 h-8 mb-3" />
        <p className="text-xs text-zinc-500">Carregando dados do plano...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/plans')}
            className="w-9 h-9 rounded-xl bg-white border border-zinc-200/80 shadow-2xs flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              {isEdit ? 'Editar Plano' : 'Criar Novo Plano'}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Defina os parâmetros comerciais, periodicidade e catálogo de recursos.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Section 1: Dados Comerciais */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 md:p-8 shadow-2xs space-y-5">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900">Informações Básicas & Precificação</h2>
            <p className="text-xs text-zinc-500">Identificação do plano no catálogo e valor cobrado.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <CossLabel required>Nome do Plano</CossLabel>
              <CossInput
                {...register('name', { required: 'Nome é obrigatório', minLength: 2 })}
                placeholder="Ex: Profissional, Starter, Enterprise"
                hasError={!!errors.name}
              />
              <span className="text-[11px] text-zinc-600">Nome exibido na tabela de preços.</span>
            </div>

            <div className="space-y-1.5">
              <CossLabel required>Slug (Identificador)</CossLabel>
              <CossInput
                {...register('slug', {
                  required: 'Slug é obrigatório',
                  pattern: { value: /^[a-z0-9-]+$/, message: 'Apenas letras minúsculas, números e hífens' },
                })}
                placeholder="ex: profissional"
                disabled={isEdit}
                hasError={!!errors.slug}
              />
              <span className="text-[11px] text-zinc-600">Identificador na URL e faturamento.</span>
            </div>

            <div className="space-y-1.5">
              <CossLabel required>Preço (em centavos)</CossLabel>
              <CossInput
                type="number"
                min={0}
                {...register('price', { valueAsNumber: true, required: true })}
                placeholder="Ex: 9900 para R$ 99,00"
                hasError={!!errors.price}
              />
              <span className="text-[11px] text-zinc-600">
                Valor mensal em centavos. Ex: 9900 = R$ 99,00.
              </span>
            </div>

            <div className="space-y-1.5">
              <CossLabel required>Ciclo de Faturamento</CossLabel>
              <select
                {...register('billingPeriod')}
                className="h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3.5 text-xs font-medium text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none"
              >
                <option value="MONTHLY">Mensal</option>
                <option value="YEARLY">Anual</option>
              </select>
              <span className="text-[11px] text-zinc-600">Periodicidade da cobrança gerada.</span>
            </div>

            <div className="space-y-1.5">
              <CossLabel required>Máx. Usuários por Assinante</CossLabel>
              <CossInput
                type="number"
                min={1}
                {...register('maxUsers', { valueAsNumber: true, required: true })}
              />
              <span className="text-[11px] text-zinc-600">Limite de membros na equipe do tenant.</span>
            </div>

            <div className="space-y-1.5">
              <CossLabel required>Máx. Unidades / Lojas</CossLabel>
              <CossInput
                type="number"
                min={1}
                {...register('maxUnits', { valueAsNumber: true, required: true })}
              />
              <span className="text-[11px] text-zinc-600">Filiais ou unidades operadas pelo tenant.</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <CossLabel>Descrição Comercial</CossLabel>
            <CossTextarea
              {...register('description')}
              rows={3}
              placeholder="Descreva para quem este plano é mais indicado..."
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
            <div>
              <span className="text-xs font-bold text-zinc-900 block">Visibilidade Pública</span>
              <p className="text-[11px] text-zinc-500">Exibir este plano no catálogo de contratação.</p>
            </div>
            <CossSwitch
              checked={isVisible}
              onCheckedChange={(val) => setValue('isVisible', val)}
            />
          </div>
        </div>

        {/* Section 2: Recursos Inclusos */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 md:p-8 shadow-2xs space-y-5">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900">Módulos & Funcionalidades Inclusas</h2>
            <p className="text-xs text-zinc-500">
              Controle granular dos recursos habilitados para os assinantes deste plano.
            </p>
          </div>

          <div className="space-y-2.5">
            {features.map((f, idx) => (
              <div
                key={`${f.featureKey}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-3.5 transition-all hover:bg-zinc-50"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => {
                      const next = [...features];
                      next[idx] = { ...f, enabled: e.target.checked };
                      setFeatures(next);
                    }}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 block">{f.featureLabel}</span>
                    <code className="text-[10.5px] font-mono text-zinc-600">{f.featureKey}</code>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFeatures((prev) => prev.filter((_, i) => i !== idx))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {features.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center">
                <Sparkles className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-zinc-500">
                  Nenhum recurso cadastrado para este plano.
                </p>
                <span className="text-[11px] text-zinc-600">
                  Adicione recursos no formulário abaixo.
                </span>
              </div>
            )}
          </div>

          {/* Add feature inputs */}
          <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 block mb-3">
              Adicionar Nova Funcionalidade
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <CossLabel>Chave Técnica (slug)</CossLabel>
                <CossInput
                  value={newFeatureKey}
                  onChange={(e) => setNewFeatureKey(e.target.value)}
                  placeholder="ex: whatsapp_bot, nfe_issue, crm"
                  className="mt-1"
                />
              </div>
              <div>
                <CossLabel>Rótulo Amigável</CossLabel>
                <CossInput
                  value={newFeatureLabel}
                  onChange={(e) => setNewFeatureLabel(e.target.value)}
                  placeholder="ex: Robô de WhatsApp Inteligente"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={addFeature}
                className="h-9 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Funcionalidade
              </Button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/plans')}
            className="h-10 px-5 rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-semibold shadow-2xs"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="h-10 px-6 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs"
          >
            {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Plano'}
          </Button>
        </div>
      </form>
    </div>
  );
};
