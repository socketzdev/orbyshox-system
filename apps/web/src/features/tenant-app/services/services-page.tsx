import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scissors, Plus, Pencil, Trash2, Clock, Power } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const parseBRLtoCents = (raw: string) => {
  const v = parseFloat((raw || '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : 0;
};

const fmtInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '');

/**
 * Catálogo de serviços da casa: é isto que o dono "libera" para o
 * agendamento online (preço e duração oficiais). O histórico de
 * agendamentos só complementa o que ainda não foi cadastrado aqui.
 */
export const ServicesPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('30');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: servicesData = [], isLoading } = useQuery({
    queryKey: ['tenant-services', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/services`),
    enabled: !!slug,
    refetchInterval: 30000,
  });
  const services: any[] = Array.isArray(servicesData) ? servicesData : [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tenant-services', slug] });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (payload.id) return apiPatch(`/tenant-app/${slug}/services/${payload.id}`, payload.body);
      return apiPost(`/tenant-app/${slug}/services`, payload.body);
    },
    onSuccess: () => {
      invalidate();
      setName('');
      setPrice('');
      setDuration('30');
      setEditingId(null);
      toast.success('Serviço salvo! Já aparece no link online.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar serviço'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/services/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Serviço removido do online.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao remover serviço'),
  });

  const toggleMutation = useMutation({
    mutationFn: (s: any) => apiPatch(`/tenant-app/${slug}/services/${s.id}`, { isActive: !(s.isActive !== false) }),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao atualizar serviço'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome do serviço');
    saveMutation.mutate({
      id: editingId || undefined,
      body: {
        name: name.trim(),
        priceCents: parseBRLtoCents(price),
        durationMin: Math.min(480, Math.max(5, parseInt(duration, 10) || 30)),
      },
    });
  };

  const startEdit = (s: any) => {
    setEditingId(s.id);
    setName(s.name || '');
    setPrice(fmtInput(Number(s.priceCents) || 0));
    setDuration(String(s.durationMin || 30));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setDuration('30');
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-black tracking-tight text-zinc-900 flex items-center gap-2">
          <Scissors className="w-5 h-5 text-emerald-600" />
          Serviços
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Cadastre os serviços com preço e duração — é isto que o cliente vê e agenda no link online.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold text-zinc-700">Nome do serviço *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Corte degradê, Instalação 9000 BTUs, Cartão de visita"
              className="h-11 text-sm rounded-xl mt-1"
              autoFocus={!!editingId}
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-zinc-700">Preço (R$)</Label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="h-11 text-sm font-mono rounded-xl mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-zinc-700">Duração (min)</Label>
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="30"
              inputMode="numeric"
              className="h-11 text-sm font-mono rounded-xl mt-1"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit} className="h-10 rounded-xl text-xs">
              Cancelar edição
            </Button>
          )}
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar serviço'}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl bg-white border border-zinc-200/80 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100 text-xs font-black uppercase tracking-wider text-zinc-500">
          {services.length} serviço(s) liberado(s) no online
        </div>
        {isLoading ? (
          <p className="p-6 text-center text-xs text-zinc-400">Carregando serviços...</p>
        ) : services.length === 0 ? (
          <div className="p-10 text-center">
            <Scissors className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
            <p className="text-sm font-bold text-zinc-700">Nenhum serviço cadastrado</p>
            <p className="text-xs text-zinc-400 mt-1">Cadastre acima: entra no link online na hora.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {services.map((s: any) => {
              const active = s.isActive !== false;
              return (
                <div key={s.id} className={`px-4 py-3 flex items-center gap-3 ${active ? '' : 'opacity-55'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-900 truncate">{s.name}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      {brl(s.priceCents)} · {s.durationMin || 30} min
                      {!active && ' · pausado'}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={active ? 'Pausar no online' : 'Liberar no online'}
                    onClick={() => toggleMutation.mutate(s)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition cursor-pointer ${
                      active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Editar"
                    onClick={() => startEdit(s)}
                    className="w-10 h-10 rounded-xl text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 flex items-center justify-center shrink-0 transition cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Excluir"
                    onClick={() => {
                      if (confirm(`Remover "${s.name}" do online?`)) deleteMutation.mutate(s.id);
                    }}
                    className="w-10 h-10 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServicesPage;
