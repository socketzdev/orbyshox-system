import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Scissors,
  Search,
  Settings2,
  Phone,
  Mail,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Award,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
  Coffee,
  Percent,
  Target,
  X,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPut } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

type BarberStatus = 'ACTIVE' | 'AWAY' | 'VACATION';
type FiadoRule = 'UPON_SALE' | 'UPON_PAYMENT';

type RecentAppointment = {
  id: string;
  serviceName: string;
  scheduledAt: string;
  priceCents: number;
};

type Barber = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  position: string | null;
  isActive: boolean;
  profile: {
    nickname: string | null;
    specialty: string | null;
    avatarColor: string;
    serviceCommissionPct: number;
    productCommissionPct: number;
    commissionOnFiado: FiadoRule;
    monthlyGoalCents: number;
    workingHoursLabel: string | null;
    status: BarberStatus;
  } | null;
  metrics: {
    cutsCount: number;
    pendingAppointmentsCount: number;
    currentMonthRevenueCents: number;
    currentMonthCommissionCents: number;
    pendingCommissionCents: number;
    serviceRevenueCents: number;
    productRevenueCents: number;
    progressPct: number;
    recentAppointments: RecentAppointment[];
  };
};

type TeamPayload = {
  barbers: Barber[];
  totals: {
    revenueCents: number;
    commissionCents: number;
    cutsCount: number;
    pendingCommissionCents: number;
    houseProfitCents: number;
    averageCommissionRate: number;
  };
};

const BRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

const STATUS_LABEL: Record<BarberStatus, string> = {
  ACTIVE: 'Na Cadeira',
  AWAY: 'Em Pausa',
  VACATION: 'Férias',
};

const STATUS_TONE: Record<BarberStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  AWAY: 'bg-amber-500',
  VACATION: 'bg-zinc-400',
};

const formatGoalReais = (cents: number) => {
  const reais = cents / 100;
  if (reais === 0) return 'Sem meta';
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const formatPercent = (pct: number) =>
  `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export const BarbersTeamPage: React.FC = () => {
  const { slug, base } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);

  const { data, isLoading } = useQuery<TeamPayload>({
    queryKey: ['tenant-barbers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/barbers`),
  });

  const openProfile = (barber: Barber) => {
    setSelectedBarber(barber);
    setProfileModalOpen(true);
  };

  const filtered = useMemo(() => {
    const list = data?.barbers || [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.profile?.nickname || '').toLowerCase().includes(q) ||
        (b.profile?.specialty || '').toLowerCase().includes(q),
    );
  }, [data?.barbers, search]);

  const totals = data?.totals;
  const hasTeam = (data?.barbers.length ?? 0) > 0;

  return (
    <div className="space-y-6 font-sans">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Scissors className="w-5 h-5 text-zinc-700" />
              Equipe & Comissões
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-zinc-50">
              {data?.barbers.length ?? 0} profissionais
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 max-w-xl">
            Configure regras de comissão por serviço e produto, meta mensal e libere
            comissões de fiado automaticamente.
          </p>

          {totals && (
            <div className="flex items-center gap-2 mt-3">
              <Badge
                variant="emerald"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                {BRL(totals.revenueCents)} no mês
              </Badge>
              <Badge
                variant="amber"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                {BRL(totals.commissionCents)} em comissões
              </Badge>
              <Badge
                variant="sky"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                {totals.cutsCount} cortes
              </Badge>
            </div>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => navigate(`${base}/team/new`)}
          className="h-10 px-4 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>Cadastrar Funcionário</span>
        </Button>
      </div>

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Faturamento da Equipe"
          value={totals ? BRL(totals.revenueCents) : '—'}
          tone="emerald"
          footnote={totals ? `${totals.cutsCount} cortes no mês` : undefined}
        />
        <KpiCard
          icon={Award}
          label="Comissões a Repassar"
          value={totals ? BRL(totals.commissionCents) : '—'}
          tone="amber"
          footnote={
            totals
              ? `${formatPercent(totals.averageCommissionRate)} médio sobre o faturamento`
              : undefined
          }
        />
        <KpiCard
          icon={TrendingUp}
          label="Lucro Líquido da Casa"
          value={totals ? BRL(totals.houseProfitCents) : '—'}
          tone="emerald"
          footnote="Faturamento retido após comissões"
        />
        <KpiCard
          icon={CalendarClock}
          label="Comissões Pendentes (Fiado)"
          value={totals ? BRL(totals.pendingCommissionCents) : '—'}
          tone="rose"
          footnote="Liberadas após o cliente quitar"
        />
      </div>

      {/* ─── Toolbar ─── */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, apelido ou especialidade..."
            className="pl-9 h-10 text-sm"
          />
        </div>
        <span className="text-xs text-zinc-500">
          Exibindo <strong className="text-zinc-900 font-mono">{filtered.length}</strong>{' '}
          de <strong className="text-zinc-900 font-mono">{data?.barbers.length ?? 0}</strong>
        </span>
      </div>

      {/* ─── Team Grid ─── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-zinc-200/80 p-5 h-56 animate-pulse"
            />
          ))}
        </div>
      ) : !hasTeam ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80">
          <ErpEmptyState
            icon={Scissors}
            title="Nenhum barbeiro configurado"
            description="Cadastre funcionários e habilite o perfil de barbeiro para acompanhar metas e comissões."
            actionLabel="Cadastrar Funcionário"
            onAction={() => navigate(`${base}/team/new`)}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80">
          <ErpEmptyState
            icon={Search}
            title="Nenhum resultado encontrado"
            description="Tente ajustar a busca para localizar um profissional."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((barber) => (
            <BarberCard
              key={barber.id}
              barber={barber}
              onEditProfile={() => openProfile(barber)}
            />
          ))}
        </div>
      )}

      <BarberProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        barber={selectedBarber}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['tenant-barbers', slug] });
          setProfileModalOpen(false);
        }}
      />
    </div>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  footnote?: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky';
}> = ({ icon: Icon, label, value, footnote, tone }) => {
  const toneMap = {
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
    sky: 'text-sky-700 bg-sky-50',
  } as const;
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-soft space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-black text-zinc-900 font-mono tracking-tight">{value}</p>
      {footnote && <p className="text-[11px] text-zinc-400">{footnote}</p>}
    </div>
  );
};

// ─── Barber Card ───────────────────────────────────────────────────────────

const BarberCard: React.FC<{ barber: Barber; onEditProfile: () => void }> = ({
  barber,
  onEditProfile,
}) => {
  const profile = barber.profile;
  const initialsText = initials(barber.name) || 'BR';
  const avatarColor = profile?.avatarColor || '#10b981';
  const status: BarberStatus = profile?.status || 'ACTIVE';
  const displayName = profile?.nickname || barber.name.split(' ')[0];
  const serviceRate = profile?.serviceCommissionPct ?? 50;
  const productRate = profile?.productCommissionPct ?? 15;
  const monthlyGoalCents = profile?.monthlyGoalCents ?? 0;
  const progressPct = barber.metrics.progressPct;
  const workingHours = profile?.workingHoursLabel;
  const specialty = profile?.specialty;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden flex flex-col">
      <div className="p-5 space-y-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-2xs"
              style={{ background: avatarColor }}
            >
              {initialsText}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_TONE[status]}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <h3 className="font-bold text-sm text-zinc-900 leading-tight truncate">
                {displayName}
              </h3>
              <p className="text-[11px] text-zinc-500 truncate">{barber.name}</p>
            </div>
          </div>
          <Badge variant="amber" className="text-[10px] font-bold font-mono">
            {serviceRate}% serviços
          </Badge>
        </div>

        {/* Specialty + Working hours */}
        {(specialty || workingHours) && (
          <div className="text-[11px] text-zinc-500 space-y-0.5">
            {specialty && (
              <p className="flex items-center gap-1.5">
                <Briefcase className="w-3 h-3 text-zinc-400" />
                <span className="truncate">{specialty}</span>
              </p>
            )}
            {workingHours && (
              <p className="flex items-center gap-1.5">
                <Coffee className="w-3 h-3 text-zinc-400" />
                <span className="truncate">{workingHours}</span>
              </p>
            )}
          </div>
        )}

        {/* Goal Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Meta do mês</span>
            <span className="font-bold font-mono text-zinc-800">
              {formatGoalReais(monthlyGoalCents)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progressPct >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-emerald-700 font-bold">
              {BRL(barber.metrics.currentMonthRevenueCents)} ({progressPct}%)
            </span>
            <span className="text-zinc-400">{barber.metrics.cutsCount} cortes</span>
          </div>
        </div>

        {/* Commission breakdown */}
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Serviços ({serviceRate}%)</span>
            <span className="font-mono font-bold text-zinc-900">
              {BRL(barber.metrics.serviceRevenueCents)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Produtos ({productRate}%)</span>
            <span className="font-mono font-bold text-zinc-900">
              {BRL(barber.metrics.productRevenueCents)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-zinc-200/80">
            <span className="font-bold text-zinc-700">Comissão a repassar</span>
            <span className="font-mono font-black text-emerald-700">
              {BRL(barber.metrics.currentMonthCommissionCents)}
            </span>
          </div>
          {barber.metrics.pendingCommissionCents > 0 && (
            <div className="flex items-center justify-between text-rose-700">
              <span className="font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Pendente (fiado)
              </span>
              <span className="font-mono font-bold">
                {BRL(barber.metrics.pendingCommissionCents)}
              </span>
            </div>
          )}
        </div>

        {/* Recent appointments */}
        {barber.metrics.recentAppointments.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Últimos atendimentos
            </span>
            <ul className="space-y-1 text-[11px]">
              {barber.metrics.recentAppointments.slice(0, 3).map((apt) => (
                <li
                  key={apt.id}
                  className="flex items-center justify-between text-zinc-600"
                >
                  <span className="truncate flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="truncate">{apt.serviceName}</span>
                  </span>
                  <span className="font-mono text-zinc-500 shrink-0 ml-2">
                    {BRL(apt.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-zinc-100 px-5 py-3 flex items-center gap-2 bg-zinc-50/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEditProfile}
          className="flex-1 h-9 text-xs font-semibold text-zinc-700 hover:bg-white rounded-xl"
        >
          <Settings2 className="w-3.5 h-3.5 mr-1.5" />
          Ajustar Comissão & Meta
        </Button>
      </div>
    </div>
  );
};

// ─── Profile Edit Modal ────────────────────────────────────────────────────

type FormState = {
  nickname: string;
  specialty: string;
  workingHoursLabel: string;
  serviceCommissionPct: number;
  productCommissionPct: number;
  commissionOnFiado: FiadoRule;
  monthlyGoalReais: number;
  status: BarberStatus;
};

const emptyForm = (): FormState => ({
  nickname: '',
  specialty: '',
  workingHoursLabel: '',
  serviceCommissionPct: 50,
  productCommissionPct: 15,
  commissionOnFiado: 'UPON_PAYMENT',
  monthlyGoalReais: 6000,
  status: 'ACTIVE',
});

const BarberProfileModal: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  barber: Barber | null;
  onSaved: () => void;
}> = ({ open, onOpenChange, barber, onSaved }) => {
  const { slug } = useTenant();
  const [form, setForm] = useState<FormState>(emptyForm);

  React.useEffect(() => {
    if (!open) return;
    if (barber) {
      setForm({
        nickname: barber.profile?.nickname || '',
        specialty: barber.profile?.specialty || '',
        workingHoursLabel: barber.profile?.workingHoursLabel || '',
        serviceCommissionPct: barber.profile?.serviceCommissionPct ?? 50,
        productCommissionPct: barber.profile?.productCommissionPct ?? 15,
        commissionOnFiado: barber.profile?.commissionOnFiado ?? 'UPON_PAYMENT',
        monthlyGoalReais: Math.round((barber.profile?.monthlyGoalCents ?? 0) / 100) || 6000,
        status: barber.profile?.status ?? 'ACTIVE',
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, barber]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      barber
        ? apiPut(`/tenant-app/${slug}/barbers/${barber.id}/profile`, payload)
        : Promise.resolve(null),
    onSuccess: () => {
      toast.success('Perfil de comissão atualizado');
      onSaved();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Não foi possível salvar'),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      nickname: form.nickname.trim() || null,
      specialty: form.specialty.trim() || null,
      workingHoursLabel: form.workingHoursLabel.trim() || null,
      serviceCommissionPct: Number(form.serviceCommissionPct),
      productCommissionPct: Number(form.productCommissionPct),
      commissionOnFiado: form.commissionOnFiado,
      monthlyGoalCents: Math.round(Number(form.monthlyGoalReais) * 100),
      status: form.status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-7 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
            <Percent className="w-4 h-4 text-emerald-600" />
            Perfil de Comissão
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Defina regras de repasse financeiro para {barber?.name ?? 'este profissional'}.
          </DialogDescription>
        </DialogHeader>

        {barber && (
          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            {/* Identidade interna */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Identidade interna
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-zinc-700">Apelido</Label>
                  <Input
                    value={form.nickname}
                    onChange={(e) => set('nickname', e.target.value)}
                    placeholder="Ex: Lucas Barber"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-zinc-700">
                    Especialidade
                  </Label>
                  <Input
                    value={form.specialty}
                    onChange={(e) => set('specialty', e.target.value)}
                    placeholder="Degradê, Barboterapia..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-zinc-700">
                  Horário de trabalho
                </Label>
                <Input
                  value={form.workingHoursLabel}
                  onChange={(e) => set('workingHoursLabel', e.target.value)}
                  placeholder="Ter a Sáb · 09h às 19h"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Regras de comissão */}
            <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Regras de comissão
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-zinc-700">
                    Serviços (%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.serviceCommissionPct}
                    onChange={(e) =>
                      set('serviceCommissionPct', Number(e.target.value))
                    }
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-zinc-700">
                    Produtos (%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.productCommissionPct}
                    onChange={(e) =>
                      set('productCommissionPct', Number(e.target.value))
                    }
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-zinc-700">
                  Política de Fiado
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      {
                        value: 'UPON_PAYMENT' as const,
                        title: 'Após o pagamento (Recomendado)',
                        desc: 'Comissão só é liberada quando o cliente quitar o fiado.',
                      },
                      {
                        value: 'UPON_SALE' as const,
                        title: 'Na venda do serviço',
                        desc: 'Comissão liberada na hora, mesmo em fiado.',
                      },
                    ]
                  ).map((opt) => {
                    const selected = form.commissionOnFiado === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set('commissionOnFiado', opt.value)}
                        className={`text-left rounded-xl border p-3 transition ${
                          selected
                            ? 'border-zinc-900 bg-white'
                            : 'border-zinc-200 bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                              selected
                                ? 'border-zinc-900 bg-zinc-900'
                                : 'border-zinc-300'
                            }`}
                          />
                          <span className="text-xs font-bold text-zinc-900">
                            {opt.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1 ml-6 leading-snug">
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Meta mensal + Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> Meta mensal (R$)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={form.monthlyGoalReais}
                  onChange={(e) => set('monthlyGoalReais', Number(e.target.value))}
                  className="h-9 text-xs font-mono"
                />
                <p className="text-[10px] text-zinc-400">
                  0 desativa a meta. Acompanhada nos relatórios mensais.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-zinc-700">
                  Disponibilidade
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { value: 'ACTIVE' as const, label: 'Ativo' },
                      { value: 'AWAY' as const, label: 'Em pausa' },
                      { value: 'VACATION' as const, label: 'Férias' },
                    ]
                  ).map((opt) => {
                    const selected = form.status === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set('status', opt.value)}
                        className={`h-9 rounded-xl border text-xs font-bold transition ${
                          selected
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9 px-3 text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saveMutation.isPending}
                className="h-9 px-4 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar Perfil'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BarbersTeamPage;
