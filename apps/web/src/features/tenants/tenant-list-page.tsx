import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Download,
  Search,
  Building2,
  Plus,
  ExternalLink,
  CheckCircle2,
  Copy,
  Zap,
  Store,
  Scissors,
  ShoppingCart,
  DollarSign,
  Users,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  AlertTriangle,
  Clock,
  Ban,
  RotateCcw,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { downloadCSV } from '@/lib/export';
import { toast } from 'sonner';
import { CreateTenantModal } from './components/create-tenant-modal';

const formatCurrency = (valueInCents: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInCents / 100);
};

export const TenantListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter & Search states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [niche, setNiche] = useState('ALL');
  const [status, setStatusState] = useState(searchParams.get('status') || 'ALL');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    type: 'suspend' | 'reactivate' | 'cancel' | 'extendTrial';
    tenant: any | null;
  }>({
    open: false,
    type: 'suspend',
    tenant: null,
  });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && urlStatus !== status) {
      setStatusState(urlStatus);
    }
  }, [searchParams]);

  const setStatus = (val: string) => {
    setStatusState(val);
    const next = new URLSearchParams(searchParams);
    if (val === 'ALL') {
      next.delete('status');
    } else {
      next.set('status', val);
    }
    setSearchParams(next);
  };

  // Real backend query for tenants
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tenants', { limit: 100 }],
    queryFn: () => apiGet('/tenants', { limit: 100 }),
  });

  const rawTenants = useMemo(() => {
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data)) return data;
    return [];
  }, [data]);

  // Overall KPIs calculated from real database tenants
  const kpis = useMemo(() => {
    const total = rawTenants.length;
    const active = rawTenants.filter((t: any) => t.status === 'ACTIVE' || !t.status).length;
    const trial = rawTenants.filter((t: any) => t.status === 'TRIAL').length;
    const pastDue = rawTenants.filter((t: any) => t.status === 'PAST_DUE').length;
    const suspended = rawTenants.filter((t: any) => t.status === 'SUSPENDED' || t.status === 'CANCELED').length;
    const restaurants = rawTenants.filter((t: any) => t.niche === 'RESTAURANT').length;
    const barbers = rawTenants.filter((t: any) => t.niche === 'BARBERSHOP').length;
    const markets = rawTenants.filter((t: any) => t.niche === 'SUPERMARKET').length;

    const totalMrr = rawTenants.reduce((acc: number, t: any) => {
      const price = t.subscriptions?.[0]?.plan?.price || t.subscription?.price || 19900;
      return acc + price;
    }, 0);

    return { total, active, trial, pastDue, suspended, restaurants, barbers, markets, totalMrr };
  }, [rawTenants]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    return rawTenants
      .filter((t: any) => {
        const q = search.toLowerCase().trim();
        const matchesSearch =
          !q ||
          (t.tradeName || '').toLowerCase().includes(q) ||
          (t.companyName || '').toLowerCase().includes(q) ||
          (t.cnpj || '').includes(q) ||
          (t.slug || '').toLowerCase().includes(q);

        const matchesNiche = niche === 'ALL' || t.niche === niche;
        const matchesStatus = status === 'ALL' || (t.status || 'ACTIVE') === status;

        return matchesSearch && matchesNiche && matchesStatus;
      })
      .sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }, [rawTenants, search, niche, status]);

  // Pagination
  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPageSafe = Math.min(page, totalPages);
  const startIndex = (currentPageSafe - 1) * pageSize;
  const paginatedData = useMemo(() => {
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, startIndex, pageSize]);

  // Copy helper
  const copyToClipboard = (text: string, label: string = 'Link copiado com sucesso!') => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!filteredData.length) {
      toast.error('Nenhuma empresa encontrada para exportar.');
      return;
    }
    const exportData = filteredData.map((t: any) => ({
      companyName: t.tradeName || t.companyName,
      niche: t.niche,
      slug: t.slug,
      status: t.status || 'ACTIVE',
      createdAt: t.createdAt ? format(new Date(t.createdAt), 'dd/MM/yyyy') : '-',
      price: (t.subscriptions?.[0]?.plan?.price || 19900) / 100,
    }));
    downloadCSV(
      exportData,
      [
        { key: 'companyName', header: 'Empresa' },
        { key: 'niche', header: 'Segmento' },
        { key: 'slug', header: 'Identificador' },
        { key: 'status', header: 'Status' },
        { key: 'createdAt', header: 'Data de Cadastro' },
        { key: 'price', header: 'Mensalidade (R$)' },
      ],
      'empresas_cadastradas'
    );
    toast.success('Relatório CSV exportado com sucesso!');
  };

  // Real actions executed on backend
  const handleExecuteAction = async () => {
    if (!actionModal.tenant) return;
    const { id, tradeName, companyName } = actionModal.tenant;
    const displayName = tradeName || companyName;

    setActionLoading(true);
    try {
      if (actionModal.type === 'suspend') {
        await apiPost(`/tenants/${id}/suspend`, { reason: 'Suspensão administrativa pelo painel' });
        toast.success(`Empresa "${displayName}" suspensa com sucesso!`);
      } else if (actionModal.type === 'reactivate') {
        await apiPost(`/tenants/${id}/reactivate`, {});
        toast.success(`Empresa "${displayName}" reativada com sucesso!`);
      } else if (actionModal.type === 'extendTrial') {
        await apiPost(`/tenants/${id}/extend-trial`, { days: 7 });
        toast.success(`Período de teste de "${displayName}" estendido por +7 dias!`);
      } else if (actionModal.type === 'cancel') {
        await apiPost(`/tenants/${id}/cancel`, {});
        toast.success(`Contrato da empresa "${displayName}" cancelado.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      await refetch();
      setActionModal({ open: false, type: 'suspend', tenant: null });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Falha ao executar ação.';
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-16 font-sans select-none">
      {/* ─── Topo: Descrição & Botões de Ação ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Gerenciamento e controle de empresas clientes conectadas à plataforma.
        </p>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-9 px-3.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 rounded-xl border border-zinc-200/80 shadow-2xs gap-2 cursor-pointer transition-all"
          >
            <Download className="h-3.5 w-3.5 text-zinc-400" />
            <span>Exportar CSV</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="h-9 px-4 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Empresa</span>
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards Clean, Modernos e Alinhados ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Empresas */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/70 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Total de Empresas</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
              {kpis.total}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Clientes cadastrados na base</p>
          </div>
        </div>

        {/* Card 2: Empresas Ativas */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/70 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Empresas Ativas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight">
              {kpis.active}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Operando normalmente</span>
            </div>
          </div>
        </div>

        {/* Card 3: Receita Recorrente */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/70 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Receita Recorrente (MRR)</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
              {formatCurrency(kpis.totalMrr)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Faturamento mensal contratado</p>
          </div>
        </div>

        {/* Card 4: Distribuição por Segmento (Clean e Elegante) */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/70 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Segmentos Atendidos</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> Supermercados
              </span>
              <span className="font-semibold text-zinc-800">{kpis.markets}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Barbearias
              </span>
              <span className="font-semibold text-zinc-800">{kpis.barbers}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Restaurantes
              </span>
              <span className="font-semibold text-zinc-800">{kpis.restaurants}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Barra de Filtros & Busca (Ultra Clean & Organizada) ─── */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-zinc-200/70 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Campo de Pesquisa Clean */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="Buscar empresa por nome ou CNPJ..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 pl-9 pr-8 text-xs rounded-xl bg-zinc-50/70 border-zinc-200/80 focus:bg-white text-zinc-900 transition placeholder:text-zinc-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Segment Tabs & Status Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {/* Segment Filter (Estilo Moderno Tabs) */}
          <div className="flex items-center bg-zinc-100/80 p-0.5 rounded-xl border border-zinc-200/50">
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'SUPERMARKET', label: 'Mercados' },
              { id: 'BARBERSHOP', label: 'Barbearias' },
              { id: 'RESTAURANT', label: 'Restaurantes' },
            ].map((tab) => {
              const isSelected = niche === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setNiche(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-zinc-900 font-semibold shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Status Select */}
          <Select
            value={status}
            onValueChange={(val) => {
              setStatus(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs rounded-xl bg-white border-zinc-200 text-zinc-700 font-medium">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl bg-white border border-zinc-200 shadow-lg text-xs">
              <SelectItem value="ALL">Todos Status</SelectItem>
              <SelectItem value="ACTIVE">Ativo</SelectItem>
              <SelectItem value="TRIAL">Trial</SelectItem>
              <SelectItem value="PAST_DUE">Em Atraso</SelectItem>
              <SelectItem value="SUSPENDED">Suspenso</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Tabela de Empresas Clean & Moderna ─── */}
      <div className="bg-white rounded-2xl border border-zinc-200/70 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="py-3 px-5">Empresa</th>
                <th className="py-3 px-4">Segmento</th>
                <th className="py-3 px-4">Plano</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Cadastro</th>
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-zinc-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
                      <span className="text-xs font-medium">Carregando empresas...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-zinc-400">
                    <div className="max-w-xs mx-auto flex flex-col items-center justify-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <p className="font-semibold text-zinc-800 text-xs">Nenhuma empresa localizada</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          setNiche('ALL');
                          setStatus('ALL');
                        }}
                        className="h-7 px-3 text-xs rounded-lg border-zinc-200"
                      >
                        Limpar filtros
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((tenant: any) => {
                  const name = tenant.tradeName || tenant.companyName || 'Empresa';
                  const slug = tenant.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                  const tenantNiche = tenant.niche || 'BARBERSHOP';
                  const statusVal = tenant.status || 'ACTIVE';
                  const planName = tenant.subscriptions?.[0]?.plan?.name || tenant.subscription?.plan?.name || 'Plano Pro';
                  const planPrice = tenant.subscriptions?.[0]?.plan?.price || tenant.subscription?.price || 19900;

                  const initials = (name || 'EM')
                    .split(' ')
                    .map((w: string) => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  // Segmento com fonte moderna e cores elegantes
                  const segmentBadge = {
                    SUPERMARKET: {
                      label: 'Supermercado',
                      className: 'bg-[#f0f4ff] text-[#4338ca] border-[#e0e7ff]',
                      icon: <ShoppingCart className="w-3 h-3 text-[#4f46e5]" />,
                    },
                    BARBERSHOP: {
                      label: 'Barbearia',
                      className: 'bg-[#ecfdf5] text-[#047857] border-[#d1fae5]',
                      icon: <Scissors className="w-3 h-3 text-[#059669]" />,
                    },
                    RESTAURANT: {
                      label: 'Restaurante',
                      className: 'bg-[#fff7ed] text-[#c2410c] border-[#ffedd5]',
                      icon: <Store className="w-3 h-3 text-[#ea580c]" />,
                    },
                  }[tenantNiche as 'SUPERMARKET' | 'BARBERSHOP' | 'RESTAURANT'] || {
                    label: tenantNiche,
                    className: 'bg-zinc-100 text-zinc-700 border-zinc-200',
                    icon: <Building2 className="w-3 h-3 text-zinc-500" />,
                  };

                  // Status badge minimalista
                  const statusConfig = {
                    ACTIVE: {
                      label: 'Ativo',
                      className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
                      dot: 'bg-emerald-500',
                    },
                    TRIAL: {
                      label: 'Trial',
                      className: 'bg-sky-50 text-sky-700 border-sky-200/60',
                      dot: 'bg-sky-500',
                    },
                    PAST_DUE: {
                      label: 'Em Atraso',
                      className: 'bg-amber-50 text-amber-700 border-amber-200/60',
                      dot: 'bg-amber-500',
                    },
                    SUSPENDED: {
                      label: 'Suspenso',
                      className: 'bg-rose-50 text-rose-700 border-rose-200/60',
                      dot: 'bg-rose-500',
                    },
                    CANCELED: {
                      label: 'Cancelado',
                      className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
                      dot: 'bg-zinc-400',
                    },
                  }[statusVal as 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED'] || {
                    label: statusVal,
                    className: 'bg-zinc-100 text-zinc-700 border-zinc-200',
                    dot: 'bg-zinc-400',
                  };

                  return (
                    <tr
                      key={tenant.id}
                      onClick={() => navigate(`/tenants/${tenant.id}`)}
                      className="hover:bg-zinc-50/70 transition-colors cursor-pointer group"
                    >
                      {/* 1. Empresa (Avatar + Nome Limpo) */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl bg-zinc-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
                            style={tenant.primaryColor ? { backgroundColor: tenant.primaryColor } : {}}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-zinc-900 text-sm block truncate group-hover:text-blue-600 transition-colors">
                              {name}
                            </span>
                            {tenant.cnpj && (
                              <span className="text-[11px] text-zinc-400 font-mono block truncate mt-0.5">
                                {tenant.cnpj}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Segmento (Fonte Moderna & Cor Moderna) */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border tracking-tight ${segmentBadge.className}`}
                        >
                          {segmentBadge.icon}
                          <span>{segmentBadge.label}</span>
                        </span>
                      </td>

                      {/* 3. Plano & Mensalidade */}
                      <td className="py-3.5 px-4">
                        <div>
                          <span className="font-semibold text-zinc-800 text-xs block">
                            {planName}
                          </span>
                          <span className="text-[11.5px] text-zinc-500 block mt-0.5">
                            {formatCurrency(planPrice)}/mês
                          </span>
                        </div>
                      </td>

                      {/* 4. Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border ${statusConfig.className}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                          <span>{statusConfig.label}</span>
                        </span>
                      </td>

                      {/* 5. Cadastro */}
                      <td className="py-3.5 px-4">
                        <span className="text-xs text-zinc-500">
                          {tenant.createdAt
                            ? format(new Date(tenant.createdAt), 'dd MMM yyyy', { locale: ptBR })
                            : '-'}
                        </span>
                      </td>

                      {/* 6. Ações Rápidas */}
                      <td className="py-3.5 px-6 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="w-8 h-8 rounded-lg bg-transparent hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 transition flex items-center justify-center ml-auto cursor-pointer"
                              title="Mais opções"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-52 bg-white rounded-2xl p-1.5 shadow-xl border border-zinc-200 text-xs text-zinc-800 space-y-0.5 z-50"
                          >
                            <div className="px-3 py-1.5 border-b border-zinc-100 mb-1">
                              <p className="font-semibold text-zinc-900 text-xs truncate">{name}</p>
                              <p className="text-[10px] text-zinc-400 truncate">/{slug}</p>
                            </div>

                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open('/app/dashboard', '_blank');
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl font-semibold text-zinc-900 hover:bg-zinc-50 cursor-pointer"
                            >
                              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                              <span>Acessar Painel do App</span>
                              <ExternalLink className="w-3 h-3 text-zinc-400 ml-auto" />
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/tenants/${tenant.id}`);
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Ver detalhes da empresa</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(`${window.location.origin}/app/login`, 'Link de acesso ao App copiado!');
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Copiar link do App</span>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator className="bg-zinc-100 my-1" />

                            {/* Estender Trial Real */}
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionModal({
                                  open: true,
                                  type: 'extendTrial',
                                  tenant,
                                });
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sky-700 hover:bg-sky-50 cursor-pointer"
                            >
                              <Clock className="w-3.5 h-3.5 text-sky-600" />
                              <span>Estender Trial (+7 dias)</span>
                            </DropdownMenuItem>

                            {/* Suspender / Reativar Real */}
                            {statusVal === 'SUSPENDED' ? (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionModal({
                                    open: true,
                                    type: 'reactivate',
                                    tenant,
                                  });
                                }}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-emerald-700 hover:bg-emerald-50 cursor-pointer font-medium"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Reativar Empresa</span>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionModal({
                                    open: true,
                                    type: 'suspend',
                                    tenant,
                                  });
                                }}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-amber-700 hover:bg-amber-50 cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5 text-amber-600" />
                                <span>Suspender Empresa</span>
                              </DropdownMenuItem>
                            )}

                            {/* Cancelar Real */}
                            {statusVal !== 'CANCELED' && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionModal({
                                    open: true,
                                    type: 'cancel',
                                    tenant,
                                  });
                                }}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                <span>Cancelar Contrato</span>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Paginação Limpa ─── */}
        <div className="border-t border-zinc-100 px-5 py-3 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-zinc-500 font-normal">
            Exibindo <strong className="text-zinc-800">{totalItems ? startIndex + 1 : 0}</strong> a{' '}
            <strong className="text-zinc-800">{Math.min(startIndex + pageSize, totalItems)}</strong> de{' '}
            <strong className="text-zinc-800">{totalItems}</strong> empresas
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-xs">Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-700 focus:outline-none cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 px-2.5 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border-zinc-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Anterior
              </Button>

              <span className="text-xs font-semibold text-zinc-700 px-2">
                {currentPageSafe} de {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 px-2.5 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border-zinc-200 disabled:opacity-40 cursor-pointer"
              >
                Próxima <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal de Confirmação de Ações Críticas ─── */}
      <Dialog
        open={actionModal.open}
        onOpenChange={(open) => {
          if (!open && !actionLoading) {
            setActionModal((prev) => ({ ...prev, open: false }));
          }
        }}
      >
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border border-zinc-200 shadow-2xl">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  actionModal.type === 'suspend'
                    ? 'bg-amber-50 text-amber-600'
                    : actionModal.type === 'reactivate'
                    ? 'bg-emerald-50 text-emerald-600'
                    : actionModal.type === 'extendTrial'
                    ? 'bg-sky-50 text-sky-600'
                    : 'bg-rose-50 text-rose-600'
                }`}
              >
                {actionModal.type === 'suspend' && <Ban className="w-5 h-5" />}
                {actionModal.type === 'reactivate' && <RotateCcw className="w-5 h-5" />}
                {actionModal.type === 'extendTrial' && <Clock className="w-5 h-5" />}
                {actionModal.type === 'cancel' && <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-zinc-900">
                  {actionModal.type === 'suspend' && 'Suspender Empresa'}
                  {actionModal.type === 'reactivate' && 'Reativar Empresa'}
                  {actionModal.type === 'extendTrial' && 'Estender Período de Teste'}
                  {actionModal.type === 'cancel' && 'Confirmar Cancelamento'}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                  Ação operacional com reflexo imediato na plataforma.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-3 text-xs text-zinc-600 leading-relaxed border-y border-zinc-100 my-2">
            {actionModal.type === 'suspend' && (
              <p>
                Deseja suspender temporariamente o acesso de{' '}
                <strong className="text-zinc-900">{actionModal.tenant?.tradeName || actionModal.tenant?.companyName}</strong>?
                Os usuários não conseguirão operar o ERP até que a empresa seja reativada.
              </p>
            )}
            {actionModal.type === 'reactivate' && (
              <p>
                Confirmar a reativação de{' '}
                <strong className="text-zinc-900">{actionModal.tenant?.tradeName || actionModal.tenant?.companyName}</strong>?
                O acesso completo ao ERP será restabelecido imediatamente.
              </p>
            )}
            {actionModal.type === 'extendTrial' && (
              <p>
                Adicionar mais <strong>7 dias</strong> de teste para{' '}
                <strong className="text-zinc-900">{actionModal.tenant?.tradeName || actionModal.tenant?.companyName}</strong>?
              </p>
            )}
            {actionModal.type === 'cancel' && (
              <p className="text-rose-700">
                Atenção: Cancelar o contrato de{' '}
                <strong className="text-rose-950">{actionModal.tenant?.tradeName || actionModal.tenant?.companyName}</strong>?
                As assinaturas serão encerradas no sistema.
              </p>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              type="button"
              disabled={actionLoading}
              onClick={() => setActionModal((prev) => ({ ...prev, open: false }))}
              className="h-8 px-4 rounded-xl text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border-zinc-200 cursor-pointer"
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={actionLoading}
              onClick={handleExecuteAction}
              className={`h-8 px-4 rounded-xl text-xs font-semibold text-white shadow-2xs flex items-center gap-2 cursor-pointer ${
                actionModal.type === 'suspend'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : actionModal.type === 'reactivate'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : actionModal.type === 'extendTrial'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>Confirmar</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Moderno: Criar Nova Empresa & Gerar ERP ─── */}
      <CreateTenantModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onTenantCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['tenants'] });
          refetch();
        }}
      />
    </div>
  );
};
