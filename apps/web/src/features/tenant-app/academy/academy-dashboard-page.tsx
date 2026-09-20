import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  DoorOpen,
  UserPlus,
  AlarmClock,
  Wallet,
  TrendingUp,
  ClipboardCheck,
  CalendarDays,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { useGymRealtime } from './use-gym-realtime';

const brl = (cents: number) =>
  `R$ ${((Number(cents) || 0) / 100).toFixed(2).replace('.', ',')}`;

function Stat({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: string; sub?: string; to?: string }) {
  const inner = (
    <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-zinc-500">{label}</span>
      </div>
      <div className="text-2xl font-black text-zinc-900">{value}</div>
      {sub && <div className="text-[11px] text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export const AcademyDashboardPage: React.FC = () => {
  const { slug } = useTenant();
  const { live } = useGymRealtime();
  const { data, isLoading } = useQuery({
    queryKey: ['gym-dashboard', slug],
    queryFn: () => apiGet('/gym/dashboard'),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-zinc-200/80 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  const d = data || {};

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            🏠 Dashboard da Academia
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-full ${live ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
              {live ? 'AO VIVO' : 'OFFLINE'}
            </span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Alunos, presença, matrículas e faturamento em tempo real.
          </p>
        </div>
        <Link
          to="/app/checkin"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700"
        >
          <DoorOpen className="w-4 h-4" /> Abrir catraca
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Users className="w-4 h-4 text-orange-600" />} label="Alunos ativos" value={String(d.activeStudents ?? 0)} to="/app/students" />
        <Stat icon={<DoorOpen className="w-4 h-4 text-emerald-600" />} label="Presentes hoje" value={String(d.presentToday ?? 0)} sub={`${d.checkinsToday ?? 0} check-ins`} to="/app/checkin" />
        <Stat icon={<UserPlus className="w-4 h-4 text-sky-600" />} label="Novas matrículas (mês)" value={String(d.newEnrollmentsMonth ?? 0)} to="/app/enrollments" />
        <Stat icon={<AlarmClock className="w-4 h-4 text-amber-600" />} label="Vencendo em 7 dias" value={String(d.expiring7d ?? 0)} sub="Renovar antes de vencer" to="/app/enrollments" />
        <Stat icon={<Wallet className="w-4 h-4 text-red-500" />} label="Pagamentos pendentes" value={String(d.pendingBills ?? 0)} sub={brl(d.pendingCents ?? 0)} to="/app/pending-payments" />
        <Stat icon={<ClipboardCheck className="w-4 h-4 text-zinc-500" />} label="Inadimplentes" value={String(d.overdueBills ?? 0)} sub="Mensalidade atrasada" to="/app/finance/receivables" />
        <Stat icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} label="Faturamento (mês)" value={brl(d.revenueMonthCents ?? 0)} sub="Mensalidades recebidas" />
        <Stat icon={<CalendarDays className="w-4 h-4 text-violet-600" />} label="Aulas hoje" value={String(d.classesToday ?? 0)} to="/app/classes" />
      </div>
    </div>
  );
};

export default AcademyDashboardPage;
