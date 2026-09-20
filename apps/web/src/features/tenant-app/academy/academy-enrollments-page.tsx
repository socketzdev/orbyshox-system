import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Pause, Play, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { useGymRealtime } from './use-gym-realtime';
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
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const inputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ST_CLS: Record<string, string> = {
  ATIVA: 'bg-emerald-100 text-emerald-800',
  PAUSADA: 'bg-zinc-200 text-zinc-700',
  CANCELADA: 'bg-red-100 text-red-700',
  EXPIRADA: 'bg-zinc-100 text-zinc-500',
};

export const AcademyEnrollmentsPage: React.FC = () => {
  const { slug } = useTenant();
  useGymRealtime();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    studentId: '',
    plan: 'Mensal Musculação',
    startDate: inputDate(new Date()),
    endDate: inputDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    price: '99,90',
    notes: '',
  });

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ['gym-enrollments', slug, status],
    queryFn: () => apiGet('/gym/enrollments', { status }),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['gym-students', slug, 'ALL'],
    queryFn: () => apiGet('/gym/students', { status: 'ALL' }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gym-enrollments', slug] });
    queryClient.invalidateQueries({ queryKey: ['gym-students', slug] });
    queryClient.invalidateQueries({ queryKey: ['gym-dashboard', slug] });
  };

  const parsePrice = (v: string) => {
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost('/gym/enrollments', payload),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('Matrícula criada e mensalidade lançada no Financeiro!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao matricular'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, st }: any) => apiPatch(`/gym/enrollments/${id}/status`, { status: st }),
    onSuccess: (_: any, vars: any) => {
      invalidate();
      toast.success(vars.st === 'PAUSADA' ? 'Matrícula pausada.' : vars.st === 'CANCELADA' ? 'Matrícula cancelada.' : 'Matrícula reativada.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao alterar matrícula'),
  });

  const renew = (e: any) => {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    setForm({
      studentId: e.studentId,
      plan: e.plan,
      startDate: inputDate(start),
      endDate: inputDate(end),
      price: (e.priceCents / 100).toFixed(2).replace('.', ','),
      notes: '',
    });
    setModalOpen(true);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-orange-600" /> Matrículas
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Nova matrícula, renovação, upgrade/downgrade, pausa e cancelamento.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-orange-600 hover:bg-orange-700">
          <Plus className="w-4 h-4 mr-2" /> Nova matrícula
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['ALL', 'ATIVA', 'PAUSADA', 'CANCELADA', 'EXPIRADA'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border min-h-[44px] ${status === s ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200'}`}
          >
            {s === 'ALL' ? 'Todas' : s.charAt(0) + s.slice(1).toLowerCase() + 's'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        {isLoading ? (
          <TableRowSkeleton />
        ) : enrollments.length === 0 ? (
          <ErpEmptyState icon={ClipboardList} title="Nenhuma matrícula" description="Crie a primeira matrícula do aluno." />
        ) : (
          <div className="divide-y divide-zinc-100">
            {enrollments.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-4 hover:bg-zinc-50/60 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-sm text-zinc-900">{e.student?.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {e.plan} • {fmtDate(e.startDate)} → {fmtDate(e.endDate)} • {brl(e.priceCents)}
                  </div>
                </div>
                <Badge className={ST_CLS[e.status] || 'bg-zinc-100 text-zinc-600'}>{e.status}</Badge>
                <div className="flex gap-1">
                  {e.status === 'ATIVA' && (
                    <>
                      <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" title="Pausar" onClick={() => statusMutation.mutate({ id: e.id, st: 'PAUSADA' })}>
                        <Pause className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] text-red-500" title="Cancelar" onClick={() => { if (window.confirm('Cancelar esta matrícula?')) statusMutation.mutate({ id: e.id, st: 'CANCELADA' }); }}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {e.status === 'PAUSADA' && (
                    <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] text-emerald-600" title="Reativar" onClick={() => statusMutation.mutate({ id: e.id, st: 'ATIVA' })}>
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" title="Renovar / trocar plano" onClick={() => renew(e)}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova matrícula</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Aluno *</label>
              <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">Selecione...</option>
                {(students || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} {s.planName ? `(${s.planName})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Plano *</label>
              <Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Mensal Musculação" />
            </div>
            <div>
              <label className="text-xs font-semibold">Início</label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Vencimento</label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Valor (R$)</label>
              <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="99,90" inputMode="decimal" />
            </div>
            <div>
              <label className="text-xs font-semibold">Observações</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Upgrade, desconto..." />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">A mensalidade é lançada automaticamente em Contas a Receber.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={createMutation.isPending}
              onClick={() => {
                if (!form.studentId) return toast.error('Selecione o aluno');
                if (!form.plan.trim()) return toast.error('Informe o plano');
                createMutation.mutate({
                  studentId: form.studentId,
                  plan: form.plan,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  priceCents: parsePrice(form.price),
                  notes: form.notes || undefined,
                });
              }}
            >
              Matricular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AcademyEnrollmentsPage;
