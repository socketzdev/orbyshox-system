import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { CossBadge } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import {
  Download,
  Search,
  AlertTriangle,
  AlertCircle,
  Users,
  MessageSquare,
  ArrowUpRight,
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import { useNavigate } from 'react-router-dom';

export const DelinquencyPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['delinquent-tenants'],
    queryFn: () => apiGet('/billing/delinquency'),
  });

  const rawList = data?.data || (Array.isArray(data) ? data : []);

  const filteredList = useMemo(() => {
    return rawList.filter((item: any) => {
      const matchesSearch =
        search === '' ||
        item.tenant?.companyName?.toLowerCase().includes(search.toLowerCase());

      let matchesSeverity = true;
      if (severity === '7') matchesSeverity = item.daysOverdue >= 7 && item.daysOverdue < 14;
      else if (severity === '14') matchesSeverity = item.daysOverdue >= 14 && item.daysOverdue < 30;
      else if (severity === '30') matchesSeverity = item.daysOverdue >= 30;

      return matchesSearch && matchesSeverity;
    });
  }, [rawList, search, severity]);

  const kpis = useMemo(() => {
    const totalRisk = rawList.reduce(
      (acc: number, item: any) => acc + (item.amountCents || 0),
      0
    );
    const criticalCount = rawList.filter((item: any) => item.daysOverdue >= 14).length;
    return { totalRisk, criticalCount, totalCount: rawList.length };
  }, [rawList]);

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'companyName',
        header: 'Cliente / Empresa',
        cell: ({ row }: any) => {
          const name = row.original.tenant?.companyName || 'Empresa';
          return (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0">
                {name[0].toUpperCase()}
              </div>
              <div>
                <span className="font-semibold text-zinc-900 block">{name}</span>
                <span className="text-[11px] text-zinc-600 font-mono">
                  {row.original.tenant?.cnpj || row.original.tenant?.email || '-'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'daysOverdue',
        header: 'Dias em Atraso',
        cell: ({ row }: any) => {
          const days = row.original.daysOverdue || 0;
          return (
            <CossBadge variant={days >= 14 ? 'danger' : 'warning'}>
              {days} dias em atraso
            </CossBadge>
          );
        },
      },
      {
        accessorKey: 'amountOwed',
        header: 'Valor em Aberto',
        cell: ({ row }: any) => (
          <span className="font-bold text-rose-600 font-mono text-xs">
            {formatCurrency(row.original.amountCents || 0)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status da Assinatura',
        cell: ({ row }: any) => {
          const days = row.original.daysOverdue;
          const isSuspended = days >= 14;
          return (
            <CossBadge variant={isSuspended ? 'danger' : 'warning'}>
              {isSuspended ? 'Suspensão Iminente' : 'Cobrança Ativa'}
            </CossBadge>
          );
        },
      },
      {
        id: 'actions',
        header: 'Ação Rápida',
        cell: ({ row }: any) => {
          const tenantId = row.original.tenantId || row.original.tenant?.id;
          return (
            <div className="flex items-center gap-1.5">
              {tenantId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/tenants/${tenantId}`)}
                  className="h-7 px-2.5 text-[11px] rounded-lg border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  Ver Cliente <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (!filteredList.length) return;
    const exportData = filteredList.map((item: any) => ({
      company: item.tenant?.companyName || '-',
      days: item.daysOverdue,
      amount: ((item.amountCents || 0) / 100).toFixed(2),
      status: item.daysOverdue >= 14 ? 'SUSPENDED' : 'PAST_DUE',
    }));
    downloadCSV(
      exportData,
      [
        { key: 'company', header: 'Cliente' },
        { key: 'days', header: 'Dias em Atraso' },
        { key: 'amount', header: 'Valor Devido (R$)' },
        { key: 'status', header: 'Status' },
      ],
      'inadimplencia_saas'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Monitoramento em tempo real de faturas vencidas, cobrança preventiva e combate ao churn.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="text-xs h-9 rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-2xs gap-1.5"
        >
          <Download className="h-3.5 w-3.5 text-zinc-500" /> Exportar CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Total em Risco</span>
            <div className="text-xl font-bold text-rose-600 font-sans">{formatCurrency(kpis.totalRisk)}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Atraso Crítico (&gt;14d)</span>
            <div className="text-xl font-bold text-zinc-900">{kpis.criticalCount} assinantes</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Total em Aberto</span>
            <div className="text-xl font-bold text-zinc-900">{kpis.totalCount} clientes</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por cliente em atraso..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>

        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl overflow-x-auto">
          {([
            { id: 'ALL', label: 'Todos os períodos' },
            { id: '7', label: '7 a 13 dias' },
            { id: '14', label: '14 a 29 dias (Crítico)' },
            { id: '30', label: '30+ dias (Cancelamento)' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSeverity(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                severity === opt.id
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table inside Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredList}
          isLoading={isLoading}
          noResultsMessage="Nenhum cliente inadimplente"
          noResultsDescription="Todas as assinaturas estão em dia com os ciclos de faturamento."
        />
      </div>
    </div>
  );
};
