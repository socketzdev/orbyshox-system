import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AirVent, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

const TYPES = ['SPLIT', 'JANELA', 'PORTATIL', 'GELADEIRA', 'FREEZER', 'BEBEDOURO', 'CAMARA_FRIA', 'OUTRO'];

export const ServiceEquipmentPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: '', clientName: '', type: 'SPLIT', brand: '', model: '', capacity: '', location: '', notes: '',
  });

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['service-equipment', slug],
    queryFn: () => apiGet('/service-orders/equipment'),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['tenant-customers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/customers`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['service-equipment', slug] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost('/service-orders/equipment', payload),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('Equipamento cadastrado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao cadastrar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/service-orders/equipment/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Equipamento excluído.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <AirVent className="w-5 h-5 text-sky-600" /> Equipamentos dos Clientes
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Parque instalado: marca, modelo, capacidade e onde está.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="w-4 h-4 mr-2" /> Cadastrar equipamento
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        {isLoading ? (
          <TableRowSkeleton />
        ) : equipment.length === 0 ? (
          <ErpEmptyState icon={AirVent} title="Nenhum equipamento" description="Cadastre os aparelhos dos clientes." />
        ) : (
          <div className="divide-y divide-zinc-100">
            {equipment.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-4 hover:bg-zinc-50/60">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-zinc-900">
                    {e.type} {e.brand || ''} {e.model || ''} {e.capacity || ''}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {e.customer?.name || e.clientName || 'Sem cliente'}
                    {e.location ? ` • ${e.location}` : ''}
                    {typeof e._count?.orders === 'number' ? ` • ${e._count.orders} OS` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] text-red-500" onClick={() => { if (window.confirm('Excluir equipamento?')) deleteMutation.mutate(e.id); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar equipamento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold">Cliente</label>
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">Avulso...</option>
                {(customers || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Nome (avulso)</label>
              <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Dono do aparelho" />
            </div>
            <div>
              <label className="text-xs font-semibold">Tipo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase().replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Marca</label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Samsung, LG, Electrolux..." />
            </div>
            <div>
              <label className="text-xs font-semibold">Modelo</label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Capacidade</label>
              <Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="12000 BTUs" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Onde está instalado</label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Rua, número, bairro" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Observações</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button className="bg-sky-600 hover:bg-sky-700" disabled={createMutation.isPending} onClick={() => createMutation.mutate({ ...form, customerId: form.customerId || undefined })}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceEquipmentPage;
