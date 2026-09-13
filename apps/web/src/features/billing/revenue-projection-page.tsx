import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Users, DollarSign, Sparkles } from 'lucide-react';
import { CossBadge, CossSpinner } from '@/components/coss-ui';

interface ProjectionData {
  month: string;
  projected: number;
  optimistic: number;
  pessimistic: number;
}

interface ProjectionResponse {
  currentMrr: number;
  avgChurnRate: number;
  avgNewClients: number;
  data: ProjectionData[];
}

export const RevenueProjectionPage: React.FC = () => {
  const { data: projection, isLoading, error } = useQuery<ProjectionResponse>({
    queryKey: ['revenue-projection'],
    queryFn: () => apiGet('/dashboard/projection'),
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <CossSpinner className="w-8 h-8 mb-3" />
        <p className="text-xs text-zinc-500">Calculando projeção estatística de receita...</p>
      </div>
    );
  }

  if (error || !projection) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-8 text-center text-xs text-rose-600">
        Não foi possível carregar o modelo preditivo de receita. Verifique a conexão com a API.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Previsão probabilística para os próximos 6 meses com base no histórico real de faturamento e churn.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              MRR Vigente
            </span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-zinc-900 tracking-tight font-sans">
              {formatCurrency(projection.currentMrr)}
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Receita recorrente mensal consolidada</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              Taxa Média de Churn
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-zinc-900 tracking-tight font-sans">
              {projection.avgChurnRate.toFixed(2)}%
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Cancelamentos mensais ponderados</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              Expansão Mensal (Novos Clientes)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-600 tracking-tight font-sans">
              +{projection.avgNewClients} / mês
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">Média recente de novas contratações</p>
          </div>
        </div>
      </div>

      {/* Main Area Chart Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 md:p-8 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-zinc-100 gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-zinc-900">Curva de Tendência de 6 Meses</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Área delimitada entre os cenários conservador, projetado e otimista.
            </p>
          </div>
          <CossBadge variant="neutral">Modelo Monte Carlo</CossBadge>
        </div>

        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection.data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#18181b" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#18181b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOptimistic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
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
                tickFormatter={(value) => `R$ ${value}`}
              />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e4e4e7',
                  borderRadius: '0.75rem',
                  color: '#18181b',
                  fontSize: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="optimistic"
                name="Cenário Otimista"
                stroke="#059669"
                strokeDasharray="4 4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorOptimistic)"
              />
              <Area
                type="monotone"
                dataKey="pessimistic"
                name="Cenário Conservador"
                stroke="#dc2626"
                strokeDasharray="4 4"
                strokeWidth={2}
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="projected"
                name="Projeção Base"
                stroke="#18181b"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorProjected)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 text-xs text-zinc-500 p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl leading-relaxed">
          <p><strong className="text-zinc-800">Metodologia:</strong> O cenário projetado utiliza a média de novos clientes e churn rate dos últimos 3 meses. 
          O cenário otimista assume um aumento de 15% em novas vendas e redução de 10% no churn. 
          O cenário pessimista assume uma queda de 15% nas vendas e aumento de 10% no churn.</p>
        </div>
      </div>
    </div>
  );
};
