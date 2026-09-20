import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Plus, Trash2, Camera, TrendingUp, X } from 'lucide-react';
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

const GOALS = ['EMAGRECIMENTO', 'HIPERTROFIA', 'REABILITACAO', 'CONDICIONAMENTO', 'OUTRO'];
const goalLabel = (g?: string | null) => {
  const map: Record<string, string> = {
    EMAGRECIMENTO: 'Emagrecimento', HIPERTROFIA: 'Hipertrofia', REABILITACAO: 'Reabilitação',
    CONDICIONAMENTO: 'Condicionamento', OUTRO: 'Outro',
  };
  return (g && map[g]) || '—';
};

const PERI_FIELDS: Array<[string, string]> = [
  ['neck', 'Pescoço'], ['chest', 'Tórax/Busto'], ['waist', 'Cintura'], ['abdomen', 'Abdômen'],
  ['hip', 'Quadril'], ['armRelaxedR', 'Braço relax. D'], ['armRelaxedL', 'Braço relax. E'],
  ['armFlexedR', 'Braço contr. D'], ['armFlexedL', 'Braço contr. E'],
  ['forearmR', 'Antebraço D'], ['forearmL', 'Antebraço E'],
  ['thighProxR', 'Coxa prox. D'], ['thighProxL', 'Coxa prox. E'],
  ['thighMedR', 'Coxa med. D'], ['thighMedL', 'Coxa med. E'],
  ['thighDistR', 'Coxa dist. D'], ['thighDistL', 'Coxa dist. E'],
  ['calfR', 'Panturrilha D'], ['calfL', 'Panturrilha E'],
];

const SKIN_FIELDS: Array<[string, string]> = [
  ['triceps', 'Tríceps'], ['biceps', 'Bíceps'], ['subscapular', 'Subescapular'],
  ['axillary', 'Axilar média'], ['chest', 'Peitoral'], ['suprailiac', 'Suprailíaca'],
  ['abdomen', 'Abdômen'], ['thigh', 'Coxa'], ['calf', 'Panturrilha'],
];

const BIO_FIELDS: Array<[string, string, string]> = [
  ['bodyFatPct', '% Gordura', '%'], ['muscleMassKg', 'Massa magra', 'kg'],
  ['visceralFat', 'Gordura visceral', 'nível'], ['bmrKcal', 'TMB', 'kcal'],
  ['metabolicAge', 'Idade metabólica', 'anos'], ['bodyWaterPct', 'Água corporal', '%'],
];

const PHOTO_VIEWS: Array<[string, string]> = [
  ['front', 'Anterior'], ['back', 'Posterior'], ['left', 'Lateral esquerda'], ['right', 'Lateral direita'],
];

const parseObj = (raw: any): Record<string, any> => {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
};

const fmtDate = (iso: any) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** Prévia local dos cálculos (o backend recalcula e persiste ao salvar). */
function previewCalc(heightCm: string, weightKg: string, waist: string, hip: string, protocol: string, sex: string, age: string, sf: Record<string, string>) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  const bmi = h > 0 && w > 0 ? Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 : null;
  const wst = Number(waist);
  const hp = Number(hip);
  const rcq = wst > 0 && hp > 0 ? Math.round((wst / hp) * 100) / 100 : null;
  let bf: number | null = null;
  const n = (k: string) => Number(sf[k]);
  const sum = (ks: string[]) => ks.reduce((a, k) => a + (Number.isFinite(n(k)) ? n(k) : NaN), 0);
  const a = Number(age);
  try {
    if (protocol && Number.isFinite(a) && a >= 5 && a <= 100) {
      let d = 0;
      if (protocol === 'POLLOCK_3') {
        const s = sex === 'F' ? sum(['triceps', 'suprailiac', 'thigh']) : sum(['chest', 'abdomen', 'thigh']);
        if (!Number.isFinite(s)) throw new Error();
        d = sex === 'F'
          ? 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * a
          : 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * a;
      } else if (protocol === 'POLLOCK_7') {
        const s = sum(['chest', 'axillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh']);
        if (!Number.isFinite(s)) throw new Error();
        d = sex === 'F'
          ? 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * a
          : 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * a;
      } else if (protocol === 'PETROSKI_4' && sex === 'M') {
        const s = sum(['subscapular', 'triceps', 'suprailiac', 'calf']);
        if (!Number.isFinite(s)) throw new Error();
        d = 1.10726863 - 0.00081201 * s + 0.00000212 * s * s - 0.00041761 * a;
      }
      if (d > 0.9 && d < 1.2) bf = Math.round((495 / d - 450) * 10) / 10;
    }
  } catch {
    bf = null;
  }
  return { bmi, rcq, bf };
}

const emptyForm = () => ({
  studentId: '', date: new Date().toISOString().slice(0, 10), professional: '', goal: 'HIPERTROFIA',
  birthDate: '', age: '', sex: 'M', profession: '', emergencyContact: '',
  injuries: '', surgeries: '', chronicPain: '', conditions: '', medications: '', limitations: '',
  activityLevel: '', trainingHistory: '', sleep: '', waterIntake: '', mainGoal: '',
  heightCm: '', weightKg: '', wingspanCm: '', restingHr: '', systolic: '', diastolic: '',
  perimetry: {} as Record<string, string>, skinfolds: {} as Record<string, string>,
  bioimpedance: {} as Record<string, string>, protocol: 'POLLOCK_3',
  photos: {} as Record<string, string>, notes: '',
});

type FormState = ReturnType<typeof emptyForm>;

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 font-bold text-xs min-h-[48px]"
      >
        {title}
        <span className="text-zinc-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

const L = ({ children }: { children: React.ReactNode }) => (
  <label className="text-xs font-semibold block">{children}</label>
);

export const AcademyAssessmentsPage: React.FC = () => {
  const { slug } = useTenant();
  useGymRealtime();
  const queryClient = useQueryClient();
  const [studentFilter, setStudentFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [detail, setDetail] = useState<any>(null);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setMap = (group: 'perimetry' | 'skinfolds' | 'bioimpedance' | 'photos', key: string, value: string) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['gym-assessments', slug, studentFilter],
    queryFn: () => apiGet('/gym/assessments', studentFilter ? { studentId: studentFilter } : undefined),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['gym-students', slug, 'ALL'],
    queryFn: () => apiGet('/gym/students', { status: 'ALL' }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gym-assessments', slug] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing ? apiPatch(`/gym/assessments/${editing.id}`, payload) : apiPost('/gym/assessments', payload),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      toast.success(editing ? 'Avaliação atualizada!' : 'Avaliação registrada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar avaliação'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/gym/assessments/${id}`),
    onSuccess: () => {
      invalidate();
      setDetail(null);
      toast.success('Avaliação excluída.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  const calc = useMemo(
    () =>
      previewCalc(
        form.heightCm, form.weightKg, form.perimetry.waist || '', form.perimetry.hip || '',
        form.protocol, form.sex, form.age, form.skinfolds,
      ),
    [form.heightCm, form.weightKg, form.perimetry, form.protocol, form.sex, form.age, form.skinfolds],
  );

  const toPayload = () => {
    const numOrUndef = (v: string) => (v === '' ? undefined : Number(v));
    return {
      studentId: form.studentId,
      date: form.date || undefined,
      professional: form.professional || undefined,
      goal: form.goal || undefined,
      anamnesis: {
        birthDate: form.birthDate || undefined, age: form.age === '' ? undefined : Number(form.age),
        sex: form.sex, profession: form.profession || undefined, emergencyContact: form.emergencyContact || undefined,
        injuries: form.injuries || undefined, surgeries: form.surgeries || undefined,
        chronicPain: form.chronicPain || undefined, conditions: form.conditions || undefined,
        medications: form.medications || undefined, limitations: form.limitations || undefined,
        activityLevel: form.activityLevel || undefined, trainingHistory: form.trainingHistory || undefined,
        sleep: form.sleep || undefined, waterIntake: form.waterIntake || undefined, mainGoal: form.mainGoal || undefined,
      },
      heightCm: numOrUndef(form.heightCm), weightKg: numOrUndef(form.weightKg),
      wingspanCm: numOrUndef(form.wingspanCm), restingHr: numOrUndef(form.restingHr),
      systolic: numOrUndef(form.systolic), diastolic: numOrUndef(form.diastolic),
      perimetry: form.perimetry, skinfolds: form.skinfolds, bioimpedance: form.bioimpedance,
      protocol: form.protocol || undefined, photos: form.photos, notes: form.notes || undefined,
    };
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm(), studentId: studentFilter || '' });
    setFormOpen(true);
  };

  const openEdit = (a: any) => {
    const an = parseObj(a.anamnesis);
    setEditing(a);
    setForm({
      studentId: a.studentId, date: String(a.date).slice(0, 10), professional: a.professional || '', goal: a.goal || 'HIPERTROFIA',
      birthDate: an.birthDate ? String(an.birthDate).slice(0, 10) : '', age: an.age !== undefined ? String(an.age) : '',
      sex: an.sex || 'M', profession: an.profession || '', emergencyContact: an.emergencyContact || '',
      injuries: an.injuries || '', surgeries: an.surgeries || '', chronicPain: an.chronicPain || '',
      conditions: an.conditions || '', medications: an.medications || '', limitations: an.limitations || '',
      activityLevel: an.activityLevel || '', trainingHistory: an.trainingHistory || '',
      sleep: an.sleep || '', waterIntake: an.waterIntake || '', mainGoal: an.mainGoal || '',
      heightCm: a.heightCm !== null && a.heightCm !== undefined ? String(a.heightCm) : '',
      weightKg: a.weightKg !== null && a.weightKg !== undefined ? String(a.weightKg) : '',
      wingspanCm: a.wingspanCm !== null && a.wingspanCm !== undefined ? String(a.wingspanCm) : '',
      restingHr: a.restingHr !== null && a.restingHr !== undefined ? String(a.restingHr) : '',
      systolic: a.systolic !== null && a.systolic !== undefined ? String(a.systolic) : '',
      diastolic: a.diastolic !== null && a.diastolic !== undefined ? String(a.diastolic) : '',
      perimetry: Object.fromEntries(Object.entries(parseObj(a.perimetry)).map(([k, v]) => [k, String(v)])),
      skinfolds: Object.fromEntries(Object.entries(parseObj(a.skinfolds)).map(([k, v]) => [k, String(v)])),
      bioimpedance: Object.fromEntries(Object.entries(parseObj(a.bioimpedance)).map(([k, v]) => [k, String(v)])),
      protocol: a.protocol || 'POLLOCK_3', photos: parseObj(a.photos), notes: a.notes || '',
    });
    setFormOpen(true);
    setDetail(null);
  };

  const handlePhoto = (key: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Envie imagem JPG/PNG/WebP.');
      return;
    }
    if (file.size > 1_500_000) {
      toast.error('Foto muito grande (máx 1,5MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setMap('photos', key, String(reader.result));
    reader.readAsDataURL(file);
  };

  // ─── Evolução: compara duas avaliações ───
  const evA = (assessments || []).find((a: any) => a.id === cmpA);
  const evB = (assessments || []).find((a: any) => a.id === cmpB);
  const evoRows = useMemo(() => {
    if (!evA || !evB) return [];
    const pa = parseObj(evA.perimetry);
    const pb = parseObj(evB.perimetry);
    const rows: Array<{ label: string; a: number | null; b: number | null; unit: string; invert?: boolean }> = [
      { label: 'Peso', a: evA.weightKg, b: evB.weightKg, unit: 'kg' },
      { label: 'IMC', a: evA.bmi, b: evB.bmi, unit: '' },
      { label: '% Gordura', a: evA.bodyFatPct, b: evB.bodyFatPct, unit: '%' },
      { label: 'Cintura', a: pa.waist ?? null, b: pb.waist ?? null, unit: 'cm' },
      { label: 'Quadril', a: pa.hip ?? null, b: pb.hip ?? null, unit: 'cm' },
      { label: 'RCQ', a: evA.waistHipRatio, b: evB.waistHipRatio, unit: '' },
      { label: 'Braço contr. D', a: pa.armFlexedR ?? null, b: pb.armFlexedR ?? null, unit: 'cm', invert: true },
      { label: 'Coxa med. D', a: pa.thighMedR ?? null, b: pb.thighMedR ?? null, unit: 'cm', invert: true },
      { label: 'Panturrilha D', a: pa.calfR ?? null, b: pb.calfR ?? null, unit: 'cm', invert: true },
    ];
    return rows
      .filter((r) => r.a !== null && r.a !== undefined && r.b !== null && r.b !== undefined)
      .map((r) => {
        const delta = Math.round(((r.b as number) - (r.a as number)) * 100) / 100;
        const pct = r.a ? Math.round((delta / (r.a as number)) * 1000) / 10 : null;
        return { ...r, delta, pct };
      });
  }, [evA, evB]);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-600" /> Avaliação Física
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Anamnese, medidas, dobras com protocolo, bioimpedância e evolução.</p>
        </div>
        <Button onClick={openNew} className="bg-orange-600 hover:bg-orange-700 min-h-[48px]">
          <Plus className="w-4 h-4 mr-2" /> Nova avaliação
        </Button>
      </div>

      <div>
        <select value={studentFilter} onChange={(e) => { setStudentFilter(e.target.value); setCmpA(''); setCmpB(''); }} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px] w-full sm:w-80">
          <option value="">Todos os alunos</option>
          {(students || []).map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <TableRowSkeleton />
      ) : assessments.length === 0 ? (
        <ErpEmptyState icon={Activity} title="Nenhuma avaliação" description="Registre a primeira avaliação física do aluno." />
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {assessments.map((a: any) => (
              <button key={a.id} onClick={() => setDetail(a)} className="w-full flex items-center gap-3 p-4 hover:bg-zinc-50/60 text-left">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-zinc-900">{a.student?.name} • {fmtDate(a.date)}</div>
                  <div className="text-[11px] text-zinc-500">
                    {a.weightKg ? `${a.weightKg}kg` : '—'}
                    {a.bmi ? ` • IMC ${a.bmi}` : ''}
                    {a.bodyFatPct !== null && a.bodyFatPct !== undefined ? ` • ${a.bodyFatPct}% G` : ''}
                    {a.goal ? ` • ${goalLabel(a.goal)}` : ''}
                  </div>
                </div>
                <Badge className="bg-orange-100 text-orange-800">Abrir</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Evolução */}
      {assessments.length >= 2 && (
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" /> Evolução — comparar avaliações
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <select value={cmpA} onChange={(e) => setCmpA(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
              <option value="">De (mais antiga)...</option>
              {[...assessments].reverse().map((a: any) => (
                <option key={a.id} value={a.id}>{a.student?.name} • {fmtDate(a.date)}</option>
              ))}
            </select>
            <select value={cmpB} onChange={(e) => setCmpB(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
              <option value="">Para (mais recente)...</option>
              {assessments.map((a: any) => (
                <option key={a.id} value={a.id}>{a.student?.name} • {fmtDate(a.date)}</option>
              ))}
            </select>
          </div>
          {evoRows.length > 0 && (
            <div className="space-y-2">
              {evoRows.map((r) => {
                const good = r.delta === 0 ? null : r.invert ? r.delta > 0 : r.delta < 0;
                return (
                  <div key={r.label} className="flex items-center gap-3 text-xs bg-zinc-50 rounded-lg px-3 py-2">
                    <span className="w-32 font-bold shrink-0">{r.label}</span>
                    <span className="text-zinc-500">{r.a}{r.unit}</span>
                    <span className="text-zinc-300">→</span>
                    <span className="font-bold">{r.b}{r.unit}</span>
                    <span className={`ml-auto font-black ${good === null ? 'text-zinc-400' : good ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.delta > 0 ? '+' : ''}{r.delta}{r.unit}{r.pct !== null ? ` (${r.pct > 0 ? '+' : ''}${r.pct}%)` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Formulário */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar avaliação' : 'Nova avaliação física'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <L>Aluno *</L>
              <select value={form.studentId} onChange={(e) => set({ studentId: e.target.value })} disabled={Boolean(editing)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">Selecione...</option>
                {(students || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <L>Data</L>
              <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div>
              <L>Objetivo</L>
              <select value={form.goal} onChange={(e) => set({ goal: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                {GOALS.map((g) => (
                  <option key={g} value={g}>{goalLabel(g)}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <L>Profissional responsável</L>
              <Input value={form.professional} onChange={(e) => set({ professional: e.target.value })} placeholder="Nome do avaliador" />
            </div>
          </div>

          <div className="space-y-3">
            <Section title="1. Anamnese" defaultOpen>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><L>Nascimento</L><Input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} /></div>
                <div><L>Idade</L><Input value={form.age} onChange={(e) => set({ age: e.target.value })} inputMode="numeric" placeholder="anos" /></div>
                <div>
                  <L>Sexo biológico</L>
                  <select value={form.sex} onChange={(e) => set({ sex: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div><L>Profissão</L><Input value={form.profession} onChange={(e) => set({ profession: e.target.value })} /></div>
                <div className="col-span-2"><L>Contato de emergência</L><Input value={form.emergencyContact} onChange={(e) => set({ emergencyContact: e.target.value })} placeholder="Nome + telefone" /></div>
                <div><L>Nível de atividade</L><Input value={form.activityLevel} onChange={(e) => set({ activityLevel: e.target.value })} placeholder="Sedentário, ativo..." /></div>
                <div><L>Sono</L><Input value={form.sleep} onChange={(e) => set({ sleep: e.target.value })} placeholder="7h/noite" /></div>
                <div><L>Água/dia</L><Input value={form.waterIntake} onChange={(e) => set({ waterIntake: e.target.value })} placeholder="2L" /></div>
                <div className="col-span-2 sm:col-span-1"><L>Histórico de treinos</L><Input value={form.trainingHistory} onChange={(e) => set({ trainingHistory: e.target.value })} /></div>
                <div className="col-span-2"><L>Lesões prévias</L><Input value={form.injuries} onChange={(e) => set({ injuries: e.target.value })} /></div>
                <div className="col-span-2"><L>Cirurgias</L><Input value={form.surgeries} onChange={(e) => set({ surgeries: e.target.value })} /></div>
                <div className="col-span-2"><L>Dores crônicas</L><Input value={form.chronicPain} onChange={(e) => set({ chronicPain: e.target.value })} /></div>
                <div className="col-span-2"><L>Condições médicas</L><Input value={form.conditions} onChange={(e) => set({ conditions: e.target.value })} placeholder="Hipertensão, diabetes..." /></div>
                <div className="col-span-2"><L>Medicamentos contínuos</L><Input value={form.medications} onChange={(e) => set({ medications: e.target.value })} /></div>
                <div className="col-span-2"><L>Limitações físicas</L><Input value={form.limitations} onChange={(e) => set({ limitations: e.target.value })} /></div>
                <div className="col-span-2"><L>Objetivo principal</L><Input value={form.mainGoal} onChange={(e) => set({ mainGoal: e.target.value })} placeholder="Perder 8kg em 6 meses" /></div>
              </div>
            </Section>

            <Section title={`2. Antropometria${calc.bmi !== null ? ` — IMC ${calc.bmi}` : ''}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><L>Estatura (cm)</L><Input value={form.heightCm} onChange={(e) => set({ heightCm: e.target.value })} inputMode="decimal" /></div>
                <div><L>Peso (kg)</L><Input value={form.weightKg} onChange={(e) => set({ weightKg: e.target.value })} inputMode="decimal" /></div>
                <div><L>Envergadura (cm)</L><Input value={form.wingspanCm} onChange={(e) => set({ wingspanCm: e.target.value })} inputMode="decimal" /></div>
                <div><L>FC repouso (bpm)</L><Input value={form.restingHr} onChange={(e) => set({ restingHr: e.target.value })} inputMode="numeric" /></div>
                <div><L>PA sistólica</L><Input value={form.systolic} onChange={(e) => set({ systolic: e.target.value })} inputMode="numeric" /></div>
                <div><L>PA diastólica</L><Input value={form.diastolic} onChange={(e) => set({ diastolic: e.target.value })} inputMode="numeric" /></div>
              </div>
            </Section>

            <Section title={`3. Perimetria (cm)${calc.rcq !== null ? ` — RCQ ${calc.rcq}` : ''}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PERI_FIELDS.map(([k, label]) => (
                  <div key={k}><L>{label}</L><Input value={form.perimetry[k] || ''} onChange={(e) => setMap('perimetry', k, e.target.value)} inputMode="decimal" /></div>
                ))}
              </div>
            </Section>

            <Section title={`4. Dobras cutâneas (mm)${calc.bf !== null ? ` — ${calc.bf}% G` : ''}`}>
              <div>
                <L>Protocolo</L>
                <select value={form.protocol} onChange={(e) => set({ protocol: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px] mb-3">
                  <option value="POLLOCK_3">Pollock 3 dobras</option>
                  <option value="POLLOCK_7">Pollock 7 dobras</option>
                  <option value="PETROSKI_4">Petroski 4 dobras (masculino)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SKIN_FIELDS.map(([k, label]) => (
                  <div key={k}><L>{label}</L><Input value={form.skinfolds[k] || ''} onChange={(e) => setMap('skinfolds', k, e.target.value)} inputMode="decimal" /></div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400">Pollock 3 ♂: peitoral+abdômen+coxa • ♀: tríceps+suprailíaca+coxa. Petroski: subescapular+tríceps+suprailíaca+panturrilha.</p>
            </Section>

            <Section title="5. Bioimpedância (opcional)">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {BIO_FIELDS.map(([k, label, unit]) => (
                  <div key={k}><L>{label} ({unit})</L><Input value={form.bioimpedance[k] || ''} onChange={(e) => setMap('bioimpedance', k, e.target.value)} inputMode="decimal" /></div>
                ))}
              </div>
            </Section>

            <Section title="6. Fotos de postura">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PHOTO_VIEWS.map(([k, label]) => (
                  <div key={k} className="border border-zinc-200 rounded-xl p-2 text-center">
                    <div className="text-[11px] font-bold mb-1">{label}</div>
                    {form.photos[k] ? (
                      <div className="relative">
                        <img src={form.photos[k]} alt={label} className="w-full h-28 object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setForm((f) => { const p = { ...f.photos }; delete p[k]; return { ...f, photos: p }; })}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 min-w-[32px] min-h-[32px]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed rounded-lg text-zinc-400 cursor-pointer">
                        <Camera className="w-5 h-5" />
                        <span className="text-[10px] font-bold mt-1">Enviar</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(k, e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <div>
              <L>Observações do avaliador</L>
              <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Condutas, retorno..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={saveMutation.isPending}
              onClick={() => {
                if (!form.studentId && !editing) return toast.error('Selecione o aluno');
                saveMutation.mutate(toPayload());
              }}
            >
              Salvar avaliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe */}
      <Dialog open={Boolean(detail)} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detail?.student?.name} • {fmtDate(detail?.date)}</span>
              <button onClick={() => setDetail(null)} className="p-2"><X className="w-4 h-4" /></button>
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Peso', detail.weightKg !== null && detail.weightKg !== undefined ? `${detail.weightKg}kg` : '—'],
                  ['IMC', detail.bmi ?? '—'],
                  ['% Gordura', detail.bodyFatPct !== null && detail.bodyFatPct !== undefined ? `${detail.bodyFatPct}%` : '—'],
                  ['RCQ', detail.waistHipRatio ?? '—'],
                ].map(([l, v]) => (
                  <div key={l} className="bg-zinc-50 rounded-xl p-3">
                    <div className="text-[11px] text-zinc-500">{l}</div>
                    <div className="font-black text-base">{v}</div>
                  </div>
                ))}
              </div>
              {detail.protocol && <div className="text-[11px] text-zinc-500">Protocolo: {detail.protocol} • Densidade: {detail.bodyDensity ?? '—'}</div>}
              {detail.professional && <div className="text-xs">Profissional: <b>{detail.professional}</b> • Objetivo: <b>{goalLabel(detail.goal)}</b></div>}
              {(() => {
                const ph = parseObj(detail.photos);
                const keys = PHOTO_VIEWS.filter(([k]) => ph[k]);
                if (keys.length === 0) return null;
                return (
                  <div>
                    <div className="font-bold text-xs mb-2">Fotos de postura</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {keys.map(([k, label]) => (
                        <div key={k}>
                          <img src={ph[k]} alt={label} className="w-full h-32 object-cover rounded-xl border" />
                          <div className="text-[10px] text-center text-zinc-500 mt-1">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {detail.notes && <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3">📝 {detail.notes}</div>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(detail)}>Editar</Button>
                <Button
                  size="sm" variant="outline" className="text-red-600"
                  onClick={() => { if (window.confirm('Excluir esta avaliação?')) deleteMutation.mutate(detail.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AcademyAssessmentsPage;
