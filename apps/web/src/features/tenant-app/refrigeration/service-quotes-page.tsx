import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) => `R$ ${((Number(cents) || 0) / 100).toFixed(2).replace('.', ',')}`;
const fmtDT = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const ST: Record<string, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800',
  APROVADO: 'bg-emerald-100 text-emerald-800',
  RECUSADO: 'bg-red-100 text-red-700',
  EXPIRADO: 'bg-zinc-200 text-zinc-600',
};

export const ServiceQuotesPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [schedFor, setSchedFor] = useState<any>(null);
  const [schedDate, setSchedDate] = useState('');
  const [schedTech, setSchedTech] = useState('');
  const [form, setForm] = useState({
    customerId: '', clientName: '', phone: '', address: '', equipmentDesc: '',
    labor: '', parts: '', travel: '', discount: '', validUntil: '', notes: '',
    scheduledAt: '', technicianId: '',
  });

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['service-quotes', slug, status],
    queryFn: () => apiGet('/service-orders/quotes', { status }),
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['service-technicians', slug],
    queryFn: () => apiGet('/service-orders/technicians'),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['tenant-customers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/customers`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['service-quotes', slug] });
    queryClient.invalidateQueries({ queryKey: ['service-orders', slug] });
    queryClient.invalidateQueries({ queryKey: ['service-dashboard', slug] });
  };

  const parseMoney = (v: string) => {
    const n = Number(String(v || '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost('/service-orders/quotes', payload),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('Orçamento criado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao criar orçamento'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, st, scheduledAt, technicianId, technicianName }: any) =>
      apiPatch(`/service-orders/quotes/${id}/status`, { status: st, scheduledAt, technicianId, technicianName }),
    onSuccess: (_: any, vars: any) => {
      invalidate();
      setSchedFor(null);
      toast.success(vars.st === 'APROVADO' ? 'Aprovado e agendado! OS criada na agenda.' : vars.st === 'PENDENTE' ? 'Visita reagendada.' : `Orçamento ${vars.st.toLowerCase()}.`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao atualizar orçamento'),
  });

  const toLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const openSchedule = (q: any) => {
    setSchedFor(q);
    setSchedDate(toLocalInput(q.scheduledAt) || toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()));
    setSchedTech(q.technicianId || '');
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-600" /> Orçamentos
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Mão de obra + peças + deslocamento − desconto. Aprovou, vira OS.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="w-4 h-4 mr-2" /> Criar orçamento
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['ALL', 'PENDENTE', 'APROVADO', 'RECUSADO', 'EXPIRADO'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border min-h-[44px] ${status === s ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200'}`}
          >
            {s === 'ALL' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        {isLoading ? (
          <TableRowSkeleton />
        ) : quotes.length === 0 ? (
          <ErpEmptyState icon={FileText} title="Nenhum orçamento" description="Crie o primeiro orçamento do cliente." />
        ) : (
          <div className="divide-y divide-zinc-100">
            {quotes.map((q: any) => (
              <div key={q.id} className="p-4 hover:bg-zinc-50/60">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold text-sm text-zinc-900">{q.clientName}</div>
                    <div className="text-[11px] text-zinc-500">
                      {q.equipmentDesc || 'Equipamento a verificar'} • MO {brl(q.laborCents)} + Peças {brl(q.partsCents)} + Desloc. {brl(q.travelCents)}{q.discountCents > 0 && ` − Desc. ${brl(q.discountCents)}`}
                    </div>
                  </div>
                  <div className="font-black text-sm">{brl(q.totalCents)}</div>
                  <Badge className={ST[q.status]}>{q.status}</Badge>
                  {q.scheduledAt && (
                    <Badge className="bg-sky-100 text-sky-800" title={q.technicianName ? `Técnico: ${q.technicianName}` : undefined}>
                      📅 {fmtDT(q.scheduledAt)}
                    </Badge>
                  )}
                  {q.status === 'PENDENTE' && (
                    <div className="flex gap-1">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[40px]" onClick={() => openSchedule(q)}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Aprovar e agendar
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => openSchedule(q)} title="Definir data da visita">
                        📅
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[40px] text-red-600" onClick={() => statusMutation.mutate({ id: q.id, st: 'RECUSADO' })}>
                        <X className="w-3.5 h-3.5 mr-1" /> Recusar
                      </Button>
                    </div>
                  )}
                </div>
                {q.notes && <div className="text-[11px] text-zinc-500 mt-1">📝 {q.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(schedFor)} onOpenChange={() => setSchedFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar e agendar — {schedFor?.clientName}</DialogTitle>
          </DialogHeader>
          <div className="text-xs font-bold text-zinc-700 mb-1">
            {brl(schedFor?.totalCents || 0)} • {schedFor?.equipmentDesc || 'Visita técnica'}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-semibold">Data e hora da visita *</label>
              <Input type="datetime-local" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold">Técnico</label>
              <select value={schedTech} onChange={(e) => setSchedTech(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">A definir...</option>
                {(technicians || []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">A OS nasce agendada e cai direto na agenda do técnico.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedFor(null)}>Cancelar</Button>
            <Button
              variant="outline"
              disabled={statusMutation.isPending}
              onClick={() => {
                if (!schedDate) return toast.error('Informe a data da visita');
                statusMutation.mutate({ id: schedFor.id, st: 'PENDENTE', scheduledAt: new Date(schedDate).toISOString(), technicianId: schedTech || undefined, technicianName: (technicians || []).find((t: any) => t.id === schedTech)?.name });
              }}
            >
              Só agendar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={statusMutation.isPending || !schedDate}
              onClick={() => {
                statusMutation.mutate({ id: schedFor.id, st: 'APROVADO', scheduledAt: new Date(schedDate).toISOString(), technicianId: schedTech || undefined, technicianName: (technicians || []).find((t: any) => t.id === schedTech)?.name });
              }}
            >
              Aprovar e agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar orçamento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Cliente *</label>
              <div className="flex gap-2">
                <select
                  value={form.customerId}
                  onChange={(e) => {
                    const c = (customers || []).find((x: any) => x.id === e.target.value);
                    setForm({ ...form, customerId: e.target.value, clientName: c?.name || '', phone: c?.phone || form.phone });
                  }}
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]"
                >
                  <option value="">Avulso / digitar...</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Nome do cliente" className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Válido até</label>
              <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Visita prevista</label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Técnico</label>
              <select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">A definir...</option>
                {(technicians || []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Equipamento</label>
              <Input value={form.equipmentDesc} onChange={(e) => setForm({ ...form, equipmentDesc: e.target.value })} placeholder="Split 12000 BTUs — sala" />
            </div>
            <div>
              <label className="text-xs font-semibold">Mão de obra (R$)</label>
              <Input value={form.labor} onChange={(e) => setForm({ ...form, labor: e.target.value })} placeholder="180,00" inputMode="decimal" />
            </div>
            <div>
              <label className="text-xs font-semibold">Peças (R$)</label>
              <Input value={form.parts} onChange={(e) => setForm({ ...form, parts: e.target.value })} placeholder="120,00" inputMode="decimal" />
            </div>
            <div>
              <label className="text-xs font-semibold">Deslocamento (R$)</label>
              <Input value={form.travel} onChange={(e) => setForm({ ...form, travel: e.target.value })} placeholder="30,00" inputMode="decimal" />
            </div>
            <div>
              <label className="text-xs font-semibold">Desconto (R$)</label>
              <Input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Observações</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700"
              disabled={createMutation.isPending}
              onClick={() => {
                if (!form.clientName.trim() && !form.customerId) return toast.error('Informe o cliente');
                createMutation.mutate({
                  customerId: form.customerId || undefined,
                  clientName: form.clientName,
                  phone: form.phone || undefined,
                  address: form.address || undefined,
                  equipmentDesc: form.equipmentDesc || undefined,
                  laborCents: parseMoney(form.labor),
                  partsCents: parseMoney(form.parts),
                  travelCents: parseMoney(form.travel),
                  discountCents: parseMoney(form.discount),
                  validUntil: form.validUntil || undefined,
                  scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
                  technicianId: form.technicianId || undefined,
                  technicianName: (technicians || []).find((t: any) => t.id === form.technicianId)?.name,
                  notes: form.notes || undefined,
                });
              }}
            >
              Salvar orçamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceQuotesPage;
