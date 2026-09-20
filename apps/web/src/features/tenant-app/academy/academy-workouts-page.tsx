import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dumbbell,
  Plus,
  Trash2,
  Play,
  Pencil,
  ArrowUp,
  ArrowDown,
  X,
  Library,
  ClipboardList,
  Sparkles,
  Upload,
  CalendarDays,
  Copy,
} from 'lucide-react';
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

const WEEK_DAYS = [
  { key: 'SEG', label: 'Segunda' },
  { key: 'TER', label: 'Terça' },
  { key: 'QUA', label: 'Quarta' },
  { key: 'QUI', label: 'Quinta' },
  { key: 'SEX', label: 'Sexta' },
  { key: 'SAB', label: 'Sábado' },
  { key: 'DOM', label: 'Domingo' },
];

const MUSCLE_GROUPS = [
  'QUADRICEPS', 'POSTERIOR', 'GLUTEO', 'PEITORAL', 'COSTAS', 'OMBRO',
  'BICEPS', 'TRICEPS', 'ABDOMEN', 'PANTURRILHA', 'ANTEBRACO', 'CARDIO', 'CORPO_INTEIRO', 'OUTRO',
];

const muscleLabel = (g: string) => {
  const map: Record<string, string> = {
    QUADRICEPS: 'Quadríceps', POSTERIOR: 'Posterior', GLUTEO: 'Glúteo', PEITORAL: 'Peitoral',
    COSTAS: 'Costas', OMBRO: 'Ombro', BICEPS: 'Bíceps', TRICEPS: 'Tríceps', ABDOMEN: 'Abdômen',
    PANTURRILHA: 'Panturrilha', ANTEBRACO: 'Antebraço', CARDIO: 'Cardio', CORPO_INTEIRO: 'Corpo inteiro', OUTRO: 'Outro',
  };
  return map[g] || g;
};

const dayLabel = (d?: string | null) => WEEK_DAYS.find((w) => w.key === d)?.label || '—';

/** Extrai o ID de URLs watch / youtu.be / embed / shorts para o player. */
function youtubeId(url: string): string | null {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  return m ? m[1] : null;
}

function VideoModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const yt = youtubeId(url);
  const isGif = /\.gif(\?|$)/i.test(url);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full bg-black rounded-xl overflow-hidden">
          {yt ? (
            <iframe
              src={`https://www.youtube.com/embed/${yt}`}
              title={title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : isGif ? (
            <img src={url} alt={title} className="w-full h-full object-contain" />
          ) : (
            <video src={url} controls playsInline className="w-full h-full">
              Seu navegador não reproduz vídeo.
            </video>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BuilderItem {
  exerciseId: string;
  name: string;
  equipment?: string | null;
  mediaUrl?: string | null;
  sets: string;
  reps: string;
  load: string;
  restSeconds: string;
  notes: string;
}

export const AcademyWorkoutsPage: React.FC = () => {
  const { slug } = useTenant();
  useGymRealtime();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'sheets' | 'library' | 'week'>('sheets');

  // Fichas
  const [studentFilter, setStudentFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('ALL');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingSheet, setEditingSheet] = useState<any>(null);
  const [sheetForm, setSheetForm] = useState({ studentId: '', title: '', dayOfWeek: 'SEG', coach: '', validUntil: '', notes: '' });
  const [builderItems, setBuilderItems] = useState<BuilderItem[]>([]);
  const [libSearch, setLibSearch] = useState('');

  // Biblioteca
  const [exSearch, setExSearch] = useState('');
  const [exGroup, setExGroup] = useState('ALL');
  const [exModal, setExModal] = useState(false);
  const [editingEx, setEditingEx] = useState<any>(null);
  const [exForm, setExForm] = useState({ name: '', equipment: '', muscleGroup: 'QUADRICEPS', mediaUrl: '', notes: '' });

  // Vídeo
  const [video, setVideo] = useState<{ url: string; title: string } | null>(null);

  // ─── Seleção em lote (candidatos após a query `library`) ───
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchGroup, setBatchGroup] = useState('ALL');
  const [batchSelected, setBatchSelected] = useState<string[]>([]);

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ['gym-workouts', slug, studentFilter, dayFilter],
    queryFn: () =>
      apiGet('/gym/workouts', {
        ...(studentFilter ? { studentId: studentFilter } : {}),
        ...(dayFilter !== 'ALL' ? { dayOfWeek: dayFilter } : {}),
      }),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['gym-students', slug, 'ALL'],
    queryFn: () => apiGet('/gym/students', { status: 'ALL' }),
  });

  const { data: library = [], isLoading: libLoading } = useQuery({
    queryKey: ['gym-exercises', slug, exSearch, exGroup],
    queryFn: () =>
      apiGet('/gym/exercises', {
        ...(exSearch ? { search: exSearch } : {}),
        ...(exGroup !== 'ALL' ? { muscleGroup: exGroup } : {}),
      }),
    enabled: tab === 'library' || builderOpen,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['gym-workouts', slug] });
    queryClient.invalidateQueries({ queryKey: ['gym-exercises', slug] });
  };

  // Candidatos do lote: biblioteca filtrada por grupo + busca.
  const batchCandidates = (library || []).filter((ex: any) => {
    if (batchGroup !== 'ALL' && ex.muscleGroup !== batchGroup) return false;
    if (!batchSearch.trim()) return true;
    const q = batchSearch.toLowerCase();
    return ex.name?.toLowerCase().includes(q) || ex.equipment?.toLowerCase().includes(q);
  });

  const confirmBatch = () => {
    const fresh = (library || []).filter(
      (ex: any) => batchSelected.includes(ex.id) && !builderItems.some((i) => i.exerciseId === ex.id),
    );
    if (fresh.length === 0) {
      toast.error('Nada novo para adicionar (já estão na ficha ou nada marcado).');
      return;
    }
    setBuilderItems([
      ...builderItems,
      ...fresh.map((ex: any) => ({
        exerciseId: ex.id,
        name: ex.name,
        equipment: ex.equipment,
        mediaUrl: ex.mediaUrl,
        sets: '3',
        reps: '12',
        load: '',
        restSeconds: '60',
        notes: '',
      })),
    ]);
    setBatchOpen(false);
    setBatchSelected([]);
    toast.success(`${fresh.length} exercício(s) na ficha — ajuste séries/reps/descanso.`);
  };

  // ─── Biblioteca: mutations ───
  const exMutation = useMutation({
    mutationFn: (payload: any) =>
      editingEx ? apiPatch(`/gym/exercises/${editingEx.id}`, payload) : apiPost('/gym/exercises', payload),
    onSuccess: () => {
      invalidateAll();
      setExModal(false);
      setEditingEx(null);
      toast.success(editingEx ? 'Exercício atualizado!' : 'Exercício cadastrado na biblioteca!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar exercício'),
  });

  const exDelete = useMutation({
    mutationFn: (id: string) => apiDelete(`/gym/exercises/${id}`),
    onSuccess: () => {
      invalidateAll();
      toast.success('Exercício removido da biblioteca.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  const seedMutation = useMutation({
    mutationFn: () => apiPost('/gym/exercises/seed-defaults', {}),
    onSuccess: (res: any) => {
      invalidateAll();
      toast.success(`${res?.seeded || 30} movimentos carregados na biblioteca!`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao carregar base'),
  });

  const fillMediaMutation = useMutation({
    mutationFn: () => apiPost('/gym/exercises/fill-media', {}),
    onSuccess: (res: any) => {
      invalidateAll();
      toast.success(res?.filled > 0 ? `${res.filled} GIFs vinculados!` : 'Tudo já tem GIF.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao vincular GIFs'),
  });

  const importDatasetMutation = useMutation({
    mutationFn: () => apiPost('/gym/exercises/import-dataset', {}),
    onSuccess: (res: any) => {
      invalidateAll();
      toast.success(res?.imported > 0 ? `${res.imported} exercícios importados com GIF!` : 'Biblioteca já completa.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao importar dataset'),
  });

  // ─── Fichas: mutations ───
  const sheetMutation = useMutation({
    mutationFn: (payload: any) =>
      editingSheet ? apiPatch(`/gym/workouts/${editingSheet.id}`, payload) : apiPost('/gym/workouts', payload),
    onSuccess: () => {
      invalidateAll();
      setBuilderOpen(false);
      setEditingSheet(null);
      toast.success(editingSheet ? 'Ficha atualizada!' : 'Ficha montada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar ficha'),
  });

  const sheetDelete = useMutation({
    mutationFn: (id: string) => apiDelete(`/gym/workouts/${id}`),
    onSuccess: () => {
      invalidateAll();
      toast.success('Ficha excluída.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  // ─── Programação semanal ───
  const [weekStudent, setWeekStudent] = useState('');

  const { data: weekSheets = [] } = useQuery({
    queryKey: ['gym-workouts-week', slug, weekStudent],
    queryFn: () => apiGet('/gym/workouts', { studentId: weekStudent }),
    enabled: tab === 'week' && Boolean(weekStudent),
  });

  const patchDayMutation = useMutation({
    mutationFn: ({ id, day }: any) => apiPatch(`/gym/workouts/${id}`, { dayOfWeek: day }),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['gym-workouts-week', slug] });
      toast.success('Dia atualizado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao mover ficha'),
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, day }: any) => apiPost(`/gym/workouts/${id}/duplicate`, { dayOfWeek: day }),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['gym-workouts-week', slug] });
      toast.success('Ficha duplicada para o dia!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao duplicar'),
  });

  /** Foco muscular do dia a partir dos itens (ex: Bíceps + Tríceps). */
  const dayFocus = (sheets: any[]): string[] => {
    const count: Record<string, number> = {};
    for (const w of sheets) {
      for (const it of w.items || []) {
        const g = it.exercise?.muscleGroup;
        if (g) count[g] = (count[g] || 0) + 1;
      }
    }
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([g]) => muscleLabel(g));
  };

  // ─── Montador ───
  const openNewSheet = (presetStudent = '', presetDay = 'SEG') => {
    setEditingSheet(null);
    setSheetForm({
      studentId: presetStudent || studentFilter || '',
      title: '',
      dayOfWeek: presetDay,
      coach: '',
      validUntil: '',
      notes: '',
    });
    setBuilderItems([]);
    setLibSearch('');
    setBuilderOpen(true);
  };

  const openEditSheet = (w: any) => {
    setEditingSheet(w);
    setSheetForm({
      studentId: w.studentId,
      title: w.title,
      dayOfWeek: w.dayOfWeek || 'SEG',
      coach: w.coach || '',
      validUntil: w.validUntil ? String(w.validUntil).slice(0, 10) : '',
      notes: w.notes || '',
    });
    setBuilderItems(
      (w.items || []).map((it: any) => ({
        exerciseId: it.exerciseId,
        name: it.exercise?.name || 'Exercício',
        equipment: it.exercise?.equipment,
        mediaUrl: it.exercise?.mediaUrl,
        sets: String(it.sets),
        reps: String(it.reps),
        load: it.load || '',
        restSeconds: it.restSeconds !== null && it.restSeconds !== undefined ? String(it.restSeconds) : '',
        notes: it.notes || '',
      })),
    );
    setLibSearch('');
    setBuilderOpen(true);
  };

  const addToSheet = (ex: any) => {
    if (builderItems.some((i) => i.exerciseId === ex.id)) return toast.error('Exercício já está na ficha.');
    setBuilderItems([
      ...builderItems,
      {
        exerciseId: ex.id,
        name: ex.name,
        equipment: ex.equipment,
        mediaUrl: ex.mediaUrl,
        sets: '3',
        reps: '12',
        load: '',
        restSeconds: '60',
        notes: '',
      },
    ]);
  };

  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= builderItems.length) return;
    const next = [...builderItems];
    [next[i], next[j]] = [next[j], next[i]];
    setBuilderItems(next);
  };

  const saveSheet = () => {
    if (!sheetForm.studentId) return toast.error('Selecione o aluno');
    if (!sheetForm.title.trim()) return toast.error('Título é obrigatório (ex: Treino A — Pernas)');
    if (builderItems.length === 0) return toast.error('Adicione ao menos 1 exercício');
    for (let i = 0; i < builderItems.length; i++) {
      const it = builderItems[i];
      const reps = Number(it.reps);
      const sets = Number(it.sets);
      if (!Number.isFinite(sets) || sets < 1 || sets > 20) {
        return toast.error(`"${it.name}": séries entre 1 e 20.`);
      }
      if (!Number.isFinite(reps) || reps < 0 || reps > 40) {
        return toast.error(`"${it.name}": repetições entre 0 e 40.`);
      }
    }
    sheetMutation.mutate({
      studentId: sheetForm.studentId,
      title: sheetForm.title,
      dayOfWeek: sheetForm.dayOfWeek,
      coach: sheetForm.coach || undefined,
      validUntil: sheetForm.validUntil || undefined,
      notes: sheetForm.notes || undefined,
      items: builderItems.map((it) => ({
        exerciseId: it.exerciseId,
        sets: Number(it.sets),
        reps: Number(it.reps),
        load: it.load || undefined,
        restSeconds: it.restSeconds === '' ? undefined : Number(it.restSeconds),
        notes: it.notes || undefined,
      })),
    });
  };

  const openNewExercise = () => {
    setEditingEx(null);
    setExForm({ name: '', equipment: '', muscleGroup: 'QUADRICEPS', mediaUrl: '', notes: '' });
    setExModal(true);
  };

  const openEditExercise = (ex: any) => {
    setEditingEx(ex);
    setExForm({
      name: ex.name,
      equipment: ex.equipment || '',
      muscleGroup: ex.muscleGroup,
      mediaUrl: ex.mediaUrl || '',
      notes: ex.notes || '',
    });
    setExModal(true);
  };

  const libCandidates = (library || []).filter((ex: any) => {
    if (!libSearch.trim()) return true;
    const q = libSearch.toLowerCase();
    return ex.name?.toLowerCase().includes(q) || ex.equipment?.toLowerCase().includes(q);
  }).slice(0, 8);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-orange-600" /> Fichas de Treino
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Biblioteca de movimentos com vídeo + fichas por aluno e dia.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('sheets')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold min-h-[44px] ${tab === 'sheets' ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-600'}`}
          >
            <ClipboardList className="w-4 h-4" /> Fichas
          </button>
          <button
            onClick={() => setTab('library')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold min-h-[44px] ${tab === 'library' ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-600'}`}
          >
            <Library className="w-4 h-4" /> Biblioteca
          </button>
          <button
            onClick={() => setTab('week')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold min-h-[44px] ${tab === 'week' ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-600'}`}
          >
            <CalendarDays className="w-4 h-4" /> Semana
          </button>
        </div>
      </div>

      {tab === 'sheets' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px] flex-1">
              <option value="">Todos os alunos</option>
              {(students || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
              <option value="ALL">Todos os dias</option>
              {WEEK_DAYS.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <Button onClick={() => openNewSheet()} className="bg-orange-600 hover:bg-orange-700 min-h-[48px]">
              <Plus className="w-4 h-4 mr-2" /> Montar ficha
            </Button>
          </div>

          {isLoading ? (
            <TableRowSkeleton />
          ) : workouts.length === 0 ? (
            <ErpEmptyState icon={Dumbbell} title="Nenhuma ficha" description="Monte a primeira ficha de treino do aluno." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {workouts.map((w: any) => (
                <div key={w.id} className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black text-zinc-900">{w.title}</div>
                      <div className="text-[11px] text-zinc-500">
                        {w.student?.name}{w.dayOfWeek ? ` • ${dayLabel(w.dayOfWeek)}` : ''}{w.coach ? ` • Prof. ${w.coach}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={() => openEditSheet(w)} title="Editar ficha">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 min-w-[44px] min-h-[44px]" onClick={() => { if (window.confirm('Excluir esta ficha?')) sheetDelete.mutate(w.id); }} title="Excluir ficha">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(w.items || []).length === 0 && <div className="text-xs text-zinc-400">Ficha legada sem itens vinculados.</div>}
                    {(w.items || []).map((it: any, i: number) => (
                      <div key={it.id} className="bg-zinc-50 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-zinc-900 text-white text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-xs truncate">{it.exercise?.name}</div>
                            <div className="text-[11px] text-zinc-500">{it.exercise?.equipment || muscleLabel(it.exercise?.muscleGroup)}</div>
                          </div>
                          {it.exercise?.mediaUrl && (
                            <button
                              onClick={() => setVideo({ url: it.exercise.mediaUrl, title: it.exercise.name })}
                              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-red-600 text-white text-[11px] font-bold min-h-[40px]"
                              title="Ver execução"
                            >
                              <Play className="w-3.5 h-3.5" /> Vídeo
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                          <Badge className="bg-zinc-900 text-white">{it.sets} × {it.reps}</Badge>
                          {it.load && <span className="text-zinc-600 font-semibold">{it.load}</span>}
                          {it.restSeconds !== null && it.restSeconds !== undefined && <span className="text-zinc-400">desc. {it.restSeconds}s</span>}
                        </div>
                        {it.notes && <div className="text-[11px] text-amber-700 mt-1">💡 {it.notes}</div>}
                      </div>
                    ))}
                  </div>
                  {w.notes && <div className="text-[11px] text-zinc-500 mt-2">📝 {w.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'library' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input value={exSearch} onChange={(e) => setExSearch(e.target.value)} placeholder="Buscar movimento ou aparelho..." className="flex-1" />
            <select value={exGroup} onChange={(e) => setExGroup(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
              <option value="ALL">Todos os grupos</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>{muscleLabel(g)}</option>
              ))}
            </select>
            {(library || []).length === 0 && !libLoading ? (
              <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 min-h-[48px]">
                <Sparkles className="w-4 h-4 mr-2" /> Carregar base (30)
              </Button>
            ) : (
              <>
                {(library || []).some((ex: any) => !ex.mediaUrl) && (
                  <Button onClick={() => fillMediaMutation.mutate()} disabled={fillMediaMutation.isPending} variant="outline" className="min-h-[48px]">
                    <Play className="w-4 h-4 mr-2" /> Preencher GIFs
                  </Button>
                )}
                <Button onClick={() => importDatasetMutation.mutate()} disabled={importDatasetMutation.isPending} variant="outline" className="min-h-[48px]" title="Importa os 1300+ movimentos do dataset com GIF">
                  <Library className="w-4 h-4 mr-2" /> Dataset completo
                </Button>
                <Button onClick={openNewExercise} className="bg-orange-600 hover:bg-orange-700 min-h-[48px]">
                  <Plus className="w-4 h-4 mr-2" /> Novo movimento
                </Button>
              </>
            )}
          </div>

          {libLoading ? (
            <TableRowSkeleton />
          ) : (library || []).length === 0 ? (
            <ErpEmptyState icon={Library} title="Biblioteca vazia" description="Carregue a base com 30 movimentos ou cadastre o primeiro." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(library || []).map((ex: any) => (
                <div key={ex.id} className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-zinc-900">{ex.name}</div>
                      <div className="text-[11px] text-zinc-500">{ex.equipment || '—'}</div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800 text-[10px] shrink-0">{muscleLabel(ex.muscleGroup)}</Badge>
                  </div>
                  {ex.mediaUrl && /\.gif(\?|$)/i.test(ex.mediaUrl) && (
                    <button onClick={() => setVideo({ url: ex.mediaUrl, title: ex.name })} className="block w-full mt-2" title="Ampliar execução">
                      <img src={ex.mediaUrl} alt={`Execução de ${ex.name}`} loading="lazy" className="w-full h-28 object-cover rounded-xl border" />
                    </button>
                  )}
                  <div className="flex gap-1.5 mt-3">
                    {ex.mediaUrl && (
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 min-h-[40px]" onClick={() => setVideo({ url: ex.mediaUrl, title: ex.name })}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Ver
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => openEditExercise(ex)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="min-h-[40px] text-red-500" onClick={() => { if (window.confirm(`Remover "${ex.name}" da biblioteca?`)) exDelete.mutate(ex.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'week' && (
        <>
          <div>
            <select value={weekStudent} onChange={(e) => setWeekStudent(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px] w-full sm:w-80">
              <option value="">Selecione o aluno...</option>
              {(students || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {!weekStudent ? (
            <ErpEmptyState icon={CalendarDays} title="Programe a semana" description="Escolha o aluno para montar Seg a Dom: cada dia com seu treino." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {WEEK_DAYS.map((d) => {
                const sheets = (weekSheets || []).filter((w: any) => w.dayOfWeek === d.key);
                const focus = dayFocus(sheets);
                const loose = (weekSheets || []).filter((w: any) => !w.dayOfWeek);
                return (
                  <div key={d.key} className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-black text-sm text-zinc-900">{d.label}</div>
                      {focus.length > 0 && (
                        <div className="flex gap-1">
                          {focus.map((f) => (
                            <Badge key={f} className="bg-orange-100 text-orange-800 text-[10px]">{f}</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {sheets.length === 0 ? (
                      <div className="text-center py-4">
                        <div className="text-xs text-zinc-400 mb-3">Descanso ou sem treino</div>
                        <div className="flex flex-col gap-2">
                          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 min-h-[44px]" onClick={() => openNewSheet(weekStudent, d.key)}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Nova ficha
                          </Button>
                          {loose.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => { if (e.target.value) patchDayMutation.mutate({ id: e.target.value, day: d.key }); }}
                              className="px-2 py-2 rounded-xl border border-zinc-200 text-xs bg-white min-h-[44px]"
                            >
                              <option value="">Usar ficha sem dia...</option>
                              {loose.map((w: any) => (
                                <option key={w.id} value={w.id}>{w.title}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {sheets.map((w: any) => {
                          const n = (w.items || []).length;
                          return (
                            <div key={w.id} className="bg-zinc-50 rounded-xl p-3">
                              <div className="font-bold text-xs truncate">{w.title}</div>
                              <div className="text-[11px] text-zinc-500">{n} exercício(s){w.coach ? ` • ${w.coach}` : ''}</div>
                              <div className="flex items-center gap-1 mt-2 flex-wrap">
                                <button onClick={() => openEditSheet(w)} className="inline-flex items-center gap-1 px-2 py-2 rounded-lg bg-white border border-zinc-200 text-[11px] font-bold min-h-[40px]" title="Editar ficha">
                                  <Pencil className="w-3.5 h-3.5" /> Editar
                                </button>
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) duplicateMutation.mutate({ id: w.id, day: e.target.value }); }}
                                  className="px-2 py-2 rounded-lg bg-white border border-zinc-200 text-[11px] font-bold min-h-[40px]"
                                  title="Repetir em outro dia"
                                >
                                  <option value="">Repetir...</option>
                                  {WEEK_DAYS.filter((x) => x.key !== d.key).map((x) => (
                                    <option key={x.key} value={x.key}>{x.label}</option>
                                  ))}
                                </select>
                                <button onClick={() => patchDayMutation.mutate({ id: w.id, day: null })} className="inline-flex items-center gap-1 px-2 py-2 rounded-lg bg-white border border-zinc-200 text-[11px] font-bold text-zinc-500 min-h-[40px]" title="Tirar do dia">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <Button size="sm" variant="outline" className="w-full min-h-[44px]" onClick={() => openNewSheet(weekStudent, d.key)}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Outra ficha no dia
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {(() => {
                const loose = (weekSheets || []).filter((w: any) => !w.dayOfWeek);
                if (loose.length === 0) return null;
                return (
                  <div className="bg-zinc-50 rounded-2xl border border-dashed border-zinc-300 p-4">
                    <div className="font-black text-sm text-zinc-700 mb-2">Sem dia ({loose.length})</div>
                    <div className="space-y-1.5">
                      {loose.map((w: any) => (
                        <div key={w.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-zinc-200">
                          <span className="flex-1 font-semibold truncate">{w.title}</span>
                          <button onClick={() => openEditSheet(w)} className="p-2 text-zinc-500 min-w-[40px] min-h-[40px]" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { if (window.confirm('Excluir esta ficha?')) sheetDelete.mutate(w.id); }}
                            className="p-2 text-red-500 min-w-[40px] min-h-[40px]"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* Montador de ficha */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSheet ? 'Editar ficha' : 'Montar ficha de treino'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold">Aluno *</label>
              <select value={sheetForm.studentId} onChange={(e) => setSheetForm({ ...sheetForm, studentId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]" disabled={Boolean(editingSheet)}>
                <option value="">Selecione...</option>
                {(students || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Título *</label>
              <Input value={sheetForm.title} onChange={(e) => setSheetForm({ ...sheetForm, title: e.target.value })} placeholder="Treino A — Pernas" />
            </div>
            <div>
              <label className="text-xs font-semibold">Dia da semana</label>
              <select value={sheetForm.dayOfWeek} onChange={(e) => setSheetForm({ ...sheetForm, dayOfWeek: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">Sem dia (atribuir depois)</option>
                {WEEK_DAYS.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Professor</label>
              <Input value={sheetForm.coach} onChange={(e) => setSheetForm({ ...sheetForm, coach: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Válida até</label>
              <Input type="date" value={sheetForm.validUntil} onChange={(e) => setSheetForm({ ...sheetForm, validUntil: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Observações</label>
              <Input value={sheetForm.notes} onChange={(e) => setSheetForm({ ...sheetForm, notes: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">ADICIONAR DA BIBLIOTECA (EM SEQUÊNCIA)</div>
              <Button
                size="sm"
                className="bg-zinc-900 hover:bg-zinc-800 min-h-[44px]"
                onClick={() => {
                  setBatchSearch('');
                  setBatchGroup('ALL');
                  setBatchSelected([]);
                  setBatchOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar em lote
              </Button>
            </div>
            <Input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Buscar movimento..." className="mb-2" />
            {libSearch.trim() !== '' && (
              <div className="border border-zinc-200 rounded-xl overflow-hidden mb-3 max-h-48 overflow-y-auto">
                {libCandidates.length === 0 && <div className="text-xs text-zinc-400 p-3">Nada encontrado. Cadastre na aba Biblioteca.</div>}
                {libCandidates.map((ex: any) => (
                  <button key={ex.id} onClick={() => addToSheet(ex)} className="w-full flex items-center gap-2 p-2.5 hover:bg-orange-50 text-left border-b last:border-0 border-zinc-100 min-h-[48px]">
                    <Plus className="w-4 h-4 text-orange-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold truncate">{ex.name}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{ex.equipment || muscleLabel(ex.muscleGroup)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {builderItems.length === 0 && <div className="text-xs text-zinc-400">Nenhum exercício na ficha ainda.</div>}
              {builderItems.map((it, i) => (
                <div key={it.exerciseId} className="bg-zinc-50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-zinc-900 text-white text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{it.name}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{it.equipment}</div>
                    </div>
                    {it.mediaUrl && (
                      <button onClick={() => setVideo({ url: it.mediaUrl!, title: it.name })} className="p-2 text-red-600 min-w-[40px] min-h-[40px]" title="Ver execução">
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="p-2 text-zinc-500 disabled:opacity-30 min-w-[40px] min-h-[40px]" title="Subir">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => moveItem(i, 1)} disabled={i === builderItems.length - 1} className="p-2 text-zinc-500 disabled:opacity-30 min-w-[40px] min-h-[40px]" title="Descer">
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => setBuilderItems(builderItems.filter((_, idx) => idx !== i))} className="p-2 text-red-500 min-w-[40px] min-h-[40px]" title="Remover">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500">SÉRIES</label>
                      <Input value={it.sets} onChange={(e) => setBuilderItems(builderItems.map((b, idx) => (idx === i ? { ...b, sets: e.target.value } : b)))} inputMode="numeric" className="h-10" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500">REPS (0–40)</label>
                      <Input value={it.reps} onChange={(e) => setBuilderItems(builderItems.map((b, idx) => (idx === i ? { ...b, reps: e.target.value } : b)))} inputMode="numeric" className="h-10" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500">CARGA</label>
                      <Input value={it.load} onChange={(e) => setBuilderItems(builderItems.map((b, idx) => (idx === i ? { ...b, load: e.target.value } : b)))} placeholder="20kg" className="h-10" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500">DESC. (s)</label>
                      <Input value={it.restSeconds} onChange={(e) => setBuilderItems(builderItems.map((b, idx) => (idx === i ? { ...b, restSeconds: e.target.value } : b)))} inputMode="numeric" className="h-10" />
                    </div>
                  </div>
                  <Input value={it.notes} onChange={(e) => setBuilderItems(builderItems.map((b, idx) => (idx === i ? { ...b, notes: e.target.value } : b)))} placeholder="Obs. técnica: cadência, amplitude..." className="mt-2 h-10" />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" disabled={sheetMutation.isPending} onClick={saveSheet}>
              Salvar ficha ({builderItems.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seleção em lote: marca vários de uma vez e confirma */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar exercícios em lote</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} placeholder="Buscar movimento ou aparelho..." className="flex-1" />
            <select value={batchGroup} onChange={(e) => setBatchGroup(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
              <option value="ALL">Todos os grupos</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>{muscleLabel(g)}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={batchCandidates.length > 0 && batchCandidates.every((ex: any) => batchSelected.includes(ex.id))}
              onChange={(e) => {
                if (e.target.checked) {
                  setBatchSelected(Array.from(new Set([...batchSelected, ...batchCandidates.map((ex: any) => ex.id)])));
                } else {
                  const visible = new Set(batchCandidates.map((ex: any) => ex.id));
                  setBatchSelected(batchSelected.filter((id) => !visible.has(id)));
                }
              }}
              className="w-4 h-4 accent-orange-600"
            />
            Marcar todos visíveis ({batchCandidates.length})
          </label>
          <div className="border border-zinc-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {batchCandidates.length === 0 && <div className="text-xs text-zinc-400 p-3">Nada encontrado para este filtro.</div>}
            {batchCandidates.map((ex: any) => {
              const inSheet = builderItems.some((i) => i.exerciseId === ex.id);
              return (
                <label key={ex.id} className="flex items-center gap-3 p-3 border-b last:border-0 border-zinc-100 hover:bg-orange-50/50 cursor-pointer min-h-[52px]">
                  <input
                    type="checkbox"
                    checked={batchSelected.includes(ex.id)}
                    disabled={inSheet}
                    onChange={(e) => {
                      setBatchSelected(
                        e.target.checked
                          ? [...batchSelected, ex.id]
                          : batchSelected.filter((id) => id !== ex.id),
                      );
                    }}
                    className="w-4 h-4 accent-orange-600 shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold truncate">{ex.name}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">
                      {muscleLabel(ex.muscleGroup)}{ex.equipment ? ` • ${ex.equipment}` : ''}{ex.mediaUrl ? ' • 🎬' : ''}
                    </span>
                  </span>
                  {inSheet && <Badge className="bg-zinc-200 text-zinc-600 text-[10px] shrink-0">Na ficha</Badge>}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={confirmBatch}>
              Confirmar ({batchSelected.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cadastro de movimento */}
      <Dialog open={exModal} onOpenChange={setExModal}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEx ? 'Editar movimento' : 'Cadastrar movimento'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Nome do exercício *</label>
              <Input value={exForm.name} onChange={(e) => setExForm({ ...exForm, name: e.target.value })} placeholder="Ex: Agachamento Livre" />
            </div>
            <div>
              <label className="text-xs font-semibold">Aparelho / equipamento</label>
              <Input value={exForm.equipment} onChange={(e) => setExForm({ ...exForm, equipment: e.target.value })} placeholder="Barra e anilhas" />
            </div>
            <div>
              <label className="text-xs font-semibold">Grupo muscular</label>
              <select value={exForm.muscleGroup} onChange={(e) => setExForm({ ...exForm, muscleGroup: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                {MUSCLE_GROUPS.map((g) => (
                  <option key={g} value={g}>{muscleLabel(g)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Vídeo demonstrativo (URL YouTube/GIF ou arquivo)</label>
              <Input value={exForm.mediaUrl} onChange={(e) => setExForm({ ...exForm, mediaUrl: e.target.value })} placeholder="https://youtube.com/watch?v=..." inputMode="url" />
              <div className="flex items-center gap-2 mt-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-xs font-bold text-zinc-600 cursor-pointer min-h-[44px]">
                  <Upload className="w-4 h-4" /> Enviar MP4/WebM/GIF (máx 8MB)
                  <input
                    type="file"
                    accept="video/mp4,video/webm,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 8 * 1024 * 1024) {
                        toast.error('Arquivo muito grande (máx 8MB).');
                        e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setExForm((f) => ({ ...f, mediaUrl: String(reader.result) }));
                        toast.success('Mídia carregada! Salve o movimento.');
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {exForm.mediaUrl?.startsWith('data:') && (
                  <button
                    type="button"
                    onClick={() => setExForm({ ...exForm, mediaUrl: '' })}
                    className="text-[11px] font-bold text-red-600 min-h-[44px] px-2"
                  >
                    Remover arquivo
                  </button>
                )}
              </div>
              {exForm.mediaUrl?.startsWith('data:') && (
                <div className="text-[11px] text-emerald-700 font-semibold mt-1">✓ Arquivo local anexado (salvo junto ao exercício).</div>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Observações</label>
              <Input value={exForm.notes} onChange={(e) => setExForm({ ...exForm, notes: e.target.value })} placeholder="Pontos de atenção da execução" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExModal(false)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={exMutation.isPending}
              onClick={() => {
                if (!exForm.name.trim()) return toast.error('Nome é obrigatório');
                exMutation.mutate({ ...exForm, mediaUrl: exForm.mediaUrl || undefined });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {video && <VideoModal url={video.url} title={video.title} onClose={() => setVideo(null)} />}
    </div>
  );
};

export default AcademyWorkoutsPage;
