import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  ChevronDown,
  Search,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Plus,
  ExternalLink,
  Store,
  Scissors,
  UtensilsCrossed,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Zap,
  ShieldCheck,
  Building2,
  PieChart,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet } from '@/lib/api';
import { setViewingSlug } from '@/lib/auth';
import { BARBERSHOP_TEMPLATES } from '@projeto-saas/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateTenantModal } from '@/features/tenants/components/create-tenant-modal';

const getNicheBadge = (niche: string, companyCategory?: string | null) => {
  if (niche === 'BARBERSHOP' && companyCategory) {
    const tpl = (BARBERSHOP_TEMPLATES as Record<string, { label: string }>)[String(companyCategory).toUpperCase()];
    if (tpl) {
      return {
        label: tpl.label,
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <Scissors className="w-3 h-3" />,
      };
    }
  }
  switch (niche) {
    case 'SUPERMARKET':
      return {
        label: 'Universal',
        color: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: <Store className="w-3 h-3" />,
      };
    case 'UNIVERSAL':
      return {
        label: 'Universal',
        color: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: <Store className="w-3 h-3" />,
      };
    case 'BARBERSHOP':
      return {
        label: 'Barbearia',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <Scissors className="w-3 h-3" />,
      };
    case 'RESTAURANT':
    default:
      return {
        label: 'Restaurante',
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: <UtensilsCrossed className="w-3 h-3" />,
      };
  }
};

// ─── Algoritmo Catmull-Rom para curvas Bézier cúbicas orgânicas e ultra-suaves ───
const getSplinePath = (coords: { x: number; y: number }[]) => {
  if (coords.length === 0) return '';
  let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [revenuePeriod, setRevenuePeriod] = useState<'Esta Semana' | 'Este Mês' | 'Este Ano'>('Esta Semana');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [hoveredRevenueIndex, setHoveredRevenueIndex] = useState<number | null>(null);
  const [hoveredIncomeIndex, setHoveredIncomeIndex] = useState<number | null>(null);

  // Estados do Crescimento de Clientes (CLEAN)
  const [growthMetricMode, setGrowthMetricMode] = useState<'ACUMULADO' | 'NOVOS'>('ACUMULADO');
  const [hoveredGrowthIndex, setHoveredGrowthIndex] = useState<number | null>(null);

  // ─── Consultas Reais ao Backend ───
  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => apiGet('/dashboard/kpis').catch(() => null),
  });

  const { data: billingOverview } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => apiGet('/billing/overview').catch(() => null),
  });

  const { data: delinquencyList } = useQuery({
    queryKey: ['billing-delinquency'],
    queryFn: () => apiGet('/billing/delinquency').catch(() => []),
  });

  const { data: invoicesRes } = useQuery({
    queryKey: ['billing-invoices-dashboard'],
    queryFn: () => apiGet('/billing/invoices?page=1&limit=100').catch(() => ({ data: [] })),
  });

  const { data: tenantsRes } = useQuery({
    queryKey: ['dashboard-tenants-count'],
    queryFn: () => apiGet('/tenants?page=1&limit=100').catch(() => ({ data: [] })),
  });

  // Lista real de empresas cadastradas no banco (vazio mostra vazio).
  const tenantsList = useMemo(() => {
    const raw = Array.isArray(tenantsRes?.data)
      ? tenantsRes.data
      : Array.isArray(tenantsRes)
      ? tenantsRes
      : [];

    return raw.map((t: any) => ({
      id: t.id,
      name: t.tradeName || t.companyName,
      legalName: t.companyName || t.tradeName,
      slug: t.slug,
      niche: t.niche as 'SUPERMARKET' | 'UNIVERSAL' | 'BARBERSHOP' | 'RESTAURANT',
      companyCategory: (t as any).companyCategory || null,
      status: t.status as 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'SUSPENDED',
      plan: t.subscription?.plan?.name || 'Sem plano',
      createdAt: t.createdAt,
      contactEmail: t.email || '—',
    }));
  }, [tenantsRes]);

  // Métricas consolidadas reais (zero/vazio mostra zero/vazio, sem fallback fake).
  const totalTenantsCount = tenantsList.length;

  const delinquentCount = useMemo(() => {
    return Array.isArray(delinquencyList) ? delinquencyList.length : 0;
  }, [delinquencyList]);

  const overdueInvoicesCount = useMemo(() => {
    const invs = Array.isArray(invoicesRes?.data) ? invoicesRes.data : [];
    return invs.filter((i: any) => i.status === 'OVERDUE').length;
  }, [invoicesRes]);

  const fmtBRL = (cents: number) =>
    (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalRevenueFormatted = useMemo(() => {
    if (kpis?.mrr) {
      return (kpis.mrr / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
    if (billingOverview?.totalRevenueCents) {
      return (billingOverview.totalRevenueCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
    return '—';
  }, [billingOverview, kpis]);

  const previousRevenueFormatted = useMemo(() => {
    if (billingOverview?.previousRevenue) {
      return Number(billingOverview.previousRevenue).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
    return '—';
  }, [billingOverview]);

  // Quebra real por status + movimento do mês (p/ badges e subtítulos).
  const statusBreakdown = useMemo(() => {
    const active = tenantsList.filter((t: any) => t.status === 'ACTIVE').length;
    const trial = tenantsList.filter((t: any) => t.status === 'TRIAL').length;
    const late = tenantsList.filter((t: any) => t.status === 'PAST_DUE' || t.status === 'SUSPENDED').length;
    const suspended = tenantsList.filter((t: any) => t.status === 'SUSPENDED').length;
    return { active, trial, late, suspended };
  }, [tenantsList]);

  const tenantMonthStats = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = tenantsList.filter((t: any) => new Date(t.createdAt) >= start).length;
    const prevMonth = tenantsList.filter((t: any) => {
      const d = new Date(t.createdAt);
      return d >= prevStart && d < start;
    }).length;
    const growth = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : thisMonth > 0 ? 100 : 0;
    const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
    const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return { thisMonth, prevMonth, growth, monthName: monthCap };
  }, [tenantsList]);

  // Dias em atraso por empresa (p/ selo real de inadimplência).
  const delinqDaysByTenant = useMemo(() => {
    const map: Record<string, number> = {};
    if (Array.isArray(delinquencyList)) {
      for (const d of delinquencyList as any[]) {
        const days = Number(d.daysOverdue || 0);
        if (d.tenant?.email) map[`mail:${d.tenant.email}`] = days;
        if (d.tenant?.companyName) map[`name:${d.tenant.companyName}`] = days;
      }
    }
    return map;
  }, [delinquencyList]);

  // Contagem por nicho (zeros honestos quando a base está vazia).
  const nicheStats = useMemo(() => {
    const superCount = tenantsList.filter((t: any) => t.niche === 'SUPERMARKET' || t.niche === 'UNIVERSAL').length;
    const barberCount = tenantsList.filter((t: any) => t.niche === 'BARBERSHOP').length;
    const restCount = tenantsList.filter((t: any) => t.niche === 'RESTAURANT').length;
    const total = tenantsList.length;

    return {
      supermarket: { count: superCount, pct: total > 0 ? Math.round((superCount / total) * 100) : 0 },
      barbershop: { count: barberCount, pct: total > 0 ? Math.round((barberCount / total) * 100) : 0 },
      restaurant: { count: restCount, pct: total > 0 ? Math.round((restCount / total) * 100) : 0 },
    };
  }, [tenantsList]);

  const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  // ─── Crescimento real de clientes (últimos 5 meses a partir de createdAt) ───
  const clientGrowthData = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; fullMonth: string; newClients: number; names: string[] }[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const inMonth = tenantsList.filter((t: any) => {
        const c = new Date(t.createdAt);
        return c >= d && c < next;
      });
      const tag = i === 0 ? ' (Atual)' : '';
      buckets.push({
        month: `${MONTHS_PT[d.getMonth()]}${tag}`,
        fullMonth: `${MONTHS_FULL_PT[d.getMonth()]} ${d.getFullYear()}${tag}`,
        newClients: inMonth.length,
        names: inMonth.map((t: any) => t.name),
      });
    }
    const firstStart = new Date(now.getFullYear(), now.getMonth() - 4, 1);
    let cum = tenantsList.filter((t: any) => new Date(t.createdAt) < firstStart).length;
    return buckets.map((b, idx) => {
      const prevCum = cum;
      cum += b.newClients;
      const growthRate =
        idx === 0
          ? 'Início'
          : prevCum > 0
            ? `+${Math.round((b.newClients / prevCum) * 100)}%`
            : b.newClients > 0
              ? '+100%'
              : '0%';
      return { ...b, cumulative: cum, growthRate };
    });
  }, [tenantsList]);

  const maxCumulative = Math.max(1, ...clientGrowthData.map((c) => c.cumulative));
  const maxNewClients = Math.max(1, ...clientGrowthData.map((c) => c.newClients));

  // Coordenadas da curva de crescimento (escala dinâmica pelo máximo real).
  const growthCoords = useMemo(() => {
    const n = clientGrowthData.length;
    return clientGrowthData.map((item, idx) => {
      const x = n > 1 ? 70 + idx * (620 / (n - 1)) : 380;
      const y = 155 - (item.cumulative / maxCumulative) * 130;
      return { x, y, item };
    });
  }, [clientGrowthData, maxCumulative]);

  // Rótulos do eixo Y (dinâmicos, a partir dos máximos reais).
  const growthAxisAccum = useMemo(() => {
    const steps = [1, 0.75, 0.5, 0.25, 0];
    return steps.map((f, i) => (i === steps.length - 1 ? '0' : `${Math.round(maxCumulative * f)} emp.`));
  }, [maxCumulative]);
  const growthAxisNew = useMemo(() => {
    const steps = [1, 0.66, 0.33, 0];
    return steps.map((f, i) => (i === steps.length - 1 ? '0' : `+${Math.round(maxNewClients * f)} novos`));
  }, [maxNewClients]);

  const growthSplineD = useMemo(() => getSplinePath(growthCoords), [growthCoords]);
  const growthAreaD = useMemo(() => {
    if (growthCoords.length === 0) return '';
    return `${growthSplineD} L ${growthCoords[growthCoords.length - 1].x.toFixed(1)},160 L ${growthCoords[0].x.toFixed(1)},160 Z`;
  }, [growthSplineD, growthCoords]);

  // ─── Faturas reais (p/ gráficos de receita e recebimento) ───
  const allInvoices: any[] = Array.isArray(invoicesRes?.data) ? invoicesRes.data : [];
  const paidInvoices = useMemo(() => allInvoices.filter((i: any) => i.status === 'PAID'), [allInvoices]);

  /** Teto "bonito" p/ eixo Y (1/2/2.5/5 × 10^n). */
  const niceCeil = (v: number) => {
    if (v <= 0) return 1;
    const exp = Math.floor(Math.log10(v));
    const base = 10 ** exp;
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (v <= m * base) return m * base;
    }
    return 10 * base;
  };
  const fmtAxisK = (v: number) => (v >= 1000 ? `${parseFloat((v / 1000).toFixed(1))}k` : `${Math.round(v)}`);

  // ─── Evolução de faturamento REAL (faturas PAID agrupadas por período) ───
  const revenueAnalyticsData = useMemo(() => {
    const now = new Date();
    const sumRange = (start: Date, end: Date) =>
      paidInvoices
        .filter((i: any) => {
          const d = new Date(i.paidAt || i.createdAt);
          return d >= start && d < end;
        })
        .reduce((s: number, i: any) => s + Number(i.amountCents || 0), 0);

    let buckets: { label: string; cents: number }[] = [];
    if (revenuePeriod === 'Esta Semana') {
      const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
        buckets.push({ label: WD[d.getDay()], cents: sumRange(d, next) });
      }
    } else if (revenuePeriod === 'Este Mês') {
      for (let i = 3; i >= 0; i--) {
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i + 1) * 7);
        buckets.push({ label: `Sem ${4 - i}`, cents: sumRange(start, end) });
      }
    } else {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        buckets.push({ label: MONTHS_PT[d.getMonth()], cents: sumRange(d, next) });
      }
    }
    const max = Math.max(0, ...buckets.map((b) => b.cents));
    const top = niceCeil(max);
    const yLabels = [6, 5, 4, 3, 2, 1, 0].map((s) => (s === 0 ? '0' : fmtAxisK((top / 6) * s)));
    return {
      yLabels,
      bars: buckets.map((b) => ({
        label: b.label,
        heightPct: max > 0 ? Math.max(4, Math.round((b.cents / max) * 100)) : 0,
        value: fmtBRL(b.cents),
        isPeak: max > 0 && b.cents === max,
      })),
    };
  }, [revenuePeriod, paidInvoices]);

  // ─── Recebido & A Receber REAL (últimos 8 meses, por paidAt/vencimento) ───
  const incomeMonthsData = useMemo(() => {
    const now = new Date();
    const rows: { label: string; receivedCents: number; openCents: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const received = allInvoices
        .filter((inv: any) => {
          if (inv.status !== 'PAID' || !inv.paidAt) return false;
          const dt = new Date(inv.paidAt);
          return dt >= d && dt < next;
        })
        .reduce((s: number, inv: any) => s + Number(inv.amountCents || 0), 0);
      const open = allInvoices
        .filter((inv: any) => {
          if (inv.status === 'PAID' || inv.status === 'CANCELED') return false;
          const dt = new Date(inv.dueDate || inv.createdAt);
          return dt >= d && dt < next;
        })
        .reduce((s: number, inv: any) => s + Number(inv.amountCents || 0), 0);
      rows.push({ label: MONTHS_PT[d.getMonth()], receivedCents: received, openCents: open });
    }
    const maxTotal = Math.max(0, ...rows.map((r) => r.receivedCents + r.openCents));
    return {
      maxTotal,
      months: rows.map((r) => {
        const total = r.receivedCents + r.openCents;
        return {
          label: r.label,
          profitPct: maxTotal > 0 ? Math.round((r.receivedCents / maxTotal) * 100) : 0,
          lossPct: maxTotal > 0 ? Math.round((r.openCents / maxTotal) * 100) : 0,
          profitVal: fmtBRL(r.receivedCents),
          lossVal: fmtBRL(r.openCents),
          total: fmtBRL(total),
          margin: total > 0 ? `${Math.round((r.receivedCents / total) * 100)}% recebido` : '—',
        };
      }),
    };
  }, [allInvoices]);

  const incomeAxisLabels = useMemo(() => {
    const top = niceCeil(incomeMonthsData.maxTotal);
    return [5, 4, 3, 2, 1, 0].map((s) => (s === 0 ? '00' : fmtAxisK((top / 5) * s)));
  }, [incomeMonthsData.maxTotal]);

  return (
    <div className="relative -mx-6 sm:-mx-8 lg:-mx-10 -my-6 px-6 sm:px-8 lg:px-10 py-6 min-h-[calc(100vh-4rem)] space-y-6 select-none font-sans text-zinc-900 pb-16 isolate overflow-hidden">
      {/* ─── Blur Leve Azul Claro no Fundo (Ambient Light-Blue Glow) ─── */}
      <div className="pointer-events-none absolute -top-24 left-1/4 w-[600px] h-[450px] rounded-full bg-sky-200/40 blur-[130px] -z-10" />
      <div className="pointer-events-none absolute top-1/3 -right-24 w-[550px] h-[550px] rounded-full bg-blue-100/50 blur-[140px] -z-10" />
      <div className="pointer-events-none absolute bottom-20 left-10 w-[500px] h-[500px] rounded-full bg-sky-100/35 blur-[120px] -z-10" />

      {/* ─── Topo: Descrição & Ações de Operação ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium">
            Monitoramento em tempo real de empresas conectadas, faturamento e saúde financeira.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="h-9 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Empresa</span>
          </Button>
        </div>
      </div>

      {/* ─── Linha dos 4 Cards de KPIs (100% Reais com Borda Visível) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Vendas & Assinaturas */}
        <div className="bg-white rounded-[26px] p-5 sm:p-6 border border-zinc-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-zinc-500">
              Assinaturas & Vendas
            </span>
            <div className="w-9 h-9 rounded-full bg-zinc-50 border border-zinc-200/80 flex items-center justify-center text-zinc-700">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-4 mb-2 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-zinc-900 leading-none">
              {kpis?.activeClients ?? totalTenantsCount}
            </span>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200">
              <TrendingUp className="w-3 h-3" />
              <span>+{tenantMonthStats.thisMonth} novos</span>
            </span>
          </div>

          <span className="text-xs text-zinc-400 font-medium">
            Mês passado: {tenantMonthStats.prevMonth} empresas
          </span>
        </div>

        {/* Card 2: Empresas Conectadas */}
        <div className="bg-white rounded-[26px] p-5 sm:p-6 border border-zinc-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-zinc-500">
              Empresas Conectadas
            </span>
            <div className="w-9 h-9 rounded-full bg-zinc-50 border border-zinc-200/80 flex items-center justify-center text-zinc-700">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-4 mb-2 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-zinc-900 leading-none">
              {totalTenantsCount}
            </span>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200">
              <TrendingUp className="w-3 h-3" />
              <span>+{tenantMonthStats.thisMonth} este mês</span>
            </span>
          </div>

          <span className="text-xs text-zinc-400 font-medium">
            {statusBreakdown.active} ativas · {statusBreakdown.trial} em trial · {statusBreakdown.late} em atraso
          </span>
        </div>

        {/* Card 3: Inadimplência & Recusas (Em Azul Claro e Neutro) */}
        <div className="bg-white rounded-[26px] p-5 sm:p-6 border border-zinc-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-zinc-500">
              Inadimplência & Recusas
            </span>
            <div className="w-9 h-9 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
              <Package className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-4 mb-2 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-zinc-900 leading-none">
              {delinquentCount}
            </span>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold text-sky-600 bg-sky-50 border border-sky-200">
              <TrendingDown className="w-3 h-3" />
              <span>{fmtBRL((billingOverview?.atRiskRevenue ?? 0) * 100)}</span>
            </span>
          </div>

          <span className="text-xs text-zinc-400 font-medium truncate block">
            {delinquentCount} cliente inadimplente · {overdueInvoicesCount} pagamento recusado
          </span>
        </div>

        {/* Card 4: Faturamento Mensal (MRR) */}
        <div className="bg-white rounded-[26px] p-5 sm:p-6 border border-zinc-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-zinc-500">
              Faturamento Mensal (MRR)
            </span>
            <div className="w-9 h-9 rounded-full bg-zinc-50 border border-zinc-200/80 flex items-center justify-center text-zinc-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-4 mb-2 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-zinc-900 leading-none">
              {totalRevenueFormatted}
            </span>
            {typeof billingOverview?.growthPercent === 'number' && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                billingOverview.growthPercent >= 0
                  ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  : 'text-rose-600 bg-rose-50 border-rose-200'
              }`}>
                {billingOverview.growthPercent >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>{billingOverview.growthPercent}%</span>
              </span>
            )}
          </div>

          <span className="text-xs text-zinc-400 font-medium">
            Mês anterior: {previousRevenueFormatted}
          </span>
        </div>
      </div>

      {/* ─── Seção Central: Gráficos Funcionais e Interativos ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Card Esquerda: Evolução de Faturamento (Barras Cápsula em Azul Claro) */}
        <div className="lg:col-span-7 xl:col-span-7 bg-white rounded-[26px] p-6 sm:p-7 border border-zinc-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                Evolução de Faturamento
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Passando o mouse nas barras para inspecionar cada valor
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 px-3 bg-white border border-zinc-300 rounded-xl shadow-2xs hover:border-zinc-400 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>{revenuePeriod}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 bg-white rounded-xl p-1 border border-zinc-200 text-xs shadow-lg">
                <DropdownMenuItem
                  onClick={() => setRevenuePeriod('Esta Semana')}
                  className="rounded-lg px-2.5 py-1.5 cursor-pointer font-medium hover:bg-zinc-50"
                >
                  Esta Semana
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRevenuePeriod('Este Mês')}
                  className="rounded-lg px-2.5 py-1.5 cursor-pointer font-medium hover:bg-zinc-50"
                >
                  Este Mês
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRevenuePeriod('Este Ano')}
                  className="rounded-lg px-2.5 py-1.5 cursor-pointer font-medium hover:bg-zinc-50"
                >
                  Este Ano
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Gráfico SVG com Linhas Pontilhadas e Barras Cápsula em Azul Claro */}
          <div className="relative w-full h-[250px] flex">
            {/* Eixo Y Dinâmico */}
            <div className="flex flex-col justify-between text-[11px] font-mono text-zinc-400 pr-3 select-none pb-7">
              {revenueAnalyticsData.yLabels.map((lbl) => (
                <span key={lbl}>{lbl}</span>
              ))}
            </div>

            {/* Área das Barras com Grid Sutil */}
            <div className="relative flex-1 flex flex-col justify-between">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="w-full border-b border-dashed border-zinc-100"
                  />
                ))}
              </div>

              {/* Barras Dinâmicas e Interativas */}
              <div className="relative z-10 h-full flex items-end justify-between px-2 sm:px-6 pb-7">
                {revenueAnalyticsData.bars.map((bar, idx) => {
                  const isHovered = hoveredRevenueIndex === idx;
                  const showTooltip = hoveredRevenueIndex !== null ? isHovered : bar.isPeak;

                  return (
                    <div
                      key={bar.label}
                      className="flex flex-col items-center group relative h-full justify-end cursor-pointer"
                      style={{ width: `${Math.floor(80 / revenueAnalyticsData.bars.length)}%` }}
                      onMouseEnter={() => setHoveredRevenueIndex(idx)}
                      onMouseLeave={() => setHoveredRevenueIndex(null)}
                    >
                      {/* Tooltip Dinâmico ao passar o mouse ou no Pico */}
                      {showTooltip && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center z-30 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                          <div className="bg-sky-500 text-white font-mono font-bold text-[11px] px-2.5 py-1 rounded-xl shadow-md whitespace-nowrap">
                            {bar.value}
                          </div>
                          <div className="w-2 h-2 rounded-full bg-sky-500 mt-1 border-2 border-white shadow-xs" />
                        </div>
                      )}

                      {/* Barra Cápsula em Listras Azul Claro com Animação Hover */}
                      <div
                        className={`w-full rounded-full transition-all duration-300 relative overflow-hidden shadow-2xs ${
                          isHovered ? 'brightness-110 scale-y-105' : 'hover:brightness-105'
                        }`}
                        style={{
                          height: `${bar.heightPct}%`,
                          backgroundColor: '#38bdf8',
                          backgroundImage: `repeating-linear-gradient(
                            -45deg,
                            #38bdf8,
                            #38bdf8 3.5px,
                            #0ea5e9 3.5px,
                            #0ea5e9 7px
                          )`,
                        }}
                        title={`${bar.label}: ${bar.value}`}
                      />

                      <span className={`absolute -bottom-6 text-xs transition-colors ${
                        isHovered ? 'font-bold text-sky-600' : 'font-semibold text-zinc-500'
                      }`}>
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Card Direita: Recebido & A Receber (faturas reais por mês) */}
        <div className="lg:col-span-5 xl:col-span-5 bg-white rounded-[26px] p-6 sm:p-7 border border-zinc-300 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                Recebido & A Receber
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Faturas pagas e em aberto por mês
              </p>
            </div>

            {/* Legenda: Recebido (Verde Esmeralda) e Em aberto (Grafite) */}
            <div className="flex items-center gap-3 text-[11px] font-semibold text-zinc-600 self-end sm:self-auto shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500" />
                <span>Recebido</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-zinc-900" />
                <span>Em aberto</span>
              </div>
            </div>
          </div>

          {/* Gráfico SVG de Barras Empilhadas em Verde Esmeralda & Grafite */}
          <div className="relative w-full h-[250px] flex">
            <div className="flex flex-col justify-between text-[11px] font-mono text-zinc-400 pr-3 select-none pb-7">
              {incomeAxisLabels.map((lbl, i) => (
                <span key={`${lbl}-${i}`}>{lbl}</span>
              ))}
            </div>

            <div className="relative flex-1 flex flex-col justify-between">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-full border-b border-dashed border-zinc-100"
                  />
                ))}
              </div>

              <div className="relative z-10 h-full flex items-end justify-between px-1 sm:px-3 pb-7">
                {incomeMonthsData.months.map((item, idx) => {
                  const isHovered = hoveredIncomeIndex === idx;

                  return (
                    <div
                      key={item.label}
                      className="flex flex-col items-center group relative h-full justify-end cursor-pointer"
                      style={{ width: `${Math.floor(88 / incomeMonthsData.months.length)}%` }}
                      onMouseEnter={() => setHoveredIncomeIndex(idx)}
                      onMouseLeave={() => setHoveredIncomeIndex(null)}
                    >
                      {/* Tooltip Flutuante Detalhado ao Passar o Mouse */}
                      {isHovered && (item.profitPct > 0 || item.lossPct > 0) && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center z-30 pointer-events-none animate-in fade-in zoom-in-95 duration-200">
                          <div className="bg-zinc-950 text-white p-2.5 rounded-xl shadow-xl text-[10px] whitespace-nowrap border border-zinc-800 flex flex-col gap-0.5">
                            <span className="font-bold text-zinc-300">{item.label}</span>
                            <span className="text-emerald-400 font-semibold">● Recebido: {item.profitVal} ({item.margin})</span>
                            <span className="text-zinc-400">● Em aberto: {item.lossVal}</span>
                            <span className="text-zinc-500 text-[9px] border-t border-zinc-800/80 pt-1 mt-0.5">Total: {item.total}</span>
                          </div>
                          <div className="w-1.5 h-1.5 rotate-45 bg-zinc-950 -mt-1 border-r border-b border-zinc-800" />
                        </div>
                      )}

                      {item.profitPct > 0 || item.lossPct > 0 ? (
                        <>
                          <div
                            className={`w-full rounded-t-full transition-all duration-300 relative overflow-hidden shadow-2xs ${
                              isHovered ? 'brightness-110 scale-y-105' : 'hover:brightness-105'
                            }`}
                            style={{
                              height: `${item.profitPct}%`,
                              backgroundColor: '#10b981',
                              backgroundImage: `repeating-linear-gradient(
                                -45deg,
                                #10b981,
                                #10b981 3px,
                                #059669 3px,
                                #059669 6px
                              )`,
                            }}
                            title={`${item.label} Recebido: ${item.profitVal}`}
                          />

                          <div
                            className={`w-full rounded-b-full transition-all duration-300 bg-zinc-900 ${
                              isHovered ? 'bg-zinc-800 scale-y-105' : 'hover:bg-zinc-800'
                            } mt-0.5`}
                            style={{ height: `${item.lossPct}%` }}
                            title={`${item.label} Em aberto: ${item.lossVal}`}
                          />
                        </>
                      ) : (
                        <div className="w-full h-1" />
                      )}

                      <span className={`absolute -bottom-6 text-[11px] transition-colors ${
                        isHovered ? 'font-bold text-emerald-600' : 'font-semibold text-zinc-500'
                      }`}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Seção Inferior: Monitor de Empresas ao Vivo (Tenant Fleet) + Distribuição por Nicho ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Painel 1: Crescimento de Clientes (100% Real, Moderno e CLEAN) */}
        <div className="lg:col-span-8 bg-white rounded-[26px] p-6 sm:p-7 border border-zinc-300 shadow-2xs space-y-6">
          {/* Cabeçalho Limpo e Moderno */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-600 shadow-2xs shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                    Crescimento de Clientes
                  </h2>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200/90">
                    {tenantMonthStats.growth >= 0 ? '+' : ''}{tenantMonthStats.growth}% este mês
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Evolução real da base de empresas conectadas e taxa de retenção da plataforma.
                </p>
              </div>
            </div>

            {/* Alternador de Modo Clean */}
            <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-semibold text-zinc-600 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setGrowthMetricMode('ACUMULADO')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  growthMetricMode === 'ACUMULADO'
                    ? 'bg-white text-purple-900 shadow-2xs font-bold'
                    : 'hover:text-zinc-900'
                }`}
              >
                Base Acumulada
              </button>
              <button
                type="button"
                onClick={() => setGrowthMetricMode('NOVOS')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  growthMetricMode === 'NOVOS'
                    ? 'bg-white text-purple-900 shadow-2xs font-bold'
                    : 'hover:text-zinc-900'
                }`}
              >
                Novos por Mês
              </button>
            </div>
          </div>

          {/* Faixa de Indicadores Clean */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-zinc-50/70 border border-zinc-200/80">
            <div>
              <span className="text-[11px] font-medium text-zinc-500">Base Ativa</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-extrabold text-zinc-900 font-mono leading-none">
                  {tenantsList.length}
                </span>
                <span className="text-xs font-bold text-zinc-600">empresas</span>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-zinc-500">Novos em {tenantMonthStats.monthName}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-extrabold text-purple-600 font-mono leading-none">
                  +{tenantMonthStats.thisMonth}
                </span>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/70">
                  {tenantMonthStats.growth >= 0 ? '+' : ''}{tenantMonthStats.growth}%
                </span>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-zinc-500">Taxa de Retenção</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-extrabold text-emerald-600 font-mono leading-none">
                  {totalTenantsCount > 0 ? Math.round(((totalTenantsCount - statusBreakdown.suspended) / totalTenantsCount) * 100) : 100}%
                </span>
                <span className="text-xs font-medium text-zinc-400">{statusBreakdown.suspended} cancelamentos</span>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-zinc-500">Em Trial</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-extrabold text-zinc-900 font-mono leading-none">
                  {statusBreakdown.trial}
                </span>
                <span className="text-xs font-medium text-zinc-400">empresas</span>
              </div>
            </div>
          </div>

          {/* Área do Gráfico Clean */}
          <div className="relative w-full h-[220px] select-none">
            {/* Eixo Y com Labels */}
            <div className="absolute left-0 top-1 bottom-8 flex flex-col justify-between text-[10px] font-mono text-zinc-400 pointer-events-none z-10">
              {growthMetricMode === 'ACUMULADO' ? (
                <>
                  {growthAxisAccum.map((lbl, i) => (
                    <span key={i}>{lbl}</span>
                  ))}
                </>
              ) : (
                <>
                  {growthAxisNew.map((lbl, i) => (
                    <span key={i}>{lbl}</span>
                  ))}
                </>
              )}
            </div>

            {/* Linhas de Grade Sutis */}
            <div className="absolute left-14 right-4 top-2 bottom-8 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="w-full border-b border-dashed border-zinc-200/80" />
              ))}
            </div>

            {/* SVG do Gráfico (Modo Acumulado ou Novos) */}
            {growthMetricMode === 'ACUMULADO' ? (
              <svg viewBox="0 0 760 190" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="cleanGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c084fc" stopOpacity="0.32" />
                    <stop offset="60%" stopColor="#c084fc" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#c084fc" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Preenchimento Suave */}
                <path d={growthAreaD} fill="url(#cleanGrowthGrad)" />

                {/* Linha Curva em Roxo Elegante */}
                <path
                  d={growthSplineD}
                  fill="none"
                  stroke="#9333ea"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Nós da Curva */}
                {growthCoords.map((pt, idx) => {
                  const isLatest = idx === growthCoords.length - 1;
                  const isHovered = hoveredGrowthIndex === idx;

                  return (
                    <g key={idx}>
                      {/* Linha Scanner Vertical no Hover */}
                      {isHovered && (
                        <line
                          x1={pt.x}
                          y1={15}
                          x2={pt.x}
                          y2={160}
                          stroke="#c084fc"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                      )}

                      {/* Ponto Destaque com Brilho no Atual */}
                      {isLatest && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="8"
                          fill="#c084fc"
                          opacity="0.3"
                          className="animate-pulse"
                        />
                      )}

                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 6.5 : isLatest ? 5.5 : 4}
                        fill={isHovered ? '#7e22ce' : isLatest ? '#9333ea' : '#c084fc'}
                        stroke="#ffffff"
                        strokeWidth="2.5"
                        className="transition-all duration-200"
                      />

                      {/* Rótulo de Mês */}
                      <text
                        x={pt.x}
                        y="180"
                        textAnchor="middle"
                        className={`text-[11px] font-medium transition-colors ${
                          isHovered || isLatest ? 'fill-purple-950 font-bold' : 'fill-zinc-400'
                        }`}
                      >
                        {pt.item.month}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : (
              /* Modo NOVOS POR MÊS: Barras Limpas e Arredondadas */
              <svg viewBox="0 0 760 190" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                {growthCoords.map((pt, idx) => {
                  const isLatest = idx === growthCoords.length - 1;
                  const isHovered = hoveredGrowthIndex === idx;
                  const barHeight = Math.max((pt.item.newClients / maxNewClients) * 115, pt.item.newClients > 0 ? 6 : 2);
                  const barY = 160 - barHeight;
                  const barWidth = 36;
                  const barX = pt.x - barWidth / 2;

                  return (
                    <g key={idx}>
                      <rect
                        x={barX}
                        y={barY}
                        width={barWidth}
                        height={barHeight}
                        rx="8"
                        ry="8"
                        fill={isHovered ? '#7e22ce' : isLatest ? '#9333ea' : '#c084fc'}
                        className="transition-all duration-200 cursor-pointer"
                        opacity={isHovered ? 1 : isLatest ? 0.95 : 0.75}
                      />

                      {/* Valor no Topo da Barra */}
                      <text
                        x={pt.x}
                        y={barY - 6}
                        textAnchor="middle"
                        className={`text-[11px] font-mono font-bold ${
                          isHovered || isLatest ? 'fill-purple-900' : 'fill-zinc-500'
                        }`}
                      >
                        +{pt.item.newClients}
                      </text>

                      {/* Rótulo de Mês */}
                      <text
                        x={pt.x}
                        y="180"
                        textAnchor="middle"
                        className={`text-[11px] font-medium transition-colors ${
                          isHovered || isLatest ? 'fill-purple-950 font-bold' : 'fill-zinc-400'
                        }`}
                      >
                        {pt.item.month}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Zonas de Captura de Hover com Tooltip Clean */}
            <div className="absolute inset-0 left-14 right-4 flex">
              {clientGrowthData.map((item, idx) => {
                const isHovered = hoveredGrowthIndex === idx;
                return (
                  <div
                    key={idx}
                    className="flex-1 relative h-full cursor-pointer z-20"
                    onMouseEnter={() => setHoveredGrowthIndex(idx)}
                    onMouseLeave={() => setHoveredGrowthIndex(null)}
                  >
                    {/* Tooltip Clean e Elegante */}
                    {isHovered && (
                      <div
                        className="absolute -top-2 z-40 pointer-events-none -translate-x-1/2 -translate-y-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-150"
                        style={{ left: `${((idx + 0.5) / clientGrowthData.length) * 100}%` }}
                      >
                        <div className="bg-zinc-950 text-white p-3 rounded-2xl shadow-xl border border-zinc-800 text-xs flex flex-col gap-1 min-w-[210px]">
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                            <span className="font-bold text-zinc-200 text-[11px]">
                              {item.fullMonth}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              {item.growthRate}
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-[11px] text-zinc-400">Base Acumulada:</span>
                            <span className="text-sm font-extrabold text-white font-mono">
                              {item.cumulative} {item.cumulative === 1 ? 'empresa' : 'empresas'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">Novos Clientes:</span>
                            <span className="font-bold text-purple-300">+{item.newClients}</span>
                          </div>

                          <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-800/80 flex flex-col gap-0.5">
                            <span className="text-zinc-500">Empresas que entraram:</span>
                            <span className="text-zinc-200 font-medium truncate">
                              {item.names.join(', ')}
                            </span>
                          </div>
                        </div>
                        <div className="w-2 h-2 rotate-45 bg-zinc-950 -mt-1 border-r border-b border-zinc-800" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lista Clean de Empresas Conectadas */}
          <div className="pt-4 border-t border-zinc-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-700">
                Últimas Empresas Integradas à Plataforma
              </span>
              <button
                type="button"
                onClick={() => navigate('/tenants')}
                className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer transition"
              >
                <span>Ver todas as {tenantsList.length} empresas</span>
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>

            <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/90 overflow-hidden bg-white">
              {tenantsList.slice(0, 4).map((t: any) => {
                const niche = getNicheBadge(t.niche, (t as any).companyCategory);
                const isTrial = t.status === 'TRIAL';
                const isDelinquent = t.status === 'PAST_DUE';
                const delinqDays = delinqDaysByTenant[`mail:${t.contactEmail}`] ?? delinqDaysByTenant[`name:${t.legalName}`];

                return (
                  <div
                    key={t.id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-zinc-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200/70 flex items-center justify-center text-xs font-bold text-purple-700">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-zinc-900">{t.name}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${niche.color}`}
                          >
                            {niche.icon}
                            <span>{niche.label}</span>
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-400 font-mono">/{t.slug}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-zinc-500 hidden sm:inline">
                        {t.plan}
                      </span>
                      {isDelinquent ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                          Inadimplente{typeof delinqDays === 'number' && delinqDays > 0 ? ` (${delinqDays}d)` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-700">
                          {isTrial ? 'Trial' : 'Ativo'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (t.slug) setViewingSlug(t.slug);
                          window.open('/app/dashboard', '_blank');
                        }}
                        title={t.slug ? `Abrir painel de ${t.name}` : 'Abrir painel'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 transition shadow-2xs cursor-pointer"
                      >
                        <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>Abrir ERP</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Painel 2: Distribuição por Nicho & Saúde da Plataforma (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card: Distribuição das Verticais */}
          <div className="bg-white rounded-[26px] p-6 border border-zinc-300 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                <PieChart className="w-4 h-4 text-sky-500" />
                <span>Distribuição por Nicho</span>
              </h3>
              <span className="text-[11px] font-mono text-zinc-400">{totalTenantsCount} lojas</span>
            </div>

            {/* Barra Segmentada */}
            <div className="h-3 w-full rounded-full bg-zinc-100 flex overflow-hidden p-0.5">
              <div
                style={{ width: `${nicheStats.supermarket.pct}%` }}
                className="h-full bg-sky-500 rounded-l-full"
                title={`Universal: ${nicheStats.supermarket.count}`}
              />
              <div
                style={{ width: `${nicheStats.barbershop.pct}%` }}
                className="h-full bg-emerald-500"
                title={`Barbearias: ${nicheStats.barbershop.count}`}
              />
              <div
                style={{ width: `${nicheStats.restaurant.pct}%` }}
                className="h-full bg-amber-500 rounded-r-full"
                title={`Restaurantes: ${nicheStats.restaurant.count}`}
              />
            </div>

            {/* Legenda dos Nichos */}
            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  <span className="font-medium text-zinc-700">Universal</span>
                </div>
                <span className="font-mono font-bold text-zinc-900">
                  {nicheStats.supermarket.count} ({nicheStats.supermarket.pct}%)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-medium text-zinc-700">Barbearias & Estética</span>
                </div>
                <span className="font-mono font-bold text-zinc-900">
                  {nicheStats.barbershop.count} ({nicheStats.barbershop.pct}%)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-medium text-zinc-700">Restaurantes & Bares</span>
                </div>
                <span className="font-mono font-bold text-zinc-900">
                  {nicheStats.restaurant.count} ({nicheStats.restaurant.pct}%)
                </span>
              </div>
            </div>
          </div>

          {/* Card: Saúde Financeira & Ações Rápidas */}
          <div className="bg-white rounded-[26px] p-6 border border-zinc-300 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Saúde Operacional do SaaS</span>
              </h3>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                {totalTenantsCount > 0
                  ? `${Math.round(((totalTenantsCount - Math.min(delinquentCount, totalTenantsCount)) / totalTenantsCount) * 100)}% OK`
                  : '—'}
              </span>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              {totalTenantsCount - Math.min(delinquentCount, totalTenantsCount)} de {totalTenantsCount} empresas em dia.
              {delinquentCount > 0
                ? ` ${delinquentCount} ${delinquentCount === 1 ? 'fatura requer' : 'faturas requerem'} cobrança ativa.`
                : ' Nenhuma cobrança pendente.'}
            </p>

            <div className="pt-2 border-t border-zinc-100 flex flex-col gap-2 text-xs">
              <button
                type="button"
                onClick={() => navigate('/billing/delinquency')}
                className="w-full h-9 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-semibold flex items-center justify-between px-3 transition cursor-pointer"
              >
                <span>Ver Régua de Inadimplência</span>
                <span className="font-mono text-sky-600 font-bold">{delinquentCount} caso(s)</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/billing/invoices')}
                className="w-full h-9 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-semibold flex items-center justify-between px-3 transition cursor-pointer"
              >
                <span>Histórico Completo de Cobranças</span>
                <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Provisionamento */}
      <CreateTenantModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onTenantCreated={() => {}}
      />
    </div>
  );
};

export default DashboardPage;
