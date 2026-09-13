import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Calendar,
  PieChart as PieIcon,
  BarChart3,
} from 'lucide-react';
import { CossBadge, CossSpinner } from '@/components/coss-ui';

const PIE_COLORS = ['#18181b', '#4f46e5', '#059669', '#d97706', '#dc2626'];

export const BillingOverviewPage: React.FC = () => {
  const [period, setPeriod] = useState<'WEEK' | 'MONTH' | 'YEAR'>('MONTH');

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => apiGet('/billing/overview'),
  });

  const { data: plansDist, isLoading: loadingPlans } = useQuery({
    queryKey: ['dashboard-dist-plans'],
    queryFn: () => apiGet('/dashboard/distribution/plans'),
  });

  const { data: nichesDist, isLoading: loadingNiches } = useQuery({
    queryKey: ['dashboard-dist-niches'],
    queryFn: () => apiGet('/dashboard/distribution/niches'),
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);

  const planData = Array.isArray(plansDist)
    ? plansDist
    : plansDist?.data || [];

  const nicheData = Array.isArray(nichesDist)
    ? nichesDist
    : nichesDist?.data || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Métricas consolidadas de receita, inadimplência e distribuição de faturamento.
        </p>

        {/* Period Selector */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-zinc-200/80 shadow-2xs">
          {([
            { id: 'WEEK', label: 'Esta Semana' },
            { id: 'MONTH', label: 'Este Mês' },
            { id: 'YEAR', label: 'Este Ano' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                period === opt.id
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              Faturamento Total
            </span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-zinc-900 tracking-tight font-sans">
              {formatCurrency(overview?.totalRevenue || overview?.totalRevenueCents || 0)}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-600 font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+{overview?.growthPercent || 0}% vs período anterior</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              Período Anterior
            </span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-zinc-700 tracking-tight font-sans">
              {formatCurrency(overview?.previousRevenue || 0)}
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Receita liquidada do ciclo passado</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              Taxa de Crescimento
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-600 tracking-tight font-sans">
              +{overview?.growthPercent || 0}%
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Expansão líquida de receita</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              Valor em Risco
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-rose-600 tracking-tight font-sans">
              {formatCurrency(overview?.atRiskRevenue || 0)}
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Faturas vencidas não liquidadas</p>
          </div>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
                <PieIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Distribuição por Plano</h3>
                <p className="text-xs text-zinc-500">Participação de cada plano nas assinaturas ativas</p>
              </div>
            </div>
            <CossBadge variant="neutral">{planData.length} Planos</CossBadge>
          </div>

          {loadingPlans ? (
            <div className="h-64 flex items-center justify-center">
              <CossSpinner className="w-6 h-6" />
            </div>
          ) : planData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
              Nenhuma assinatura ativa encontrada para compor o gráfico.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={planData}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {planData.map((_: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number, name: string) => [`${val} assinaturas`, name]}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend with percentages */}
              <div className="space-y-2.5">
                {planData.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="font-semibold text-zinc-800 truncate">{item.label}</span>
                    </div>
                    <span className="font-mono text-zinc-500 font-medium">
                      {item.percentage}% ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Niche Distribution */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Receita por Nicho de Mercado</h3>
                <p className="text-xs text-zinc-500">Volume de clientes por segmento atendido</p>
              </div>
            </div>
            <CossBadge variant="neutral">Segmentos</CossBadge>
          </div>

          {loadingNiches ? (
            <div className="h-64 flex items-center justify-center">
              <CossSpinner className="w-6 h-6" />
            </div>
          ) : nicheData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
              Nenhum dado de nicho disponível.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nicheData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [`${val} empresas ativas`, 'Total']}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Bar dataKey="value" fill="#18181b" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
