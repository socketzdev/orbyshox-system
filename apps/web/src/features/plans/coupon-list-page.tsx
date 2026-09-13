import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { apiGet, apiDelete, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CossBadge } from '@/components/coss-ui';
import { DataTable } from '@/components/data-table/data-table';
import {
  Plus,
  Search,
  Download,
  Tag,
  MoreHorizontal,
  Power,
  Copy,
  Trash2,
  Ticket,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

export const CouponListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [couponToRemove, setCouponToRemove] = useState<{ id: string; code: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: () => apiGet('/coupons'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/coupons/${id}/toggle`),
    onSuccess: () => {
      toast.success('Status do cupom atualizado');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
    onError: () => toast.error('Falha ao atualizar status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/coupons/${id}`),
    onSuccess: () => {
      toast.success('Cupom removido');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Falha ao remover'),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Código "${code}" copiado!`);
  };

  const rawList = data?.data || (Array.isArray(data) ? data : []);

  const filteredList = useMemo(() => {
    if (!search) return rawList;
    return rawList.filter((coupon: any) =>
      coupon.code?.toLowerCase().includes(search.toLowerCase())
    );
  }, [rawList, search]);

  const stats = useMemo(() => {
    const total = rawList.length;
    const active = rawList.filter((c: any) => c.isActive).length;
    const totalUses = rawList.reduce((acc: number, c: any) => acc + (c.usedCount || 0), 0);
    return { total, active, totalUses };
  }, [rawList]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Código do Cupom',
        cell: ({ row }: any) => (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <span className="font-mono font-bold text-xs text-zinc-900 px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-200/80 tracking-wider">
              {row.original.code}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'discount',
        header: 'Desconto',
        cell: ({ row }: any) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold font-mono text-xs border border-emerald-200/60">
            {row.original.discountType === 'PERCENTAGE'
              ? `${row.original.discountValue}% OFF`
              : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  (row.original.discountValue || 0) / 100
                )}
          </span>
        ),
      },
      {
        accessorKey: 'uses',
        header: 'Utilizações',
        cell: ({ row }: any) => (
          <span className="font-mono text-xs text-zinc-600">
            <span className="font-bold text-zinc-900">{row.original.usedCount || 0}</span>
            <span className="text-zinc-600"> / {row.original.maxUses || 'Ilimitado'}</span>
          </span>
        ),
      },
      {
        accessorKey: 'validity',
        header: 'Vigência',
        cell: ({ row }: any) => {
          const from = row.original.validFrom
            ? format(new Date(row.original.validFrom), 'dd/MM/yyyy')
            : 'Imediato';
          const until = row.original.validUntil
            ? format(new Date(row.original.validUntil), 'dd/MM/yyyy')
            : 'Sem expiração';
          return (
            <span className="text-xs text-zinc-600 font-medium">
              {from} <span className="text-zinc-600">→</span> {until}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: any) => {
          const isActive = row.original.isActive;
          return (
            <CossBadge variant={isActive ? 'success' : 'neutral'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </CossBadge>
          );
        },
      },
      {
        id: 'actions',
        header: 'Ações',
        cell: ({ row }: any) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1 bg-white border border-zinc-200/80 shadow-md">
              <DropdownMenuItem
                onClick={() => copyCode(row.original.code)}
                className="text-xs gap-2 rounded-xl cursor-pointer text-zinc-700 hover:bg-zinc-50"
              >
                <Copy className="w-3.5 h-3.5 text-zinc-500" />
                Copiar código
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toggleMutation.mutate(row.original.id)}
                className="text-xs gap-2 rounded-xl cursor-pointer text-zinc-700 hover:bg-zinc-50"
              >
                <Power className="w-3.5 h-3.5 text-zinc-500" />
                {row.original.isActive ? 'Desativar cupom' : 'Ativar cupom'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setCouponToRemove({ id: row.original.id, code: row.original.code })}
                className="text-xs gap-2 rounded-xl cursor-pointer text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (!filteredList.length) return;
    const exportData = filteredList.map((c: any) => ({
      code: c.code,
      discount:
        c.discountType === 'PERCENTAGE'
          ? `${c.discountValue}%`
          : `R$ ${(c.discountValue / 100).toFixed(2)}`,
      used: c.usedCount || 0,
      max: c.maxUses || 'Ilimitado',
      status: c.isActive ? 'Ativo' : 'Inativo',
    }));
    downloadCSV(
      exportData,
      [
        { key: 'code', header: 'Código' },
        { key: 'discount', header: 'Desconto' },
        { key: 'used', header: 'Usado' },
        { key: 'max', header: 'Limite' },
        { key: 'status', header: 'Status' },
      ],
      'cupons_saas'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Campanhas promocionais, percentuais de desconto e limites de resgate para assinantes.
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
          <Button
            size="sm"
            onClick={() => navigate('/coupons/new')}
            className="text-xs h-9 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 shadow-2xs gap-1.5"
          >
            <Plus className="h-4 w-4" /> Novo Cupom
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Total de Cupons</span>
            <div className="text-xl font-bold text-zinc-900">{stats.total}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Cupons Ativos</span>
            <div className="text-xl font-bold text-zinc-900">{stats.active}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Resgates Realizados</span>
            <div className="text-xl font-bold text-zinc-900">{stats.totalUses}</div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por código de cupom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-3.5 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 uppercase font-mono transition-all"
          />
        </div>
      </div>

      {/* Table inside Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredList}
          isLoading={isLoading}
          noResultsMessage="Nenhum cupom cadastrado"
          noResultsDescription="Clique em 'Novo Cupom' para criar sua primeira campanha promocional."
        />
      </div>

      <ConfirmDialog
        open={!!couponToRemove}
        onOpenChange={(v) => !v && setCouponToRemove(null)}
        title="Remover cupom?"
        description={
          couponToRemove
            ? `O cupom "${couponToRemove.code}" será removido permanentemente. Clientes que já o utilizaram não serão afetados.`
            : undefined
        }
        confirmLabel="Remover cupom"
        tone="destructive"
        onConfirm={async () => {
          if (couponToRemove) await deleteMutation.mutateAsync(couponToRemove.id);
        }}
      />
    </div>
  );
};
