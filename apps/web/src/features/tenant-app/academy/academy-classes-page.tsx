import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Trash2, UserPlus, Check, X } from 'lucide-react';
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

const fmtDT = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const AcademyClassesPage: React.FC = () => {
  const { slug } = useTenant();
  useGymRealtime();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [bookFor, setBookFor] = useState<any>(null);
  const [bookStudent, setBookStudent] = useState('');
  const [form, setForm] = useState({
    title: '',
    coach: '',
    room: '',
    startsAt: toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    durationMin: '60',
    capacity: '20',
  });

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['gym-classes', slug],
    queryFn: () => apiGet('/gym/classes'),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['gym-students', slug, 'ALL'],
    queryFn: () => apiGet('/gym/students', { status: 'ALL' }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gym-classes', slug] });
    queryClient.invalidateQueries({ queryKey: ['gym-dashboard', slug] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost('/gym/classes', payload),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('Aula criada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao criar aula'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/gym/classes/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Aula excluída.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  const bookMutation = useMutation({
    mutationFn: ({ classId, studentId }: any) => apiPost(`/gym/classes/${classId}/book`, { studentId }),
    onSuccess: () => {
      invalidate();
      setBookFor(null);
      setBookStudent('');
      toast.success('Reserva feita!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao reservar'),
  });

  const presenceMutation = useMutation({
    mutationFn: ({ id, st }: any) => apiPatch(`/gym/bookings/${id}/status`, { status: st }),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao marcar presença'),
  });

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-orange-600" /> Aulas Coletivas
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Horários, professor, sala, vagas, reservas e presença.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-orange-600 hover:bg-orange-700">
          <Plus className="w-4 h-4 mr-2" /> Nova aula
        </Button>
      </div>

      {isLoading ? (
        <TableRowSkeleton />
      ) : classes.length === 0 ? (
        <ErpEmptyState icon={CalendarDays} title="Nenhuma aula" description="Crie a primeira aula coletiva." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {classes.map((c: any) => {
            const full = c.bookedCount >= c.capacity;
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-zinc-900">{c.title}</div>
                    <div className="text-[11px] text-zinc-500">
                      {fmtDT(c.startsAt)} • {c.durationMin} min{c.coach ? ` • Prof. ${c.coach}` : ''}{c.room ? ` • Sala ${c.room}` : ''}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500 min-w-[44px] min-h-[44px]" onClick={() => { if (window.confirm('Excluir esta aula?')) deleteMutation.mutate(c.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={full ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}>
                    {c.bookedCount}/{c.capacity} vagas
                  </Badge>
                  <Badge className="bg-sky-100 text-sky-800">{c.presentCount} presentes</Badge>
                  <Button size="sm" variant="outline" className="ml-auto min-h-[40px]" disabled={full} onClick={() => setBookFor(c)}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Reservar
                  </Button>
                </div>
                {(c.bookings || []).length > 0 && (
                  <div className="mt-3 space-y-1">
                    {c.bookings.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-2 text-xs bg-zinc-50 rounded-lg px-3 py-2">
                        <span className="flex-1 font-semibold">{b.student?.name}</span>
                        {b.status === 'RESERVADO' && (
                          <>
                            <button className="p-2 text-emerald-600 min-w-[40px] min-h-[40px]" title="Presente" onClick={() => presenceMutation.mutate({ id: b.id, st: 'PRESENTE' })}>
                              <Check className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-red-500 min-w-[40px] min-h-[40px]" title="Cancelar" onClick={() => presenceMutation.mutate({ id: b.id, st: 'CANCELADO' })}>
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {b.status !== 'RESERVADO' && <Badge className="text-[10px]">{b.status}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova aula coletiva</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Aula *</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Spinning, Cross, Zumba" />
            </div>
            <div>
              <label className="text-xs font-semibold">Professor</label>
              <Input value={form.coach} onChange={(e) => setForm({ ...form, coach: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Sala</label>
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Sala 1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Horário</label>
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Duração (min)</label>
              <Input value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs font-semibold">Vagas</label>
              <Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} inputMode="numeric" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={createMutation.isPending}
              onClick={() => {
                if (!form.title.trim()) return toast.error('Nome da aula é obrigatório');
                createMutation.mutate({ ...form, startsAt: new Date(form.startsAt).toISOString() });
              }}
            >
              Criar aula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bookFor)} onOpenChange={() => setBookFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reservar vaga — {bookFor?.title}</DialogTitle>
          </DialogHeader>
          <select value={bookStudent} onChange={(e) => setBookStudent(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
            <option value="">Selecione o aluno...</option>
            {(students || []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookFor(null)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={bookMutation.isPending || !bookStudent}
              onClick={() => bookMutation.mutate({ classId: bookFor.id, studentId: bookStudent })}
            >
              Confirmar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AcademyClassesPage;
