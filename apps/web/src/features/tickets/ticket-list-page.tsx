import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { CossBadge } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { TicketCategory, TicketPriority, TicketStatus } from '@projeto-saas/shared-types';
import {
  Download,
  Search,
  Headphones,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';

export function TicketListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [status, setStatusState] = useState<TicketStatus | 'ALL'>(
    (searchParams.get('status') as any) || 'ALL'
  );
  const [priority, setPriority] = useState<TicketPriority | 'ALL'>('ALL');
  const [category, setCategory] = useState<TicketCategory | 'ALL'>('ALL');

  useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && urlStatus !== status) setStatusState(urlStatus as any);
  }, [searchParams]);

  const setStatus = (val: TicketStatus | 'ALL') => {
    setStatusState(val);
    const next = new URLSearchParams(searchParams);
    if (val === 'ALL') {
      next.delete('status');
    } else {
      next.set('status', val);
    }
    setSearchParams(next);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page, pageSize, search, status, priority, category],
    queryFn: () =>
      apiGet('/tickets', {
        page,
        pageSize,
        search,
        status: status !== 'ALL' ? status : undefined,
        priority: priority !== 'ALL' ? priority : undefined,
        category: category !== 'ALL' ? category : undefined,
      }),
  });

  const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  const getCategoryBadge = (cat: TicketCategory) => {
    const map: Record<TicketCategory, string> = {
      FINANCIAL: 'Financeiro',
      TECHNICAL: 'Técnico',
      USAGE_QUESTION: 'Dúvida',
      FEATURE_REQUEST: 'Solicitação',
      OTHER: 'Outro',
    };
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-zinc-100 text-zinc-700 text-[11px] font-semibold border border-zinc-200/80">
        {map[cat] || cat}
      </span>
    );
  };

  const getPriorityBadge = (p: TicketPriority) => {
    const map: Record<
      TicketPriority,
      { label: string; variant: 'danger' | 'warning' | 'neutral' | 'outline' }
    > = {
      CRITICAL: { label: 'Crítica', variant: 'danger' },
      HIGH: { label: 'Alta', variant: 'warning' },
      MEDIUM: { label: 'Média', variant: 'neutral' },
      LOW: { label: 'Baixa', variant: 'outline' },
    };
    const c = map[p] || { label: p, variant: 'neutral' as const };
    return <CossBadge variant={c.variant}>{c.label}</CossBadge>;
  };

  const getStatusBadge = (s: TicketStatus) => {
    const map: Record<
      TicketStatus,
      { label: string; variant: 'warning' | 'neutral' | 'success' | 'outline' }
    > = {
      OPEN: { label: 'Aberto', variant: 'warning' },
      IN_PROGRESS: { label: 'Em Andamento', variant: 'neutral' },
      WAITING_CUSTOMER: { label: 'Aguardando Cliente', variant: 'outline' },
      RESOLVED: { label: 'Resolvido', variant: 'success' },
      CLOSED: { label: 'Fechado', variant: 'outline' },
    };
    const c = map[s] || { label: s, variant: 'neutral' as const };
    return <CossBadge variant={c.variant}>{c.label}</CossBadge>;
  };

  const columns = useMemo(
    () => [
      {
        header: 'Chamado',
        accessorKey: 'subject',
        cell: ({ row }: any) => (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700 shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-zinc-900 block truncate max-w-sm">
                {row.original.subject}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                #{row.original.id?.substring(0, 8) || '0000'}
              </span>
            </div>
          </div>
        ),
      },
      {
        header: 'Cliente / Empresa',
        accessorKey: 'tenant.companyName',
        cell: ({ row }: any) => (
          <span className="font-semibold text-zinc-900">
            {row.original.tenant?.companyName || '-'}
          </span>
        ),
      },
      {
        header: 'Categoria',
        accessorKey: 'category',
        cell: ({ row }: any) => getCategoryBadge(row.original.category),
      },
      {
        header: 'Prioridade',
        accessorKey: 'priority',
        cell: ({ row }: any) => getPriorityBadge(row.original.priority),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }: any) => getStatusBadge(row.original.status),
      },
      {
        header: 'Responsável',
        accessorKey: 'assignee.name',
        cell: ({ row }: any) => (
          <span className="text-xs font-medium text-zinc-600">
            {row.original.assignee?.name || 'Não atribuído'}
          </span>
        ),
      },
      {
        header: 'Data de Abertura',
        accessorKey: 'createdAt',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-500">
            {row.original.createdAt
              ? format(new Date(row.original.createdAt), 'dd/MM/yyyy HH:mm')
              : '-'}
          </span>
        ),
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (!rawList.length) return;
    const exportData = rawList.map((t: any) => ({
      id: t.id?.substring(0, 8),
      subject: t.subject,
      company: t.tenant?.companyName || '-',
      category: t.category,
      priority: t.priority,
      status: t.status,
      assignee: t.assignee?.name || 'Não atribuído',
      createdAt: t.createdAt ? format(new Date(t.createdAt), 'dd/MM/yyyy HH:mm') : '-',
    }));
    downloadCSV(
      exportData,
      [
        { key: 'id', header: 'ID' },
        { key: 'subject', header: 'Assunto' },
        { key: 'company', header: 'Empresa' },
        { key: 'category', header: 'Categoria' },
        { key: 'priority', header: 'Prioridade' },
        { key: 'status', header: 'Status' },
        { key: 'assignee', header: 'Responsável' },
        { key: 'createdAt', header: 'Abertura' },
      ],
      'chamados_suporte'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Gestão de tickets de suporte técnico, SLA de atendimento e comunicação com assinantes.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs h-9 rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-2xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-zinc-500" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Chamados Abertos</span>
            <div className="text-xl font-bold text-zinc-900">
              {rawList.filter((t: any) => t.status === 'OPEN').length}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Em Andamento</span>
            <div className="text-xl font-bold text-zinc-900">
              {rawList.filter((t: any) => t.status === 'IN_PROGRESS').length}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Resolvidos</span>
            <div className="text-xl font-bold text-zinc-900">
              {rawList.filter((t: any) => t.status === 'RESOLVED').length}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por assunto do chamado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl overflow-x-auto">
          {([
            { id: 'ALL', label: 'Todos' },
            { id: 'OPEN', label: 'Abertos' },
            { id: 'IN_PROGRESS', label: 'Em Andamento' },
            { id: 'RESOLVED', label: 'Resolvidos' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStatus(opt.id as any)}
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
          data={rawList}
          pageCount={data?.pageCount || 1}
          isLoading={isLoading}
          onPaginationChange={(pagination) => {
            setPage(pagination.pageIndex + 1);
            setPageSize(pagination.pageSize);
          }}
          onRowClick={(row: any) => navigate(`/tickets/${row.id}`)}
          noResultsMessage="Nenhum ticket encontrado"
          noResultsDescription="Nenhum chamado corresponde aos filtros aplicados."
        />
      </div>
    </div>
  );
}
