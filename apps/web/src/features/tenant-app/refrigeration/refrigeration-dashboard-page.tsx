import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Snowflake,
  Wrench,
  Hourglass,
  CheckCircle2,
  FileText,
  Wallet,
  TrendingUp,
  CalendarClock,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';

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

export const RefrigerationDashboardPage: React.FC = () => {
  const { slug } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ['service-dashboard', slug],
    queryFn: () => apiGet('/service-orders/dashboard'),
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
            ❄️ Dashboard de Serviços
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            OS do dia, funil de atendimento, orçamentos e faturamento de serviços.
          </p>
        </div>
        <Link
          to="/app/service-orders"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700"
        >
          <Snowflake className="w-4 h-4" /> Nova OS
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<CalendarClock className="w-4 h-4 text-sky-600" />} label="Serviços de hoje" value={String(d.todayOrders ?? 0)} to="/app/service-orders" />
        <Stat icon={<Wrench className="w-4 h-4 text-amber-600" />} label="OS em andamento" value={String(d.inProgress ?? 0)} sub={`${d.openOrders ?? 0} abertas no total`} to="/app/service-orders" />
        <Stat icon={<Hourglass className="w-4 h-4 text-orange-600" />} label="Aguardando peça" value={String(d.waitingParts ?? 0)} sub="Comprar / separar peça" to="/app/service-orders" />
        <Stat icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Concluídas" value={String(d.completedTotal ?? 0)} to="/app/service-orders" />
        <Stat icon={<FileText className="w-4 h-4 text-violet-600" />} label="Orçamentos pendentes" value={String(d.pendingQuotes ?? 0)} sub={brl(d.pendingQuotesCents ?? 0)} to="/app/service-quotes" />
        <Stat icon={<Wallet className="w-4 h-4 text-red-500" />} label="Pagamentos pendentes" value={String(d.pendingBills ?? 0)} sub={`${brl(d.pendingCents ?? 0)} • ${d.overdueBills ?? 0} atrasados`} to="/app/pending-payments" />
        <Stat icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} label="Faturamento serviços (mês)" value={brl(d.serviceRevenueMonthCents ?? 0)} />
        <Stat icon={<CalendarClock className="w-4 h-4 text-zinc-500" />} label="Serviços agendados" value={String(d.scheduled ?? 0)} to="/app/appointments" />
      </div>
    </div>
  );
};

export default RefrigerationDashboardPage;
