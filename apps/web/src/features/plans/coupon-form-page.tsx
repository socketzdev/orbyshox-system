import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export const CouponFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      code: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 0,
      maxUses: undefined as number | undefined,
      validUntil: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      apiPost('/coupons', {
        ...data,
        discountValue: Number(data.discountValue),
        maxUses: data.maxUses ? Number(data.maxUses) : undefined,
        validUntil: data.validUntil || undefined,
      }),
    onSuccess: () => {
      toast.success('Cupom criado');
      navigate('/coupons');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao criar cupom');
    },
  });

  const onSubmit = (data: any) => mutation.mutate(data);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Novo Cupom</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Cupons podem ser percentuais ou valores fixos em centavos.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60">
        <Field label="Código">
          <Input
            {...register('code', { required: true, minLength: 3, maxLength: 20, pattern: { value: /^[A-Z0-9-]+$/, message: 'Maiúsculas, números e hífens' } })}
            placeholder="BEMVINDO10"
            style={{ textTransform: 'uppercase' }}
          />
        </Field>
        <Field label="Descrição">
          <Textarea {...register('description')} rows={2} />
        </Field>
        <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
          <Field label="Tipo de desconto">
            <select
              {...register('discountType')}
              className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="PERCENTAGE">Percentual (%)</option>
              <option value="FIXED_AMOUNT">Valor fixo (centavos)</option>
            </select>
          </Field>
          <Field label="Valor do desconto">
            <Input type="number" min={1} {...register('discountValue', { valueAsNumber: true, required: true })} />
          </Field>
          <Field label="Limite de usos (opcional)">
            <Input type="number" min={1} {...register('maxUses', { valueAsNumber: true })} />
          </Field>
          <Field label="Expira em (opcional)">
            <Input type="date" {...register('validUntil')} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Criando...' : 'Criar cupom'}
          </Button>
        </div>
      </form>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</Label>
      {children}
    </div>
  );
}
