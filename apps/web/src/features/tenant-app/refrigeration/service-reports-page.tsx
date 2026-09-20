import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { TableRowSkeleton } from '../components/erp-skeleton';

const brl = (cents: number) => `R$ ${((Number(cents) || 0) / 100).toFixed(2).replace('.', ',')}`;

export const ServiceReportsPage: React.FC = () => {
  const { slug } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ['service-reports', slug],
    queryFn: () => apiGet('/service-orders/reports'),
  });

  if (isLoading) return <TableRowSkeleton />;

  const r = data || {};
  const revenue = r.revenueByMonth || [];
  const maxRev = Math.max(1, ...revenue.map((x: any) => x.cents));
  const totalRev = revenue.reduce((a: number, x: any) => a + x.cents, 0);

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-sky-600" /> Relatórios de Serviços
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Faturamento, técnico, peças, orçamentos, cancelamentos e inadimplência.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-1">Faturamento de serviços — 6 meses</div>
          <div className="text-2xl font-black text-emerald-700 mb-4">{brl(totalRev)}</div>
          <div className="space-y-2">
            {revenue.map((m: any) => (
              <div key={m.month}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-semibold text-zinc-600">{m.month}</span>
                  <span className="font-bold">{brl(m.cents)}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((m.cents / maxRev) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-4">Serviços por técnico</div>
          <div className="space-y-2">
            {(r.byTechnician || []).length === 0 && <div className="text-xs text-zinc-400">Sem serviços concluídos ainda.</div>}
            {(r.byTechnician || []).map((t: any, i: number) => (
              <div key={i} className="flex justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2">
                <span className="font-semibold">{t.name}</span>
                <span>{t.completed} concluídos • <b>{brl(t.revenue)}</b></span>
              </div>
            ))}
          </div>
          <div className="font-bold text-sm mt-5 mb-3">Peças mais utilizadas</div>
          <div className="space-y-2">
            {(r.topParts || []).length === 0 && <div className="text-xs text-zinc-400">Nenhuma peça lançada.</div>}
            {(r.topParts || []).map((p: any) => (
              <div key={p.part} className="flex justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2">
                <span className="font-semibold">{p.part}</span>
                <span className="font-bold">{p.qty} un</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-3">Orçamentos</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(r.quotes || {}).map(([st, n]: any) => (
              <span key={st} className="text-[11px] font-bold bg-zinc-100 rounded-lg px-2.5 py-1.5">{st}: {n}</span>
            ))}
            {Object.keys(r.quotes || {}).length === 0 && <span className="text-xs text-zinc-400">Sem orçamentos.</span>}
          </div>
          <div className="font-bold text-sm mt-5 mb-3">Cancelamentos</div>
          <div className="text-2xl font-black text-red-600">{r.canceledOrders ?? 0}</div>
          <div className="text-xs text-zinc-500">ordens canceladas no total</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-soft">
          <div className="font-bold text-sm mb-1">Inadimplência de serviços</div>
          <div className="text-2xl font-black text-red-600">{brl(r.delinquency?.cents || 0)}</div>
          <div className="text-xs text-zinc-500 mb-4">{r.delinquency?.count || 0} cobrança(s) em atraso</div>
          <div className="text-[11px] text-zinc-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
            💡 Cobranças de OS concluídas caem em Contas a Receber — dê baixa ao receber.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceReportsPage;
