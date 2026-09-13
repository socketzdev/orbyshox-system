import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CossInput, CossLabel, CossSpinner } from '@/components/coss-ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const staffSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.string(),
});

type FormData = z.infer<typeof staffSchema>;

interface StaffFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StaffFormModal({ open, onOpenChange }: StaffFormModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(staffSchema as any),
    defaultValues: { role: 'SUPPORT_AGENT' },
  });

  useEffect(() => {
    if (open) {
      reset({ name: '', email: '', password: '', role: 'SUPPORT_AGENT' });
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (payload: FormData) => apiPost('/staff', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Novo membro cadastrado com sucesso!');
      onOpenChange(false);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao salvar operador');
    },
  });

  const onSubmit = (values: FormData) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Membro</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Defina as informações de identificação, perfil de acesso e privilégios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <CossLabel required>Nome Completo</CossLabel>
            <CossInput
              {...register('name')}
              placeholder="Ex: João Silva"
              hasError={!!errors.name}
            />
            {errors.name && (
              <span className="text-[11px] text-rose-500">{errors.name.message}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <CossLabel required>Endereço de E-mail</CossLabel>
            <CossInput
              type="email"
              {...register('email')}
              placeholder="operador@suaempresa.com"
              hasError={!!errors.email}
            />
            {errors.email && (
              <span className="text-[11px] text-rose-500">{errors.email.message}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <CossLabel required>Senha de Acesso Provisória</CossLabel>
            <CossInput
              type="password"
              {...register('password')}
              placeholder="Mínimo 8 caracteres"
              hasError={!!errors.password}
            />
            {errors.password && (
              <span className="text-[11px] text-rose-500">{errors.password.message}</span>
            )}
          </div>

          <div className="space-y-1.5">
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

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 px-5 rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-semibold shadow-2xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="h-10 px-6 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs"
            >
              {mutation.isPending ? 'Salvando...' : 'Cadastrar Membro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}