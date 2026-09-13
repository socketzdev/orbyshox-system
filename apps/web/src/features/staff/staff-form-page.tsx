import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CossInput, CossLabel, CossSpinner } from '@/components/coss-ui';
import { toast } from 'sonner';
import { ArrowLeft, User, Mail, Lock, Shield } from 'lucide-react';

const staffSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().optional(),
  role: z.string(),
});

type FormData = z.infer<typeof staffSchema>;

export function StaffFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => apiGet(`/staff/${id}`),
    enabled: Boolean(id),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(staffSchema as any),
    defaultValues: { role: 'SUPPORT_AGENT' },
  });

  useEffect(() => {
    if (data && id) {
      setValue('name', data.name);
      setValue('email', data.email);
      setValue('role', data.role);
    }
  }, [data, id, setValue]);

  const mutation = useMutation({
    mutationFn: (payload: FormData) => apiPatch(`/staff/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Operador atualizado com sucesso!');
      navigate('/staff');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao salvar operador');
    },
  });

  const onSubmit = (values: FormData) => {
    mutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <CossSpinner className="w-8 h-8 mb-3" />
        <p className="text-xs text-zinc-500">Carregando dados do membro...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/staff')}
          className="w-9 h-9 rounded-xl bg-white border border-zinc-200/80 shadow-2xs flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Editar Membro da Equipe
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Defina as informações de identificação, perfil de acesso e privilégios.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 md:p-8 shadow-2xs space-y-5">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900">Dados Pessoais & Credenciais</h2>
            <p className="text-xs text-zinc-500">Informações de login para acesso ao painel de administração.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <CossLabel required>Nome Completo</CossLabel>
              <CossInput
                {...register('name')}
                placeholder="Ex: João Silva"
                hasError={!!errors.name}
              />
              {errors.name && <span className="text-[11px] text-rose-500">{errors.name.message}</span>}
            </div>

            <div className="space-y-1.5">
              <CossLabel required>Endereço de E-mail</CossLabel>
              <CossInput
                type="email"
                {...register('email')}
                placeholder="operador@suaempresa.com"
                hasError={!!errors.email}
              />
              {errors.email && <span className="text-[11px] text-rose-500">{errors.email.message}</span>}
            </div>

            {!id && (
              <div className="space-y-1.5">
                <CossLabel required>Senha de Acesso Provisória</CossLabel>
                <CossInput
                  type="password"
                  {...register('password')}
                  placeholder="Mínimo 8 caracteres"
                  hasError={!!errors.password}
                />
                {errors.password && <span className="text-[11px] text-rose-500">{errors.password.message}</span>}
              </div>
            )}

            <div className="space-y-1.5 pt-2">
              <CossLabel required>Perfil / Nível de Acesso</CossLabel>
              <select
                {...register('role')}
                className="h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3.5 text-xs font-medium text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none"
              >
                <option value="SUPER_ADMIN">Super Administrador (Acesso Total)</option>
                <option value="SUPPORT_MANAGER">Gerente de Suporte</option>
                <option value="SUPPORT_AGENT">Atendente de Suporte</option>
                <option value="FINANCE">Financeiro</option>
                <option value="DEV">Desenvolvedor / Técnico</option>
              </select>
              <span className="text-[11px] text-zinc-600 block mt-1">
                Define quais áreas e ações este operador terá permissão para visualizar e executar.
              </span>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/staff')}
            className="h-10 px-5 rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-semibold shadow-2xs"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="h-10 px-6 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs"
          >
            {mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  );
}
