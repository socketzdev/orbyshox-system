import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { apiGet, apiPatch } from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { CossBadge, CossSwitch } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { Plus, Search, Download, ShieldCheck, User, Users, Shield, Headphones } from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import { StaffFormModal } from './staff-form-modal';

export function StaffListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isNewMemberOpen, setIsNewMemberOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet('/staff'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch(`/staff/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  const getRoleBadge = (role: string) => {
    const roles: Record<
      string,
      { label: string; variant: 'default' | 'neutral' | 'success' | 'warning' }
    > = {
      SUPER_ADMIN: { label: 'Super Admin', variant: 'default' },
      SUPPORT_MANAGER: { label: 'Gerente Suporte', variant: 'warning' },
      SUPPORT_AGENT: { label: 'Atendente', variant: 'neutral' },
      FINANCE: { label: 'Financeiro', variant: 'success' },
      FINANCIAL: { label: 'Financeiro', variant: 'success' },
      DEV: { label: 'Desenvolvedor', variant: 'neutral' },
      DEVELOPER: { label: 'Desenvolvedor', variant: 'neutral' },
    };
    const r = roles[role] || { label: role, variant: 'neutral' as const };
    return <CossBadge variant={r.variant}>{r.label}</CossBadge>;
  };

  const rawStaff = Array.isArray(data) ? data : data?.data || [];

  const filteredStaff = useMemo(() => {
    if (!search) return rawStaff;
    const s = search.toLowerCase();
    return rawStaff.filter(
      (member: any) =>
        member.name?.toLowerCase().includes(s) ||
        member.email?.toLowerCase().includes(s) ||
        member.role?.toLowerCase().includes(s)
    );
  }, [rawStaff, search]);

  const kpis = useMemo(() => {
    const total = rawStaff.length;
    const admins = rawStaff.filter((m: any) => m.role === 'SUPER_ADMIN').length;
    const support = rawStaff.filter(
      (m: any) => m.role === 'SUPPORT_AGENT' || m.role === 'SUPPORT_MANAGER'
    ).length;
    return { total, admins, support };
  }, [rawStaff]);

  const columns = useMemo(
    () => [
      {
        header: 'Operador',
        accessorKey: 'name',
        cell: ({ row }: any) => {
          const name = row.original.name || 'Operador';
          const initial = name[0].toUpperCase();
          return (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200/80 text-zinc-800 flex items-center justify-center font-bold text-xs shrink-0">
                {initial}
              </div>
              <div>
                <p className="font-semibold text-zinc-900 leading-tight">{name}</p>
                <p className="text-[11px] text-zinc-600 font-mono mt-0.5 leading-tight">
                  {row.original.email}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Função / Papel',
        accessorKey: 'role',
        cell: ({ row }: any) => getRoleBadge(row.original.role),
      },
      {
        header: 'Status',
        accessorKey: 'isActive',
        cell: ({ row }: any) => {
          const isActive = row.original.isActive !== false;
          return (
            <CossBadge variant={isActive ? 'success' : 'neutral'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </CossBadge>
          );
        },
      },
      {
        header: 'Último Acesso',
        accessorKey: 'lastLoginAt',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-600">
            {row.original.lastLoginAt
              ? format(new Date(row.original.lastLoginAt), 'dd/MM/yyyy HH:mm')
              : 'Nunca acessou'}
          </span>
        ),
      },
      {
        header: 'Ações & Acesso',
        id: 'actions',
        cell: ({ row }: any) => (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/staff/${row.original.id}/edit`)}
              className="text-xs h-7 px-3 rounded-lg border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              Editar
            </Button>
            <div className="flex items-center gap-1.5">
              <CossSwitch
                checked={row.original.isActive !== false}
                onCheckedChange={(checked) =>
                  toggleStatusMutation.mutate({
                    id: row.original.id,
                    isActive: checked,
                  })
                }
              />
            </div>
          </div>
        ),
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (!filteredStaff.length) return;
    const exportData = filteredStaff.map((s: any) => ({
      name: s.name,
      email: s.email,
      role: s.role,
      isActive: s.isActive !== false ? 'Ativo' : 'Inativo',
      lastLogin: s.lastLoginAt ? format(new Date(s.lastLoginAt), 'dd/MM/yyyy HH:mm') : 'Nunca',
    }));
    downloadCSV(
      exportData,
      [
        { key: 'name', header: 'Nome' },
        { key: 'email', header: 'E-mail' },
        { key: 'role', header: 'Função' },
        { key: 'isActive', header: 'Status' },
        { key: 'lastLogin', header: 'Último Acesso' },
      ],
      'equipe_interna'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium">
            Gestão de colaboradores, agentes de atendimento e controle de acesso ao painel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs h-9 rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-2xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-zinc-500" /> Exportar CSV
          </Button>
          <Button
            size="sm"
            onClick={() => setIsNewMemberOpen(true)}
            className="text-xs h-9 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 shadow-2xs gap-1.5"
          >
            <Plus className="h-4 w-4" /> Novo Membro
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Membros da Equipe</span>
            <div className="text-xl font-bold text-zinc-900">{kpis.total}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administradores</span>
            <div className="text-xl font-bold text-zinc-900">{kpis.admins}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Suporte / Atendimento</span>
            <div className="text-xl font-bold text-zinc-900">{kpis.support}</div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>
      </div>

      {/* Table inside Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredStaff}
          isLoading={isLoading}
          noResultsMessage="Nenhum operador encontrado"
          noResultsDescription="Nenhum membro da equipe corresponde aos termos pesquisados."
        />
      </div>

      <StaffFormModal open={isNewMemberOpen} onOpenChange={setIsNewMemberOpen} />
    </div>
  );
}
