import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  ShoppingBag,
  Receipt,
  TrendingUp,
  Package,
  Boxes,
  AlertTriangle,
  ChevronRight,
  Clock,
  Wallet,
  Landmark,
  Coins,
  ShoppingCart,
  FileSpreadsheet,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  CreditCard,
  Banknote,
  QrCode,
  Tag,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtMoney = (cents: number) => {
  if (cents >= 100000) return `R$ ${(cents / 100000).toFixed(1)}k`;
  return brl(cents);
};

// Smooth cubic Bézier spline helper
function getSmoothCurvePath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[0];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i !== points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

// Payment method badge helper
function PaymentMethodBadge({ method }: { method: string }) {
  const m = (method || '').toUpperCase();
  if (m === 'PIX') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60">
        <QrCode className="w-2.5 h-2.5" /> PIX
      </span>
    );
  }
  if (m === 'DINHEIRO' || m === 'CASH') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200/60">
        <Banknote className="w-2.5 h-2.5" /> Dinheiro
      </span>
    );
  }
  if (m.includes('CREDITO') || m === 'CREDIT_CARD') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
        <CreditCard className="w-2.5 h-2.5" /> Crédito
      </span>
    );
  }
  if (m.includes('DEBITO') || m === 'DEBIT_CARD') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 dark:bg-sky-500/10 text-sky-700 border border-sky-200/60">
        <CreditCard className="w-2.5 h-2.5" /> Débito
      </span>
    );
  }
  if (m === 'FIADO') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60">
        <Clock className="w-2.5 h-2.5" /> Fiado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground border border-border">
      {method || 'Outro'}
    </span>
  );
}

/**
 * Paleta dos cartões de indicador. Cada tom já traz a variante `dark:` —
 * os 4 cartões eram cópias quase idênticas (~110 linhas repetidas) com cores
 * fixas que ficavam ilegíveis no tema escuro.
 */
const KPI_TONES = {
  emerald: {
    icon: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    pill: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
  },
  amber: {
    icon: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400',
    pill: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
  },
  indigo: {
    icon: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
    pill: 'text-muted-foreground bg-muted',
  },
  teal: {
    icon: 'bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/30 text-teal-600 dark:text-teal-400',
    pill: 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10',
  },
} as const;

type KpiTone = keyof typeof KPI_TONES;

/** Cartão de indicador do dashboard — usado pelos 4 KPIs principais. */
const DashKpi: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: KpiTone;
  footerLeft?: React.ReactNode;
  pill?: React.ReactNode;
}> = ({ label, value, icon, tone, footerLeft, pill }) => {
  const colors = KPI_TONES[tone];

  return (
    <div className="relative overflow-hidden bg-card rounded-3xl p-5 border border-border/80 shadow-2xs hover:border-border hover:shadow-elevated transition-all duration-200 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase truncate">
            {label}
          </span>
          <div
            className={`w-8 h-8 shrink-0 rounded-xl border flex items-center justify-center ${colors.icon}`}
          >
            {icon}
          </div>
        </div>
        <div className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
          {value}
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">{footerLeft}</span>
        {pill && (
          <span
            className={`shrink-0 inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.pill}`}
          >
            {pill}
          </span>
        )}
      </div>
    </div>
  );
};

export const SupermarketDashboardPage: React.FC = () => {
  const { slug, base, tenant } = useTenant();
  const navigate = useNavigate();
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);

  // Global F10 key shortcut to jump directly to POS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault();
        navigate(`${base}/supermarket-pos`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, base]);

  // Main supermarket dashboard data query
  const { data, isLoading } = useQuery({
    queryKey: ['supermarket-dashboard', slug],
    queryFn: () => apiGet<any>(`/tenant-app/${slug}/dashboard/supermarket`),
    refetchInterval: 15000,
  });

  // Cash register real-time query
  const { data: cashRegisterData } = useQuery({
    queryKey: ['supermarket-cash-register', slug],
    queryFn: () => apiGet<any>(`/tenant-app/${slug}/cash-register`),
    refetchInterval: 15000,
  });

  const kpis = data?.kpis || {};
  const salesLast14Days = useMemo(() => data?.salesLast14Days || [], [data?.salesLast14Days]);
  const salesByCategory = data?.salesByCategory || [];
  const topProducts = data?.topProducts || [];
  const alerts = data?.alerts || [];
  const expiringSoon = data?.expiringSoon || [];
  const recentOrders = data?.recentOrders || [];

  const isCashOpen = Boolean(cashRegisterData?.isOpen);
  const currentCashInDrawer = cashRegisterData?.metrics?.cashInDrawerCents ?? 0;

  // Margin percentage
  const grossMarginPct = useMemo(() => {
    if (!kpis.salesTodayCents || kpis.salesTodayCents <= 0) return 0;
    const margin = ((kpis.grossProfitTodayCents || 0) / kpis.salesTodayCents) * 100;
    return Math.max(0, Math.min(100, Math.round(margin)));
  }, [kpis.salesTodayCents, kpis.grossProfitTodayCents]);

  // Category chart percentages & colors
  const categoryColors = [
    'from-emerald-500 to-teal-600',
    'from-indigo-500 to-blue-600',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-600',
    'from-purple-500 to-violet-600',
    'from-zinc-500 to-zinc-700',
  ];

  const categoryChart = useMemo(() => {
    const total = salesByCategory.reduce((sum: number, c: any) => sum + (c.totalCents || 0), 0) || 1;
    return salesByCategory.map((c: any, i: number) => ({
      label: c.category || 'Geral',
      value: c.totalCents || 0,
      pct: Math.round(((c.totalCents || 0) / total) * 100),
      color: categoryColors[i % categoryColors.length],
    }));
  }, [salesByCategory]);

  // Total sales across the 14-day window & daily average
  const total14Days = useMemo(
    () => salesLast14Days.reduce((acc: number, d: any) => acc + (d.totalCents || 0), 0),
    [salesLast14Days]
  );
  const avg14Days = useMemo(
    () => (salesLast14Days.length ? Math.round(total14Days / salesLast14Days.length) : 0),
    [salesLast14Days, total14Days]
  );

  // SVG dimensions for sales Bézier curve
  const chartWidth = 640;
  const chartHeight = 180;
  const padding = { top: 24, right: 16, bottom: 28, left: 16 };

  const chartPoints = useMemo<Array<{ x: number; y: number; d: any; index: number }>>(() => {
    if (!salesLast14Days.length) return [];
    const maxVal = Math.max(1, ...salesLast14Days.map((d: any) => d.totalCents || 0));
    return salesLast14Days.map((d: any, i: number) => {
      const x =
        padding.left +
        (i / Math.max(1, salesLast14Days.length - 1)) * (chartWidth - padding.left - padding.right);
      const y =
        padding.top +
        (1 - (d.totalCents || 0) / maxVal) * (chartHeight - padding.top - padding.bottom);
      return { x, y, d, index: i };
    });
  }, [salesLast14Days]);

  const splineCurvePath = useMemo(() => getSmoothCurvePath(chartPoints), [chartPoints]);

  const areaGradientPath = useMemo(() => {
    if (chartPoints.length < 2) return '';
    return `${splineCurvePath} L ${chartPoints[chartPoints.length - 1].x},${chartHeight - padding.bottom} L ${chartPoints[0].x},${chartHeight - padding.bottom} Z`;
  }, [splineCurvePath, chartPoints]);

  // Average line Y coordinate
  const avgY = useMemo(() => {
    if (!salesLast14Days.length) return 0;
    const maxVal = Math.max(1, ...salesLast14Days.map((d: any) => d.totalCents || 0));
    return (
      padding.top +
      (1 - Math.min(maxVal, avg14Days) / maxVal) * (chartHeight - padding.top - padding.bottom)
    );
  }, [salesLast14Days, avg14Days]);

  // Formatted current date
  const todayLabel = useMemo(() => {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse p-1">
        <div className="h-20 bg-muted rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-3xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-muted rounded-3xl" />
          <div className="h-72 bg-muted rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* ─── Modern Clean Header Banner ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card rounded-3xl p-6 border border-border/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              {tenant?.tradeName || tenant?.companyName || 'Supermercado Central'}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
              <Sparkles className="w-3 h-3 text-amber-500" /> Varejo & Atacado
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground capitalize flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {todayLabel}
          </p>
        </div>

        {/* Live Cash Register Status Pill & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {isCashOpen ? (
            <div
              onClick={() => navigate(`${base}/finance`)}
              className="group cursor-pointer flex items-center gap-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-500/10/70 hover:bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 rounded-2xl transition-all shadow-2xs"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-50 dark:bg-emerald-500/100" />
              </span>
              <div>
                <p className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                  Caixa Aberto
                  <ChevronRight className="w-3 h-3 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">
                  Gaveta: {brl(currentCashInDrawer)}
                </p>
              </div>
            </div>
          ) : (
            <div
              onClick={() => navigate(`${base}/finance`)}
              className="cursor-pointer flex items-center gap-2.5 px-4 py-2.5 bg-muted hover:bg-muted border border-border rounded-2xl transition-all"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
              <div>
                <p className="text-[11px] font-semibold text-foreground">Caixa Fechado</p>
                <p className="text-[10px] text-muted-foreground">Clique para abrir sessão</p>
              </div>
            </div>
          )}

          {/* Quick Action: Open POS */}
          <Button
            onClick={() => navigate(`${base}/supermarket-pos`)}
            className="h-11 px-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-sm flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            <span>Frente de Caixa (PDV)</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 text-muted-foreground rounded border border-zinc-700">
              F10
            </kbd>
          </Button>

          {/* Quick Action: Import XML */}
          <Button
            variant="outline"
            onClick={() => navigate(`${base}/xml-import`)}
            className="h-11 px-4 rounded-2xl border-border hover:bg-muted text-foreground font-semibold text-xs flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <span>Importar NF-e</span>
          </Button>
        </div>
      </div>

      {/* ─── 4 Hero KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashKpi
          label="Vendas Hoje"
          value={brl(kpis.salesTodayCents || 0)}
          icon={<DollarSign className="w-4 h-4" />}
          tone="emerald"
          footerLeft={
            <span className="text-muted-foreground font-medium">
              <strong className="text-foreground font-bold">{kpis.orderCount || 0}</strong> cupons hoje
            </span>
          }
          pill={
            <span className="inline-flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" /> Ao vivo
            </span>
          }
        />

        <DashKpi
          label="Lucro Bruto (Hoje)"
          value={brl(kpis.grossProfitTodayCents || 0)}
          icon={<ShoppingBag className="w-4 h-4" />}
          tone="amber"
          footerLeft={
            <span className="text-muted-foreground font-medium">
              <strong className="text-foreground font-bold">{kpis.productsSoldToday || 0}</strong> itens
            </span>
          }
          pill={<>Margem ~{grossMarginPct}%</>}
        />

        <DashKpi
          label="Ticket Médio"
          value={brl(kpis.avgTicketCents || 0)}
          icon={<Receipt className="w-4 h-4" />}
          tone="indigo"
          footerLeft={
            <span className="text-muted-foreground font-medium">Média por atendimento</span>
          }
          pill={<>Checkout</>}
        />

        <DashKpi
          label="Dinheiro em Gaveta"
          value={brl(currentCashInDrawer)}
          icon={<Wallet className="w-4 h-4" />}
          tone="teal"
          footerLeft={
            <span className="text-muted-foreground font-medium truncate">
              {isCashOpen ? 'Operação em andamento' : 'Caixa fechado'}
            </span>
          }
          pill={
            <button
              onClick={() => navigate(`${base}/finance`)}
              className="inline-flex items-center gap-0.5 hover:underline"
            >
              Sangria / Suprimento <ChevronRight className="w-3 h-3" />
            </button>
          }
        />
      </div>

      {/* ─── 4 Modern Operational Mini-Indicators ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Ruptura / Estoque Zerado */}
        <div
          onClick={() => navigate(`${base}/products`)}
          className="cursor-pointer bg-card hover:bg-rose-50 dark:bg-rose-500/10/40 rounded-2xl p-4 border border-border/80 shadow-2xs transition-all flex items-center gap-3.5 group"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Boxes className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Estoque Zerado
            </p>
            <p className="text-base font-bold text-foreground flex items-center gap-1.5 font-mono">
              {kpis.zeroStockCount || 0}
              <span className="text-[11px] font-normal text-rose-600 dark:text-rose-400 font-sans">em ruptura</span>
            </p>
          </div>
        </div>

        {/* Estoque Mínimo */}
        <div
          onClick={() => navigate(`${base}/products`)}
          className="cursor-pointer bg-card hover:bg-amber-50 dark:bg-amber-500/10/40 rounded-2xl p-4 border border-border/80 shadow-2xs transition-all flex items-center gap-3.5 group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Estoque Mínimo
            </p>
            <p className="text-base font-bold text-foreground flex items-center gap-1.5 font-mono">
              {kpis.lowStockCount || 0}
              <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 font-sans">repor itens</span>
            </p>
          </div>
        </div>

        {/* A Receber Hoje */}
        <div
          onClick={() => navigate(`${base}/finance/receivables`)}
          className="cursor-pointer bg-card hover:bg-emerald-50 dark:bg-emerald-500/10/40 rounded-2xl p-4 border border-border/80 shadow-2xs transition-all flex items-center gap-3.5 group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Coins className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              A Receber Hoje
            </p>
            <p className="text-base font-bold text-foreground font-mono truncate">
              {fmtMoney(kpis.receivableTodayCents || 0)}
            </p>
          </div>
        </div>

        {/* A Pagar Hoje */}
        <div
          onClick={() => navigate(`${base}/finance/payables`)}
          className="cursor-pointer bg-card hover:bg-blue-50 dark:bg-blue-500/10/40 rounded-2xl p-4 border border-border/80 shadow-2xs transition-all flex items-center gap-3.5 group"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              A Pagar Hoje
            </p>
            <p className="text-base font-bold text-foreground font-mono truncate">
              {fmtMoney(kpis.payableTodayCents || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Main Analytics Bento Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Bézier Curve (Left 2 cols) */}
        <div className="lg:col-span-2 bg-card rounded-3xl p-6 border border-border/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Evolução de Vendas · Últimos 14 Dias
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Faturamento diário registrado no checkout e no delivery
                </p>
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-3 text-xs">
                <div className="px-3 py-1 bg-muted border border-border/70 rounded-xl">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total 14D: </span>
                  <span className="font-mono font-bold text-foreground">{brl(total14Days)}</span>
                </div>
                <div className="px-3 py-1 bg-muted border border-border/70 rounded-xl">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">Média: </span>
                  <span className="font-mono font-bold text-foreground">{brl(avg14Days)}</span>
                </div>
              </div>
            </div>

            {/* Interactive Smooth Bézier Chart */}
            <div className="relative mt-6">
              {chartPoints.length > 0 ? (
                <>
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="w-full h-48 select-none"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                        <stop offset="85%" stopColor="#10b981" stopOpacity="0.02" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="50%" stopColor="#059669" />
                        <stop offset="100%" stopColor="#047857" />
                      </linearGradient>
                    </defs>

                    {/* Dotted Average Line */}
                    {avgY > 0 && (
                      <line
                        x1={padding.left}
                        y1={avgY}
                        x2={chartWidth - padding.right}
                        y2={avgY}
                        stroke="#e4e4e7"
                        strokeDasharray="4 4"
                        strokeWidth="1.2"
                      />
                    )}

                    {/* Gradient Area under Curve */}
                    <path d={areaGradientPath} fill="url(#curveGradient)" />

                    {/* Bézier Line */}
                    <path
                      d={splineCurvePath}
                      fill="none"
                      stroke="url(#strokeGradient)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Hover vertical guide line */}
                    {hoveredChartIndex !== null && chartPoints[hoveredChartIndex] && (
                      <line
                        x1={chartPoints[hoveredChartIndex].x}
                        y1={padding.top}
                        x2={chartPoints[hoveredChartIndex].x}
                        y2={chartHeight - padding.bottom}
                        stroke="#71717a"
                        strokeDasharray="3 3"
                        strokeWidth="1.2"
                      />
                    )}

                    {/* Data Points */}
                    {chartPoints.map((p: any, i: number) => {
                      const isHovered = hoveredChartIndex === i;
                      return (
                        <g key={i}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={isHovered ? 5.5 : 3.5}
                            fill={isHovered ? '#059669' : '#ffffff'}
                            stroke="#059669"
                            strokeWidth={isHovered ? 2.5 : 2}
                            className="transition-all duration-150"
                          />
                          {/* Invisible hover hotspot */}
                          <rect
                            x={p.x - 20}
                            y={0}
                            width={40}
                            height={chartHeight}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredChartIndex(i)}
                            onMouseLeave={() => setHoveredChartIndex(null)}
                          />
                        </g>
                      );
                    })}

                    {/* X Axis Labels */}
                    {chartPoints.map((p: any, i: number) => (
                      <text
                        key={`lbl-${i}`}
                        x={p.x}
                        y={chartHeight - 8}
                        textAnchor="middle"
                        className={`text-[10px] font-mono transition-colors ${
                          hoveredChartIndex === i
                            ? 'fill-zinc-900 font-bold'
                            : 'fill-zinc-400'
                        }`}
                      >
                        {p.d.date ? p.d.date.slice(8, 10) : ''}
                      </text>
                    ))}
                  </svg>

                  {/* Floating Tooltip */}
                  {hoveredChartIndex !== null && chartPoints[hoveredChartIndex] && (
                    <div
                      className="absolute pointer-events-none -top-3 z-10 bg-primary text-primary-foreground rounded-xl px-3 py-1.5 text-xs shadow-lg transform -translate-x-1/2 flex items-center gap-2"
                      style={{
                        left: `${(chartPoints[hoveredChartIndex].x / chartWidth) * 100}%`,
                      }}
                    >
                      <span className="text-muted-foreground font-mono">
                        {chartPoints[hoveredChartIndex].d.date?.slice(5)}:
                      </span>
                      <span className="font-bold font-mono text-emerald-400">
                        {brl(chartPoints[hoveredChartIndex].d.totalCents || 0)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-12">
                  <ErpEmptyState
                    icon={Receipt}
                    title="Sem histórico recente"
                    description="As vendas dos últimos 14 dias aparecerão automaticamente nesta curva gráfica."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-50 dark:bg-emerald-500/100 inline-block" /> Faturamento diário
              consolidado
            </span>
            <span className="text-[11px]">Passe o mouse para ver detalhes</span>
          </div>
        </div>

        {/* Category Share (Right 1 col) */}
        <div className="bg-card rounded-3xl p-6 border border-border/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                  <Tag className="w-4 h-4 text-indigo-500" />
                  Vendas por Categoria
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Participação no faturamento</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {categoryChart.length ? (
                categoryChart.map((cat: any) => (
                  <div key={cat.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground truncate max-w-[140px]">
                        {cat.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[11px]">{cat.pct}%</span>
                        <span className="font-mono font-bold text-foreground text-[11px]">
                          {fmtMoney(cat.value)}
                        </span>
                      </div>
                    </div>
                    {/* Modern pill bar */}
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${cat.color} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(4, cat.pct)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8">
                  <ErpEmptyState
                    icon={Package}
                    title="Nenhuma categoria"
                    description="Vendas associadas a departamentos aparecerão aqui."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border text-right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${base}/reports`)}
              className="text-xs text-muted-foreground hover:text-foreground rounded-xl"
            >
              Ver relatório de margens <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Triad Section: Top Sellers, Expiry Alerts, Live POS Feed ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Col 1: Top Produtos (Curva ABC) */}
        <div className="bg-card rounded-3xl p-6 border border-border/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                Mais Vendidos (Giro)
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Top 5
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {topProducts.length ? (
                topProducts.slice(0, 5).map((p: any, idx: number) => {
                  const maxQty = topProducts[0]?.quantity || 1;
                  const share = Math.round((p.quantity / maxQty) * 100);
                  const medals = ['bg-amber-100 text-amber-800 border-amber-200', 'bg-zinc-200 text-foreground border-border', 'bg-orange-100 text-orange-800 border-orange-200'];
                  const medalBadge = medals[idx] || 'bg-muted text-muted-foreground border-border';

                  return (
                    <div
                      key={p.id || idx}
                      className="p-3 rounded-2xl bg-muted/70 border border-border hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-lg border text-[11px] font-black flex items-center justify-center shrink-0 ${medalBadge}`}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
                          <div className="w-full bg-zinc-200/70 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="bg-zinc-800 h-full rounded-full transition-all duration-500"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black font-mono text-foreground">
                            {p.quantity}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">un vendidas</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8">
                  <ErpEmptyState
                    icon={Package}
                    title="Sem produtos vendidos"
                    description="Os itens de maior saída no caixa aparecerão aqui."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${base}/reports`)}
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground rounded-xl"
            >
              <span>Ver Curva ABC completa</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Col 2: Alertas de Vencimento e Operação */}
        <div className="bg-card rounded-3xl p-6 border border-border/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                Validade & Lotes (15 Dias)
              </h2>
              {expiringSoon.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200">
                  {expiringSoon.length} lote(s)
                </span>
              )}
            </div>

            <div className="mt-4 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {expiringSoon.length > 0 ? (
                expiringSoon.map((b: any) => {
                  const expiryDate = new Date(b.expiryDate);
                  const diffDays = Math.ceil(
                    (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isUrgent = diffDays <= 5;

                  return (
                    <div
                      key={b.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        isUrgent
                          ? 'bg-rose-50 dark:bg-rose-500/10/60 border-rose-200/80'
                          : 'bg-amber-50 dark:bg-amber-500/10/40 border-amber-200/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {b.product?.name || 'Item do lote'}
                          </p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span>Lote: <strong>{b.lotNumber}</strong></span>
                            {b.currentQuantity !== undefined && (
                              <span>Qtd: <strong>{b.currentQuantity}</strong></span>
                            )}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            isUrgent ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {diffDays <= 0 ? 'Vence Hoje' : `${diffDays}d restantes`}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : alerts.length > 0 ? (
                alerts.map((a: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-muted border border-border/60 flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground leading-snug">{a.message}</p>
                  </div>
                ))
              ) : (
                <div className="py-8">
                  <ErpEmptyState
                    icon={CheckCircle2}
                    title="Validades em dia"
                    description="Nenhum lote próximo ao vencimento nos próximos 15 dias."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${base}/xml-import`)}
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground rounded-xl"
            >
              <span>Gerenciar compras e lotes</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Col 3: Feed de Transações Recentes */}
        <div className="bg-card rounded-3xl p-6 border border-border/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                Vendas em Tempo Real
              </h2>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                PDV Feed
              </span>
            </div>

            <div className="mt-4 space-y-2.5 max-h-[300px] overflow-y-auto pr-1 divide-y divide-zinc-50">
              {recentOrders.length ? (
                recentOrders.slice(0, 6).map((o: any) => (
                  <div
                    key={o.id}
                    className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-xl bg-muted text-foreground text-[10px] font-bold font-mono flex items-center justify-center shrink-0">
                        #{o.orderNumber || String(o.id).slice(-4)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {o.items?.length
                            ? `${o.items.length} ${o.items.length === 1 ? 'item' : 'itens'}`
                            : 'Venda Caixa'}
                          {o.customer?.name ? ` · ${o.customer.name}` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(o.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                      <span className="font-mono font-black text-foreground">
                        {brl(o.totalCents)}
                      </span>
                      <PaymentMethodBadge method={o.paymentMethod} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8">
                  <ErpEmptyState
                    icon={Wallet}
                    title="Nenhuma venda recente"
                    description="Abra o checkout para registrar cupons."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${base}/orders`)}
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground rounded-xl"
            >
              <span>Ver histórico de pedidos</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};