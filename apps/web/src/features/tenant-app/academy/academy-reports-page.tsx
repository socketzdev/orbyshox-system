import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { useGymRealtime } from './use-gym-realtime';
import { TableRowSkeleton } from '../components/erp-skeleton';

const brl = (cents: number) => `R$ ${((Number(cents) || 0) / 100).toFixed(2).replace('.', ',')}`;

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold text-zinc-600">{label}</span>
        <span className="font-bold text-zinc-900">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const AcademyReportsPage: React.FC = () => {
  const { slug } = useTenant();
  useGymRealtime();
  const { data, isLoading } = useQuery({
    queryKey: ['gym-reports', slug],
    queryFn: () => apiGet('/gym/reports'),
  });

  if (isLoading) return <TableRowSkeleton />;

  const r = data || {};
  const revenue = r.revenueByMonth || [];
  const checkins = r.checkins14d || [];
  const maxRev = Math.max(1, ...revenue.map((x: any) => x.cents));
  const maxChk = Math.max(1, ...checkins.map((x: any) => x.count));
  const totalRev = revenue.reduce((a: number, x: any) => a + x.cents, 0);

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-orange-600" /> Relatórios da Academia
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Faturamento, matrículas, inadimplência, frequência e planos mais vendidos.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-1">Faturamento — 6 meses</div>
          <div className="text-2xl font-black text-emerald-700 mb-4">{brl(totalRev)}</div>
          <div className="space-y-2">
            {revenue.map((m: any) => (
              <div key={m.month}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-semibold text-zinc-600">{m.month}</span>
                  <span className="font-bold">{brl(m.cents)}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${maxRev > 0 ? Math.round((m.cents / maxRev) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-4">Frequência — check-ins 14 dias</div>
          <div className="space-y-2">
            {checkins.map((c: any) => (
              <Bar key={c.day} label={c.day} value={c.count} max={maxChk} color="bg-sky-500" />
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-4">Planos mais vendidos</div>
          <div className="space-y-2">
            {(r.topPlans || []).length === 0 && <div className="text-xs text-zinc-400">Sem matrículas ainda.</div>}
            {(r.topPlans || []).map((p: any) => (
              <div key={p.plan} className="flex justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2">
                <span className="font-semibold">{p.plan}</span>
                <span className="font-bold">{p.count} matrícula(s)</span>
              </div>
            ))}
          </div>
          <div className="font-bold text-sm mt-5 mb-3">Matrículas por situação</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(r.enrollmentsByStatus || {}).map(([st, n]: any) => (
              <span key={st} className="text-[11px] font-bold bg-zinc-100 rounded-lg px-2.5 py-1.5">{st}: {n}</span>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-1">Inadimplência</div>
          <div className="text-2xl font-black text-red-600">{brl(r.delinquency?.cents || 0)}</div>
          <div className="text-xs text-zinc-500 mb-4">{r.delinquency?.count || 0} cobrança(s) em atraso</div>
          <div className="text-[11px] text-zinc-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
            💡 Use a página de Pendências Financeiras para cobrar os atrasados e dar baixa ao receber.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcademyReportsPage;
