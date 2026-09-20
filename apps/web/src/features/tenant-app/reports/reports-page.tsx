import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Percent,
  CreditCard,
  Award,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  Download,
  Printer,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'month', label: 'Este Mês' },
];

export const ReportsPage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('today');

  const { data, isLoading } = useQuery({
    queryKey: ['reports-summary', slug, period],
    queryFn: () => apiGet(`/tenant-app/${slug}/reports/summary?period=${period}`),
    refetchInterval: 30000,
  });

  const totalSalesCents = data?.totalSalesCents || 0;
  const totalOrdersCount = data?.totalOrdersCount || 0;
  const averageTicketCents = data?.averageTicketCents || 0;
  const grossProfitCents = data?.grossProfitCents || 0;
  const profitMarginPct = data?.profitMarginPct || 0;
  const totalLossesCents = data?.totalLossesCents || 0;

  const paymentMethods = data?.paymentMethods || {};
  const topProducts = data?.topProducts || [];
  const bottomProducts = data?.bottomProducts || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Relatórios Gerenciais
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Análise consolidada de faturamento, margem de lucro, curva de giro de produtos e perdas operacionais.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => navigate(`${base}/reports/closing`)}
            className="h-9 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            title="Gerar e imprimir o fechamento do dia na impressora térmica"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Relatório Vendas de Hoje
          </Button>
          <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-2xl overflow-x-auto max-w-full scrollbar-none">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap ${
                period === p.id
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {p.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Faturamento Bruto
          </span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{brl(totalSalesCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">{totalOrdersCount} vendas realizadas</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Ticket Médio
          </span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{brl(averageTicketCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Por cliente / compra</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Lucro Bruto Estimado
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">{brl(grossProfitCents)}</p>
          <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">
            Margem de {profitMarginPct}%
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Perdas & Quebras
          </span>
          <p className="text-2xl font-bold text-rose-600 mt-1 font-mono">{brl(totalLossesCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Baixadas no período</span>
        </div>
      </div>

      {/* Grid: Payment Methods & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment Methods */}
        <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Vendas por Forma de Pagamento
            </span>
            <span className="text-xs font-mono text-zinc-400">{totalOrdersCount} vendas</span>
          </div>

          {Object.keys(paymentMethods).length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              Nenhuma venda registrada no período selecionado.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(paymentMethods).map(([method, stats]: [string, any]) => {
                const pct = totalSalesCents > 0 ? Math.round((stats.totalCents / totalSalesCents) * 100) : 0;
                const label =
                  method === 'CASH'
                    ? 'Dinheiro em Espécie'
                    : method === 'PIX'
                    ? 'Pix'
                    : method === 'DEBIT_CARD'
                    ? 'Cartão de Débito'
                    : method === 'CREDIT_CARD'
                    ? 'Cartão de Crédito'
                    : method === 'VOUCHER'
                    ? 'Vale Refeição / Alimentação (VR/VA)'
                    : method === 'ON_CREDIT' || method === 'FIADO'
                    ? 'Fiado na Caderneta'
                    : method;

                return (
                  <div key={method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-700">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-400 text-[11px]">{stats.count}x</span>
                        <span className="font-mono font-bold text-zinc-900">{brl(stats.totalCents)}</span>
                        <span className="text-[10px] text-zinc-400 w-8 text-right font-mono">({pct}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-zinc-800 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top 10 Products */}
        <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Top Produtos Mais Vendidos
            </span>
            <span className="text-xs text-zinc-400 font-mono">Ranking por Faturamento</span>
          </div>

          {topProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              Nenhum produto vendido no período selecionado.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {topProducts.map((p: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center font-mono font-bold text-[10px] text-zinc-700 shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-zinc-900 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-zinc-500 text-[11px]">{p.quantity} un</span>
                    <span className="font-mono font-bold text-zinc-900">{brl(p.revenueCents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low turnover / Bottom Products */}
      {bottomProducts.length > 0 && (
        <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              Produtos com Menor Giro (Oportunidades de Promoção)
            </span>
            <span className="text-xs text-zinc-400">Itens com baixo volume de vendas no período</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {bottomProducts.map((p: any, idx: number) => (
              <div key={idx} className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs space-y-1">
                <span className="font-semibold text-zinc-900 block truncate">{p.name}</span>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-500">Saídas:</span>
                  <span className="font-mono font-bold text-zinc-800">{p.quantity} un</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-500">Total:</span>
                  <span className="font-mono font-bold text-zinc-800">{brl(p.revenueCents)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
