import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingBag,
  Users,
  DollarSign,
  TrendingUp,
  Search,
  Bell,
  Settings,
  ChevronDown,
  UtensilsCrossed,
  ArrowUpRight,
  Sparkles,
  Flame,
  Zap,
  X,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';

// ─── Componente SVG da Curva Suave de Receita Total ───
interface SplinePoint {
  month: string;
  receita: number;
  despesas: number;
}

const RevenueSplineChart: React.FC<{ data?: SplinePoint[] }> = ({ data }) => {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const months = useMemo(() => {
    if (data && data.length > 0) return data;
    // Sem dados: 14 dias zerados com rótulos reais (nunca curva inventada).
    const out: SplinePoint[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({
        month: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        receita: 0,
        despesas: 0,
      });
    }
    return out;
  }, [data]);

  // Sem hover manual: mostra o ponto mais recente (hoje), nunca o zero antigo.
  const activePoint = hoveredPoint ?? (months.length > 0 ? months.length - 1 : null);

  const maxVal = useMemo(() => {
    const highest = Math.max(0, ...months.map((m) => Math.max(m.receita, m.despesas)));
    if (highest <= 0) return 100;
    // Teto "redondo" (1/1.2/1.5/2/2.5/3/4/5/6/8/10 × 10^n) p/ eixo legível.
    const target = highest * 1.1;
    const exp = Math.floor(Math.log10(target));
    const base = 10 ** exp;
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      if (target <= m * base) return m * base;
    }
    return 10 * base;
  }, [months]);

  // Grade em 100%/75%/50%/25% do teto + rótulos redondos (mesmas linhas).
  const GRID_YS = [40, 75, 110, 145];
  const GRID_FRACS = [1, 0.75, 0.5, 0.25];
  // Rótulos do eixo Y acompanham a escala real (mesmas linhas de grade).
  const yTicks = useMemo(() => {
    const fmt = (v: number) =>
      v >= 1000 ? `${parseFloat((v / 1000).toFixed(1))}k` : `${Math.round(v)}`;
    return GRID_YS.map((y, i) => ({
      y,
      label: fmt(maxVal * GRID_FRACS[i]),
    }));
  }, [maxVal]);

  // X dinâmico p/ qualquer quantidade de pontos (8 meses ou 14 dias).
  const xCoords = useMemo(() => {
    const n = months.length;
    if (n <= 1) return [212];
    return months.map((_, i) => 20 + (i * 385) / (n - 1));
  }, [months]);

  const pointsReceita = useMemo(() => {
    return months.map((m, idx) => ({
      month: m.month,
      val: m.receita,
      x: xCoords[idx] ?? 20,
      y: Math.max(40, Math.min(180, 180 - (m.receita / maxVal) * 140)),
    }));
  }, [months, maxVal, xCoords]);

  const pointsDespesas = useMemo(() => {
    return months.map((m, idx) => ({
      month: m.month,
      val: m.despesas,
      x: xCoords[idx] ?? 20,
      y: Math.max(40, Math.min(180, 180 - (m.despesas / maxVal) * 140)),
    }));
  }, [months, maxVal, xCoords]);

  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpx = (p0.x + p1.x) / 2;
      d += ` C ${cpx} ${p0.y}, ${cpx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const pathReceita = buildSmoothPath(pointsReceita);
  const pathDespesas = buildSmoothPath(pointsDespesas);

  return (
    <div className="relative w-full h-[220px]">
      <svg
        viewBox="0 0 430 220"
        className="w-full h-full overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#FF6B00" stopOpacity="0" />
          </linearGradient>
        </defs>

          {GRID_YS.map((y, idx) => (
            <line
              key={idx}
              x1="15"
              y1={y}
              x2="415"
              y2={y}
              stroke="#F1F1F4"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}

          {yTicks.map((t, idx) => (
            <text key={idx} x="5" y={t.y} fill="#A1A1AA" fontSize="9" fontWeight="bold">
              {t.label}
            </text>
          ))}

        <path
          d={`${pathReceita} L ${xCoords[months.length - 1] ?? 405} 180 L 20 180 Z`}
          fill="url(#gradReceita)"
        />

        <path
          d={pathDespesas}
          stroke="#9A715C"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d={pathReceita}
          stroke="#FF6B00"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pointsReceita.map((p, idx) => (
          <text
            key={idx}
            x={p.x}
            y="205"
            textAnchor="middle"
            fill={idx === activePoint ? '#FF6B00' : '#A1A1AA'}
            fontSize={pointsReceita.length > 8 ? 8 : 10}
            fontWeight={idx === activePoint ? 'bold' : 'normal'}
            className="cursor-pointer transition-colors"
            onClick={() => setHoveredPoint(idx)}
          >
            {pointsReceita.length > 8 && idx % 2 === 1 ? '' : p.month}
          </text>
        ))}

        {activePoint !== null && pointsReceita[activePoint] && (
          <g className="transition-all duration-300">
            <line
              x1={pointsReceita[activePoint].x}
              y1={pointsReceita[activePoint].y}
              x2={pointsReceita[activePoint].x}
              y2="190"
              stroke="#FF6B00"
              strokeWidth="1.2"
              strokeDasharray="2 2"
            />
            <circle
              cx={pointsReceita[activePoint].x}
              cy={pointsReceita[activePoint].y}
              r="4.5"
              fill="#FFFFFF"
              stroke="#FF6B00"
              strokeWidth="3"
            />
          </g>
        )}
      </svg>

      {activePoint !== null && pointsReceita[activePoint] && (
        <div
          className="absolute z-10 px-2.5 py-1 rounded-xl bg-zinc-950 text-white text-[11px] font-bold shadow-lg flex items-center gap-1.5 pointer-events-none -translate-x-1/2 whitespace-nowrap"
          style={{
            left: `${(pointsReceita[activePoint].x / 430) * 100}%`,
            top: `${Math.max(10, pointsReceita[activePoint].y - 35)}px`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]" />
          <span>{pointsReceita[activePoint].month}{pointsReceita[activePoint].month.includes('/') ? '' : ` ${new Date().getFullYear()}`}:</span>
          <span className="text-[#FF6B00]">R$ {pointsReceita[activePoint].val.toLocaleString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
};

// ─── Gráfico de Rosca: Categorias Mais Populares ───
interface CategoryItem {
  name: string;
  percentage: number;
  color: string;
  count?: number;
}

const CategoriesDonutChart: React.FC<{ categories?: CategoryItem[] }> = ({ categories }) => {
  const cats = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    return [];
  }, [categories]);

  if (cats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-xs font-bold text-zinc-500">Sem categorias com pratos</p>
        <p className="text-[11px] text-zinc-400 mt-1">Cadastre o cardápio para ver a distribuição.</p>
      </div>
    );
  }

  const circ = 238.76;
  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {cats.map((cat, idx) => {
            const strokeDasharray = `${(cat.percentage / 100) * circ} ${circ}`;
            const strokeDashoffset = -((accumulatedPercent / 100) * circ);
            accumulatedPercent += cat.percentage;

            return (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke={cat.color}
                strokeWidth="15"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center shadow-inner">
          <span className="text-xs font-black text-zinc-900">100%</span>
          <span className="text-[9px] text-zinc-400 font-semibold uppercase">Total</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full text-xs">
        {cats.map((cat, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-zinc-600 truncate text-[11px]">{cat.name}</span>
            <span className="font-bold text-zinc-900 ml-auto text-[11px]">{cat.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Gráfico de Barras: Visão Geral de Pedidos na Semana ───
interface WeeklyBarItem {
  day: string;
  orders: number;
  isHighlight?: boolean;
}

const OrdersBarChart: React.FC<{ bars?: WeeklyBarItem[] }> = ({ bars }) => {
  // Sem movimento a semana é zerada de verdade (estrutura fixa Seg–Dom).
  const days = useMemo(() => {
    if (bars && bars.length > 0) return bars;
    return [
      { day: 'Seg', orders: 0 },
      { day: 'Ter', orders: 0 },
      { day: 'Qua', orders: 0 },
      { day: 'Qui', orders: 0 },
      { day: 'Sex', orders: 0 },
      { day: 'Sáb', orders: 0 },
      { day: 'Dom', orders: 0 },
    ];
  }, [bars]);

  const maxVal = useMemo(() => {
    const highest = Math.max(...days.map((d) => d.orders), 180);
    return highest * 1.15;
  }, [days]);

  return (
    <div className="w-full space-y-2">
      <div className="h-44 flex items-end justify-between gap-2 pt-8 relative">
        {days.map((d, idx) => {
          const maxOrders = Math.max(...days.map((x) => x.orders));
          const heightPercent = d.orders > 0 ? Math.min(100, Math.max(8, (d.orders / maxVal) * 100)) : 0;
          const isHighlight = maxOrders > 0 && (d.isHighlight || d.orders === maxOrders);

          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
              {isHighlight && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-xl bg-zinc-900 text-white text-[10px] font-bold shadow-md whitespace-nowrap">
                  <span>{d.day}: {d.orders} pedidos</span>
                  <div className="w-2 h-2 bg-zinc-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
                </div>
              )}

              <div
                className={`w-full max-w-[34px] rounded-t-xl transition-all duration-300 ${
                  isHighlight
                    ? 'bg-[#FF6B00] shadow-md shadow-orange-200'
                    : 'bg-[#FEEAD9] group-hover:bg-[#FDBA74]'
                }`}
                style={{ height: `${heightPercent}%` }}
              />

              <span
                className={`text-[11px] mt-2 ${
                  isHighlight ? 'font-bold text-[#FF6B00]' : 'text-zinc-400 font-medium'
                }`}
              >
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── PÁGINA PRINCIPAL DO DASHBOARD DO RESTAURANTE ───
export const RestaurantDashboardPage: React.FC = () => {
  const { slug, base, currentUser } = useTenant();
  const navigate = useNavigate();

  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'PREPARING' | 'READY' | 'COMPLETED'>('ALL');
  const [showNotifications, setShowNotifications] = useState(false);

  // 1. Busca dados operacionais do restaurante em tempo real via NestJS API
  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['restaurant-dashboard', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/dashboard/restaurant`),
    refetchInterval: 5000,
  });

  // KPIs (zeros honestos quando não há movimento)
  const kpis = dashboardData?.kpis || {
    totalOrders: 0,
    totalCustomers: 0,
    totalRevenue: 0,
    todaySales: 0,
    todayCount: 0,
    yesterdaySales: 0,
    occupiedTables: 0,
    freeTables: 0,
    totalTables: 0,
  };

  // Pedidos Recentes com filtragem ao vivo (sem mock: vazio mostra vazio)
  const filteredOrders = useMemo(() => {
    const rawList = dashboardData?.recentOrders || [];

    return rawList.filter((order: any) => {
      if (orderStatusFilter === 'PREPARING' && order.status !== 'PREPARING' && order.status !== 'PENDING') return false;
      // Prontos = aguardando o garçom (READY) ou a caminho/entregue (DELIVERED).
      if (orderStatusFilter === 'READY' && order.status !== 'READY' && order.status !== 'DELIVERED') return false;
      if (orderStatusFilter === 'COMPLETED' && order.status !== 'COMPLETED') return false;

      if (!orderSearch.trim()) return true;
      const q = orderSearch.toLowerCase();
      return (
        order.id?.toLowerCase().includes(q) ||
        order.name?.toLowerCase().includes(q) ||
        order.customer?.toLowerCase().includes(q) ||
        order.category?.toLowerCase().includes(q)
      );
    });
  }, [dashboardData?.recentOrders, orderSearch, orderStatusFilter]);

  // Pratos Mais Vendidos (ranking real por faturamento; vazio mostra vazio)
  const trendingMenus = dashboardData?.trendingMenus || [];

  // Atividades Recentes (só desta casa; vazio mostra vazio)
  const recentActivities = dashboardData?.recentActivities || [];

  // Tipos de Pedido (zeros honestos quando não há movimento)
  const orderTypes = dashboardData?.orderTypes || {
    dineIn: { count: 0, percentage: 0 },
    takeaway: { count: 0, percentage: 0 },
    delivery: { count: 0, percentage: 0 },
  };

  // Pedidos da semana (soma real das barras diárias) — usado no selo do KPI.
  const weekOrders = useMemo(() => {
    const bars = dashboardData?.weeklyBars || [];
    return bars.reduce((s: number, d: any) => s + Number(d.orders || 0), 0);
  }, [dashboardData?.weeklyBars]);

  return (
    <div className="min-h-screen bg-[#FAF7F5] font-sans pb-16 m-0 sm:-m-6 md:-m-8 p-4 sm:p-6 md:p-8 space-y-6 overflow-x-hidden">
      {/* ─── 1. HEADER MODERNO DO DASHBOARD (COM ATALHOS OPERACIONAIS) ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-zinc-200/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
              Dashboard
            </h1>
            <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
              Salão ao Vivo
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium mt-0.5">
            Olá {currentUser?.name || 'Gestor'}, bem-vindo de volta! •{' '}
            <span className="text-zinc-700 font-semibold">
              {kpis.occupiedTables} mesas ocupadas / {kpis.freeTables} livres
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            size="sm"
            onClick={() => navigate(`${base}/kds`)}
            className="h-9 px-3.5 text-xs font-bold text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-2xl shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-orange-600" />
            <span>KDS Cozinha</span>
          </Button>

          <Button
            size="sm"
            onClick={() => navigate(`${base}/tables`)}
            className="h-9 px-3.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-2xl shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Configurar Salão</span>
          </Button>

          <Button
            size="sm"
            onClick={() => navigate(`${base}/tables`)}
            className="h-9 px-4 text-xs font-bold bg-[#FF6B00] hover:bg-orange-600 text-white rounded-2xl shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
            <span>Nova Venda</span>
          </Button>

          <button
            type="button"
            onClick={() => navigate(`${base}/settings`)}
            className="w-9 h-9 rounded-2xl bg-white border border-zinc-200/80 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors shadow-2xs cursor-pointer"
            title="Configurações"
          >
            <Settings className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-9 h-9 rounded-2xl bg-white border border-zinc-200/80 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors shadow-2xs cursor-pointer relative"
              title="Notificações"
            >
              <Bell className="w-4 h-4" />
              <span className="w-2 h-2 rounded-full bg-[#FF6B00] absolute top-2 right-2 border-2 border-white" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-zinc-200 shadow-xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <h4 className="text-xs font-black text-zinc-900">Notificações do Restaurante</h4>
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="text-zinc-400 hover:text-zinc-600 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="py-2 space-y-2.5 max-h-60 overflow-y-auto">
                  {recentActivities.length === 0 ? (
                    <p className="text-[11px] text-zinc-400 text-center py-4">
                      Nenhuma atividade recente por aqui.
                    </p>
                  ) : (
                    recentActivities.slice(0, 5).map((act: any) => (
                      <div key={act.id} className="flex items-start gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-zinc-800">
                            {act.author} <span className="font-normal text-zinc-500">· {act.timestamp}</span>
                          </p>
                          <span className="text-[10px] text-zinc-400">{act.action}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 pl-1.5 py-1 pr-3 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs">
            <div className="w-8 h-8 rounded-xl overflow-hidden bg-zinc-900 text-white flex items-center justify-center font-bold text-xs">
              {(currentUser?.name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-zinc-900 leading-tight">
                {currentUser?.name || 'Gestor'}
              </div>
              <div className="text-[10px] text-zinc-400 font-medium leading-none">
                Administrador
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. TOP CARDS DE KPIS (Total Pedidos, Total Clientes, Receita Total) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <div className="rounded-[26px] bg-white p-5 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FF6B00] text-white flex items-center justify-center shadow-sm shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-zinc-400 font-semibold block">
                Total de Pedidos
              </span>
              <span className="text-2xl sm:text-[26px] font-black text-zinc-900 tracking-tight block mt-0.5">
                {kpis.totalOrders.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full self-start">
            <TrendingUp className="w-3 h-3" />
            <span>{weekOrders} esta semana</span>
          </div>
        </div>

        <div className="rounded-[26px] bg-white p-5 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FF6B00] text-white flex items-center justify-center shadow-sm shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-zinc-400 font-semibold block">
                Total de Clientes
              </span>
              <span className="text-2xl sm:text-[26px] font-black text-zinc-900 tracking-tight block mt-0.5">
                {kpis.totalCustomers.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] bg-white p-5 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FF6B00] text-white flex items-center justify-center shadow-sm shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-zinc-400 font-semibold block">
                Receita Total
              </span>
              <span className="text-2xl sm:text-[26px] font-black text-zinc-900 tracking-tight block mt-0.5">
                R$ {kpis.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div
            className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full self-start"
            title={`Ontem: R$ ${Number(kpis.yesterdaySales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>
              Hoje: R$ {Number(kpis.todaySales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {Number(kpis.todayCount || 0) > 0 ? ` · ${kpis.todayCount} ped.` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 3. ESTRUTURA PRINCIPAL: COLUNA ESQUERDA (PC) + SIDEBAR LATERAL DIREITA ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Spline Chart + Donut Chart */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                      Receita Total
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-zinc-900 mt-0.5 block">
                      R$ {kpis.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="relative">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50 text-xs font-semibold text-zinc-600">
                      <span>Últimos 14 dias</span>
                    </span>
                  </div>
                </div>

                <div className="pt-4">
                  <RevenueSplineChart
                    data={(dashboardData?.revenueDaily || []).map((d: any) => ({
                      month: d.label,
                      receita: d.receita,
                      despesas: d.despesas,
                    }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-5 pt-3 border-t border-zinc-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-md bg-[#FF6B00]" />
                  <span className="text-zinc-600 font-medium">Receita de Vendas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-md bg-[#9A715C]" />
                  <span className="text-zinc-600 font-medium">Custos & Despesas</span>
                </div>
              </div>
            </div>

            <div className="md:col-span-5 rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-900">
                  Categorias Populares
                </h3>
                <button
                  type="button"
                  onClick={() => navigate(`${base}/products`)}
                  className="text-xs font-bold text-[#FF6B00] hover:text-orange-700 flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Ver Cardápio</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="py-2">
                <CategoriesDonutChart categories={dashboardData?.catDistribution} />
              </div>
            </div>
          </div>

          {/* Bar Chart + Order Types */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-zinc-900">
                    Visão Geral de Pedidos
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Produção Semanal da Cozinha
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`${base}/orders`)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-zinc-200/80 bg-zinc-50 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 transition"
                >
                  <span>Esta Semana</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>
              </div>

              <div className="pt-2">
                <OrdersBarChart bars={dashboardData?.weeklyBars} />
              </div>
            </div>

            <div className="md:col-span-5 rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black text-zinc-900">
                  Tipos de Pedido
                </h3>
                <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-lg">
                  Histórico
                </span>
              </div>

              <div className="space-y-4 my-auto">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
                      <span>🍽️</span>
                      <span>Salão (Dine-In) <strong className="text-zinc-900">{orderTypes.dineIn.percentage}%</strong></span>
                    </span>
                    <span className="font-black text-zinc-900">{orderTypes.dineIn.count}</span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-[#FF6B00] h-2 rounded-full" style={{ width: `${orderTypes.dineIn.percentage}%` }} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
                      <span>🛍️</span>
                      <span>Retirada (Takeaway) <strong className="text-zinc-900">{orderTypes.takeaway.percentage}%</strong></span>
                    </span>
                    <span className="font-black text-zinc-900">{orderTypes.takeaway.count}</span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-[#FDBA74] h-2 rounded-full" style={{ width: `${orderTypes.takeaway.percentage}%` }} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
                      <span>🛵</span>
                      <span>Delivery Online <strong className="text-zinc-900">{orderTypes.delivery.percentage}%</strong></span>
                    </span>
                    <span className="font-black text-zinc-900">{orderTypes.delivery.count}</span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-zinc-800 h-2 rounded-full" style={{ width: `${orderTypes.delivery.percentage}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pedidos Recentes com Busca e Filtros Vivos */}
          <div className="rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-zinc-900">
                  Pedidos Recentes
                </h3>
                <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                  {filteredOrders.length} registros
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Filtrar por prato, cliente ou #ID..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#FF6B00] w-48 sm:w-56"
                  />
                  {orderSearch && (
                    <button
                      type="button"
                      onClick={() => setOrderSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('ALL')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      orderStatusFilter === 'ALL' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('PREPARING')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      orderStatusFilter === 'PREPARING' ? 'bg-white text-amber-700 shadow-2xs' : 'text-zinc-500'
                    }`}
                  >
                    Preparo
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('READY')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      orderStatusFilter === 'READY' ? 'bg-white text-blue-700 shadow-2xs' : 'text-zinc-500'
                    }`}
                  >
                    Prontos
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('COMPLETED')}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                      orderStatusFilter === 'COMPLETED' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-zinc-500'
                    }`}
                  >
                    Concluídos
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`${base}/orders`)}
                  className="text-xs font-bold text-[#FF6B00] hover:text-orange-700 flex items-center gap-0.5 cursor-pointer ml-1"
                >
                  <span>Ver Todos</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    <th className="pb-3 font-bold">ID Pedido</th>
                    <th className="pb-3 font-bold">Foto</th>
                    <th className="pb-3 font-bold">Cardápio / Item</th>
                    <th className="pb-3 font-bold text-center">Qtd</th>
                    <th className="pb-3 font-bold">Valor</th>
                    <th className="pb-3 font-bold">Cliente / Mesa</th>
                    <th className="pb-3 font-bold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-400 text-xs">
                        Nenhum pedido encontrado para o filtro "{orderSearch}".
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order: any) => (
                      <tr key={order.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3 font-mono font-bold text-zinc-700">
                          {order.id}
                        </td>
                        <td className="py-3">
                          <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shrink-0 flex items-center justify-center">
                            {order.imageUrl ? (
                              <img
                                src={order.imageUrl}
                                alt={order.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-sm font-black text-zinc-400">
                                {(order.name || '?').charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="font-bold text-zinc-900 leading-tight">
                            {order.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-medium">
                            {order.category}
                          </div>
                          {order.notes && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-md">
                              <span>📝 {order.notes}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 text-center font-bold text-zinc-700">
                          {order.quantity}
                        </td>
                        <td className="py-3 font-bold text-zinc-900">
                          {Number(order.amount || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                        <td className="py-3 text-zinc-600 font-medium">
                          {order.customer}
                        </td>
                        <td className="py-3 text-right">
                          <span
                            className={`inline-block text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${order.statusStyle}`}
                          >
                            {order.statusLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ══════ LADO DIREITO: PRATOS EM ALTA, ATIVIDADES RECENTES E UPGRADE ══════ */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-zinc-900">
                Pratos Mais Vendidos
              </h3>
              <span className="px-2.5 py-1 rounded-xl border border-zinc-200/80 bg-zinc-50 text-[11px] font-semibold text-zinc-600">
                Mais vendidos
              </span>
            </div>

            <div className="space-y-4">
              {trendingMenus.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-6">
                  Sem vendas ainda — os pratos mais vendidos aparecem aqui.
                </p>
              ) : (
                trendingMenus.map((dish: any) => (
                <div
                  key={dish.id}
                  onClick={() => navigate(`${base}/products`)}
                  className="flex items-center gap-3.5 p-2 rounded-2xl hover:bg-zinc-50/80 transition-colors group cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200/80 shrink-0 shadow-2xs group-hover:scale-105 transition-transform duration-200 flex items-center justify-center">
                    {dish.imageUrl ? (
                      <img
                        src={dish.imageUrl}
                        alt={dish.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-xl font-black text-zinc-300">
                        {(dish.name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black text-zinc-900 truncate leading-tight">
                      {dish.name}
                    </h4>
                    <span className="text-[10px] text-zinc-400 font-medium block">
                      {dish.category || 'Cardápio'}
                    </span>

                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-zinc-500 font-bold">
                        {dish.soldQty} vendido(s)
                      </span>

                      <span className="text-xs font-black text-[#FF6B00] ml-auto">
                        {Number(dish.price || 0).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                ))
              )}
            </div>
          </div>

          {/* Atividades Recentes */}
          <div className="rounded-[28px] bg-white p-5 sm:p-6 border border-zinc-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-zinc-900">
                Atividades Recentes
              </h3>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-zinc-400 hover:text-zinc-700 text-xs font-bold cursor-pointer"
                title="Atualizar dados"
              >
                •••
              </button>
            </div>

            <div className="space-y-4">
              {recentActivities.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-6">
                  Nenhuma atividade recente por aqui.
                </p>
              ) : (
                recentActivities.map((act: any) => (
                <div key={act.id} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0 flex items-center justify-center">
                    <img
                      src={act.avatarUrl}
                      alt={act.author}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-zinc-900">{act.author}</span>
                      <span className="text-[10px] text-zinc-400">{act.timestamp}</span>
                    </div>
                    <p className="text-zinc-500 text-[11px] mt-0.5 leading-tight">
                      {act.action}
                    </p>
                  </div>
                </div>
                ))
              )}
            </div>
          </div>

          {/* Card Promocional */}
          <div className="rounded-[28px] bg-gradient-to-br from-[#1C1917] to-[#292524] p-5 sm:p-6 text-white space-y-4 shadow-md relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-orange-600/10 blur-2xl pointer-events-none" />

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-xl shadow-inner">
                🍜
              </div>
              <div>
                <h4 className="text-sm font-black leading-tight">
                  Relatórios de Performance
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Análise preditiva de pratos e CMV
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Descubra os pratos com maior margem de contribuição e reduza o desperdício de insumos com previsões automáticas de vendas.
            </p>

            <button
              type="button"
              onClick={() => navigate(`${base}/recipes`)}
              className="w-full py-2.5 rounded-2xl bg-[#FF6B00] hover:bg-orange-600 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
            >
              Ver Fichas Técnicas & CMV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
