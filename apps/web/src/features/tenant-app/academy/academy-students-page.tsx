import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Search, Phone, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
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

const STATUS: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: 'Ativo', cls: 'bg-emerald-100 text-emerald-800' },
  PENDENTE: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800' },
  VENCIDO: { label: 'Vencido', cls: 'bg-red-100 text-red-800' },
  PAUSADO: { label: 'Pausado', cls: 'bg-zinc-200 text-zinc-700' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-500' },
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const AcademyStudentsPage: React.FC = () => {
  const { slug } = useTenant();
  useGymRealtime();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', document: '', birthDate: '', planName: '', notes: '' });

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['gym-students', slug, status],
    queryFn: () => apiGet('/gym/students', { status }),
  });

  const { data: studentDetail } = useQuery({
    queryKey: ['gym-student', slug, detail?.id],
    queryFn: () => apiGet(`/gym/students/${detail.id}`),
    enabled: Boolean(detail?.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gym-students', slug] });
    queryClient.invalidateQueries({ queryKey: ['gym-dashboard', slug] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing ? apiPatch(`/gym/students/${editing.id}`, payload) : apiPost('/gym/students', payload),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditing(null);
      toast.success(editing ? 'Aluno atualizado!' : 'Aluno cadastrado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar aluno'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/gym/students/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Aluno excluído.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, st }: any) => apiPatch(`/gym/students/${id}`, { status: st }),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao alterar status'),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', phone: '', email: '', document: '', birthDate: '', planName: '', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setForm({
      name: s.name || '',
      phone: s.phone || '',
      email: s.email || '',
      document: s.document || '',
      birthDate: s.birthDate ? String(s.birthDate).slice(0, 10) : '',
      planName: s.planName || '',
      notes: s.notes || '',
    });
    setModalOpen(true);
  };

  const filtered = useMemo(
    () =>
      (students || []).filter((s: any) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          s.name?.toLowerCase().includes(q) ||
          s.phone?.includes(search) ||
          s.email?.toLowerCase().includes(q)
        );
      }),
    [students, search],
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-600" /> Alunos
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Cadastro, busca, plano atual, vencimento e histórico.</p>
        </div>
        <Button onClick={openNew} className="bg-orange-600 hover:bg-orange-700">
          <UserPlus className="w-4 h-4 mr-2" /> Cadastrar aluno
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno por nome, telefone ou e-mail..." className="pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
          {['ALL', 'ATIVO', 'PENDENTE', 'VENCIDO', 'PAUSADO', 'CANCELADO'].map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'Todos os status' : STATUS[s]?.label || s}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        {isLoading ? (
          <TableRowSkeleton />
        ) : filtered.length === 0 ? (
          <ErpEmptyState icon={Users} title="Nenhum aluno encontrado" description="Cadastre o primeiro aluno da academia." />
        ) : (
          <div className="divide-y divide-zinc-100">
            {filtered.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4 hover:bg-zinc-50/60">
                <button onClick={() => setDetail(s)} className="w-10 h-10 rounded-full bg-orange-100 text-orange-800 font-black flex items-center justify-center shrink-0 min-w-[48px] min-h-[48px]">
                  {s.name?.charAt(0)?.toUpperCase()}
                </button>
                <button onClick={() => setDetail(s)} className="flex-1 min-w-0 text-left">
                  <div className="font-bold text-sm text-zinc-900 truncate">{s.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {s.planName || 'Sem plano'} • vence {fmtDate(s.dueDate)}
                    {s.phone && ` • ${s.phone}`}
                  </div>
                </button>
                <Badge className={STATUS[s.status]?.cls || 'bg-zinc-100 text-zinc-600'}>{STATUS[s.status]?.label || s.status}</Badge>
                <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={() => openEdit(s)} title="Editar">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] text-red-500" onClick={() => { if (window.confirm(`Excluir ${s.name}?`)) deleteMutation.mutate(s.id); }} title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cadastro / edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar aluno' : 'Cadastrar aluno'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Nome completo *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Carlos Silva" />
            </div>
            <div>
              <label className="text-xs font-semibold">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="text-xs font-semibold">E-mail</label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="aluno@email.com" />
            </div>
            <div>
              <label className="text-xs font-semibold">Documento</label>
              <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} placeholder="CPF" />
            </div>
            <div>
              <label className="text-xs font-semibold">Nascimento</label>
              <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Plano atual</label>
              <Input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} placeholder="Ex: Mensal Musculação" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Observações</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Restrições, objetivos..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={saveMutation.isPending}
              onClick={() => {
                if (!form.name.trim()) return toast.error('Nome é obrigatório');
                saveMutation.mutate({ ...form, birthDate: form.birthDate || undefined });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ficha do aluno */}
      <Dialog open={Boolean(detail)} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detail?.name}</span>
              <button onClick={() => setDetail(null)} className="p-2"><X className="w-4 h-4" /></button>
            </DialogTitle>
          </DialogHeader>
          {studentDetail ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-50 rounded-xl p-3">
                  <div className="text-[11px] text-zinc-500">Status</div>
                  <div className="font-bold">{STATUS[studentDetail.status]?.label || studentDetail.status}</div>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <div className="text-[11px] text-zinc-500">Vencimento</div>
                  <div className="font-bold">{fmtDate(studentDetail.dueDate)}</div>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <div className="text-[11px] text-zinc-500">Plano</div>
                  <div className="font-bold">{studentDetail.planName || '—'}</div>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <div className="text-[11px] text-zinc-500">Telefone</div>
                  <div className="font-bold flex items-center gap-1"><Phone className="w-3 h-3" />{studentDetail.phone || '—'}</div>
                </div>
              </div>
              {studentDetail.notes && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">📝 {studentDetail.notes}</div>}
              <div>
                <div className="font-bold text-xs mb-2">Histórico de matrículas ({studentDetail.enrollments?.length || 0})</div>
                <div className="space-y-1">
                  {(studentDetail.enrollments || []).map((e: any) => (
                    <div key={e.id} className="flex justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2">
                      <span>{e.plan} • {fmtDate(e.startDate)} → {fmtDate(e.endDate)}</span>
                      <Badge className="text-[10px]">{e.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-bold text-xs mb-2">Últimos acessos</div>
                <div className="space-y-1">
                  {(studentDetail.checkIns || []).slice(0, 8).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2">
                      <span>{new Date(c.createdAt).toLocaleString('pt-BR')} • {c.method === 'QR_CODE' ? 'QR Code' : 'Manual'}</span>
                      {c.blocked && <Badge className="bg-red-100 text-red-700 text-[10px]">Bloqueado</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['ATIVO', 'PAUSADO', 'CANCELADO'].filter((st) => st !== studentDetail.status).map((st) => (
                  <Button key={st} variant="outline" size="sm" onClick={() => { statusMutation.mutate({ id: studentDetail.id, st }); setDetail(null); }}>
                    Marcar {STATUS[st].label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Carregando ficha...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AcademyStudentsPage;
