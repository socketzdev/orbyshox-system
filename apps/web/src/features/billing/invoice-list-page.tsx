import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { CossBadge } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import {
  Download,
  Search,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { downloadCSV } from '@/lib/export';

export const InvoiceListPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const [search, setSearch] = useState('');
  const [status, setStatusState] = useState(urlStatus || 'ALL');

  useEffect(() => {
    if (urlStatus && urlStatus !== status) setStatusState(urlStatus);
  }, [urlStatus]);

  const setStatus = (val: string) => setStatusState(val);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => apiGet('/billing/invoices'),
  });

  const rawInvoices = data?.data || (Array.isArray(data) ? data : []);

  const filteredInvoices = useMemo(() => {
    return rawInvoices.filter((inv: any) => {
      const matchesSearch =
        search === '' ||
        inv.tenant?.companyName?.toLowerCase().includes(search.toLowerCase()) ||
        inv.id?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === 'ALL' || inv.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [rawInvoices, search, status]);

  // Top KPIs
  const kpis = useMemo(() => {
    const totalAmount = rawInvoices.reduce(
      (acc: number, inv: any) => acc + (inv.amountCents || 0),
      0
    );
    const paidCount = rawInvoices.filter((inv: any) => inv.status === 'PAID').length;
    const pendingCount = rawInvoices.filter((inv: any) => inv.status === 'PENDING').length;
    const overdueCount = rawInvoices.filter((inv: any) => inv.status === 'OVERDUE').length;

    return { totalAmount, paidCount, pendingCount, overdueCount };
  }, [rawInvoices]);

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'Fatura',
        cell: ({ row }: any) => (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <span className="font-mono font-semibold text-xs text-zinc-900">
              #{row.original.id?.substring(0, 8).toUpperCase() || 'FAT-000'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'companyName',
        header: 'Cliente / Empresa',
        cell: ({ row }: any) => (
          <span className="font-semibold text-zinc-900">
            {row.original.tenant?.companyName || 'Empresa Desconhecida'}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Valor',
        cell: ({ row }: any) => (
          <span className="font-bold text-zinc-900 font-mono text-xs">
            {formatCurrency(row.original.amountCents || 0)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: any) => {
          const s = row.original.status;
          const map: Record<
            string,
            { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
          > = {
            PAID: { label: 'Paga', variant: 'success' },
            PENDING: { label: 'Pendente', variant: 'warning' },
            OVERDUE: { label: 'Vencida', variant: 'danger' },
            CANCELED: { label: 'Cancelada', variant: 'neutral' },
          };
          const c = map[s as string] || { label: s, variant: 'neutral' as const };
          return <CossBadge variant={c.variant}>{c.label}</CossBadge>;
        },
      },
      {
        accessorKey: 'dueDate',
        header: 'Vencimento',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-600">
            {row.original.dueDate ? format(new Date(row.original.dueDate), 'dd/MM/yyyy') : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'paidAt',
        header: 'Data de Liquidação',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-600">
            {row.original.paidAt ? format(new Date(row.original.paidAt), 'dd/MM/yyyy') : '-'}
          </span>
        ),
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (!filteredInvoices.length) return;
    const exportData = filteredInvoices.map((inv: any) => ({
      id: inv.id,
      company: inv.tenant?.companyName || '-',
      amount: ((inv.amountCents || 0) / 100).toFixed(2),
      status: inv.status,
      dueDate: inv.dueDate ? format(new Date(inv.dueDate), 'dd/MM/yyyy') : '-',
      paidAt: inv.paidAt ? format(new Date(inv.paidAt), 'dd/MM/yyyy') : '-',
    }));
    downloadCSV(
      exportData,
      [
        { key: 'id', header: 'ID Fatura' },
        { key: 'company', header: 'Cliente' },
        { key: 'amount', header: 'Valor (R$)' },
        { key: 'status', header: 'Status' },
        { key: 'dueDate', header: 'Vencimento' },
        { key: 'paidAt', header: 'Pagamento' },
      ],
      'faturas_saas'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Histórico consolidado, liquidações e status de faturas geradas aos assinantes.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Volume Total</span>
            <div className="text-lg font-bold text-zinc-900">{formatCurrency(kpis.totalAmount)}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Liquidadas</span>
            <div className="text-lg font-bold text-zinc-900">{kpis.paidCount} faturas</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Pendentes</span>
            <div className="text-lg font-bold text-zinc-900">{kpis.pendingCount} faturas</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Vencidas</span>
            <div className="text-lg font-bold text-rose-600">{kpis.overdueCount} faturas</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por cliente ou código da fatura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>

        {/* Status Pill Filters */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl overflow-x-auto">
          {([
            { id: 'ALL', label: 'Todas' },
            { id: 'PAID', label: 'Pagas' },
            { id: 'PENDING', label: 'Pendentes' },
            { id: 'OVERDUE', label: 'Vencidas' },
            { id: 'CANCELED', label: 'Canceladas' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStatus(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                status === opt.id
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
          data={filteredInvoices}
          isLoading={isLoading}
          noResultsMessage="Nenhuma fatura encontrada"
          noResultsDescription="Nenhum lançamento corresponde aos filtros selecionados."
        />
      </div>
    </div>
  );
};
