import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { CossBadge } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { Download, Search, ShieldCheck, Terminal, Shield } from 'lucide-react';
import { downloadCSV } from '@/lib/export';

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, pageSize, actionFilter],
    queryFn: () =>
      apiGet('/audit', {
        page,
        pageSize,
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
      }),
  });

  const translateAction = (action: string) => {
    const map: Record<string, string> = {
      LOGIN: 'Login no Sistema',
      TENANT_SUSPEND: 'Suspensão de Conta',
      TENANT_REACTIVATE: 'Reativação de Conta',
      TENANT_CANCEL: 'Cancelamento de Conta',
      PLAN_CREATE: 'Criação de Plano',
      PLAN_UPDATE: 'Atualização de Plano',
      TICKET_RESOLVE: 'Resolução de Ticket',
      TRIAL_EXTEND: 'Extensão de Trial',
    };
    return map[action] || action;
  };

  const rawLogs = data?.data || (Array.isArray(data) ? data : []);

  const filteredLogs = useMemo(() => {
    if (!search) return rawLogs;
    const s = search.toLowerCase();
    return rawLogs.filter(
      (log: any) =>
        log.user?.name?.toLowerCase().includes(s) ||
        log.targetType?.toLowerCase().includes(s) ||
        log.ipAddress?.includes(s) ||
        log.action?.toLowerCase().includes(s)
    );
  }, [rawLogs, search]);

  const columns = useMemo(
    () => [
      {
        header: 'Data / Hora',
        accessorKey: 'createdAt',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-600">
            {row.original.createdAt
              ? format(new Date(row.original.createdAt), 'dd/MM/yyyy HH:mm:ss')
              : '-'}
          </span>
        ),
      },
      {
        header: 'Operador / Usuário',
        accessorKey: 'user.name',
        cell: ({ row }: any) => (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-800 font-mono text-[10.5px] flex items-center justify-center font-bold border border-zinc-200/60">
              {row.original.user?.name ? row.original.user.name[0].toUpperCase() : 'S'}
            </div>
            <span className="font-semibold text-zinc-900 text-xs">
              {row.original.user?.name || 'Sistema (Automático)'}
            </span>
          </div>
        ),
      },
      {
        header: 'Ação Registrada',
        accessorKey: 'action',
        cell: ({ row }: any) => {
          const act = row.original.action || '';
          const variant =
            act.includes('SUSPEND') || act.includes('CANCEL')
              ? 'danger'
              : act.includes('CREATE') || act.includes('REACTIVATE')
              ? 'success'
              : act.includes('LOGIN')
              ? 'default'
              : 'neutral';

          return <CossBadge variant={variant}>{translateAction(act)}</CossBadge>;
        },
      },
      {
        header: 'Entidade / Alvo',
        accessorKey: 'target',
        cell: ({ row }: any) => (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-50 border border-zinc-200/80 font-mono text-[11px] text-zinc-800">
            <span className="font-semibold">{row.original.targetType}</span>
            <span className="text-zinc-600">#{row.original.targetId?.slice(0, 8)}</span>
          </div>
        ),
      },
      {
        header: 'Endereço IP',
        accessorKey: 'ipAddress',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-600">
            {row.original.ipAddress || '127.0.0.1'}
          </span>
        ),
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (!filteredLogs.length) return;
    const exportData = filteredLogs.map((l: any) => ({
      date: l.createdAt ? format(new Date(l.createdAt), 'dd/MM/yyyy HH:mm:ss') : '-',
      user: l.user?.name || 'Sistema',
      action: l.action,
      target: `${l.targetType} #${l.targetId}`,
      ip: l.ipAddress || '-',
    }));
    downloadCSV(
      exportData,
      [
        { key: 'date', header: 'Data/Hora' },
        { key: 'user', header: 'Operador' },
        { key: 'action', header: 'Ação' },
        { key: 'target', header: 'Alvo' },
        { key: 'ip', header: 'IP' },
      ],
      'auditoria_saas'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Trilha imutável de conformidade, eventos administrativos e ações de segurança do painel.
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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por operador, ação ou IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-zinc-200/80 bg-zinc-50 text-xs font-medium text-zinc-800 focus:bg-white focus:border-zinc-900 focus:outline-none"
        >
          <option value="ALL">Todas as Ações</option>
          <option value="LOGIN">Login no Sistema</option>
          <option value="TENANT_SUSPEND">Suspensão de Conta</option>
          <option value="TENANT_CANCEL">Cancelamento de Conta</option>
          <option value="PLAN_CREATE">Criação de Plano</option>
          <option value="TRIAL_EXTEND">Extensão de Trial</option>
        </select>
      </div>

      {/* Table inside Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredLogs}
          pageCount={data?.pageCount || 1}
          isLoading={isLoading}
          onPaginationChange={(pagination) => {
            setPage(pagination.pageIndex + 1);
            setPageSize(pagination.pageSize);
          }}
          noResultsMessage="Nenhum log de auditoria encontrado"
          noResultsDescription="Nenhum evento registrado com os parâmetros de pesquisa selecionados."
        />
      </div>
    </div>
  );
}
