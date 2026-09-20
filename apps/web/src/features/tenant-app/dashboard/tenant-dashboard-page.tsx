import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HelpCircle,
  ArrowUp,
  Clock,
  ArrowUpRight,
  Package,
  ShoppingBag,
  Zap,
  Scissors,
  Calendar,
  Users,
  TrendingUp,
  CheckCircle2,
  DollarSign,
  Store,
  Sparkles,
  Copy,
  ExternalLink,
  Phone,
  AlertTriangle,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SupermarketDashboardPage } from './supermarket-dashboard-page';
import { RestaurantDashboardPage } from './restaurant-dashboard-page';
import { AcademyDashboardPage } from '../academy/academy-dashboard-page';
import { RefrigerationDashboardPage } from '../refrigeration/refrigeration-dashboard-page';

// Exact green smooth wave sparkline from the image
const GreenWaveSparkline: React.FC = () => (
  <svg className="w-24 sm:w-28 h-12 overflow-visible" viewBox="0 0 90 40" fill="none">
    <path
      d="M2 28 C 15 28, 20 18, 32 22 C 45 27, 52 4, 68 8 C 76 10, 82 28, 88 32"
      stroke="#20ba68"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const APPT_STATUS_META: Record<string, { label: string; classes: string }> = {
  IN_PROGRESS: { label: 'EM ATENDIMENTO', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  CONFIRMED: { label: 'CONFIRMADO', classes: 'bg-blue-100 text-blue-800 border-blue-200' },
  COMPLETED: { label: 'CONCLUÍDO', classes: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  CANCELLED: { label: 'CANCELADO', classes: 'bg-rose-100 text-rose-700 border-rose-200' },
  BLOCKED: { label: 'BLOQUEADO', classes: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
};

const GenericTenantDashboard: React.FC<{ isBarbershop: boolean }> = ({ isBarbershop }) => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['tenant-dashboard', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/dashboard`),
    enabled: Boolean(slug),
    refetchInterval: 10000,
  });

  // Agenda e equipe reais (só busca quando é barbearia).
  const { data: appointmentsData = [] } = useQuery({
    queryKey: ['tenant-appointments', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/appointments`),
    enabled: Boolean(slug) && isBarbershop,
    refetchInterval: 15000,
  });
  const { data: barbersData } = useQuery({
    queryKey: ['tenant-barbers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/barbers`),
    enabled: Boolean(slug) && isBarbershop,
    refetchInterval: 30000,
  });

  // Zeros honestos: sem venda não há faturamento a exibir.
  const kpis = {
    totalSalesCents: Number(data?.kpis?.totalSalesCents || 0),
    orderCount: Number(data?.kpis?.orderCount || 0),
    lowStockCount: Number(data?.kpis?.lowStockCount || 0),
    totalCustomers: Number(data?.kpis?.totalCustomers || 0),
  };

  const recentOrders = data?.recentOrders || [];

  const formattedEarning = useMemo(() => {
    const total = kpis.totalSalesCents / 100;
    if (total >= 1000) {
      return `R$ ${(total / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
    }
    return brl(kpis.totalSalesCents);
  }, [kpis.totalSalesCents]);

  const customerCount = kpis.totalCustomers;

  const bookingUrl = slug ? `${window.location.origin}/${slug}/agendar` : '';

  const copyBookingLink = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success('Link de agendamento online copiado! Compartilhe no WhatsApp ou Instagram.');
    } catch {
      toast.error('Não foi possível copiar. Copie o endereço manualmente.');
    }
  };

  // ─── Agenda real de hoje ───
  const todayAppointments = useMemo(() => {
    const now = new Date();
    const list = Array.isArray(appointmentsData) ? appointmentsData : [];
    return list
      .filter((a: any) => {
        if (!a?.scheduledAt) return false;
        const d = new Date(a.scheduledAt);
        return sameDay(d, now) && a.status !== 'CANCELLED';
      })
      .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [appointmentsData]);

  const upcomingToday = useMemo(() => {
    const now = new Date();
    return todayAppointments.filter(
      (a: any) => new Date(a.scheduledAt).getTime() >= now.getTime() - 30 * 60000 && a.status !== 'COMPLETED',
    );
  }, [todayAppointments]);

  const doneToday = useMemo(
    () => todayAppointments.filter((a: any) => a.status === 'COMPLETED'),
    [todayAppointments],
  );

  const ticketMedio = kpis.orderCount > 0 ? Math.round(kpis.totalSalesCents / kpis.orderCount) : 0;

  const realBarbers = useMemo(() => {
    const list = Array.isArray((barbersData as any)?.barbers) ? (barbersData as any).barbers : [];
    return [...list]
      .sort(
        (a: any, b: any) =>
          Number(b?.metrics?.currentMonthRevenueCents || 0) - Number(a?.metrics?.currentMonthRevenueCents || 0),
      )
      .slice(0, 3);
  }, [barbersData]);

  // ══════ BARBEARIA: atalho do link online (o painel agora é o Universal) ══════
  if (isBarbershop) {
    return (
      <div className="space-y-4 font-sans">
        {/* Banner Link de Agendamento Online (mantido) */}
        <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-[26px] p-5 sm:p-6 shadow-elevated border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black tracking-tight">Agendamento online ativo</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Compartilhe o link e receba reservas sozinho.</p>
          </div>
          <Button
            size="sm"
            onClick={copyBookingLink}
            className="h-10 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-black shrink-0"
          >
            Copiar link
          </Button>
        </div>
      </div>
    );
  }

    // ══════ CASO PADRÃO / OUTROS NICHOS: OVERVIEW E PRODUTOS ══════
  return (
    <div className="space-y-7 font-sans">
      {/* ─── Top Dual Card: Overview (Identical to Image) ─────────────── */}
      <div className="bg-white rounded-[32px] p-7 sm:p-9 shadow-[0_2px_14px_rgba(0,0,0,0.03)] border border-zinc-200/40">
        <h2 className="text-lg font-bold text-[#111827] mb-7">Overview</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-14">
          {/* Left Column: Earning */}
          <div className="space-y-6">
            <div className="w-12 h-12 rounded-full bg-[#f4f5f7] flex items-center justify-center text-zinc-800">
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="5" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M7 9.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>

            <div className="flex items-center gap-1 text-sm font-semibold text-[#6c757d]">
              <span>Earning</span>
              <HelpCircle className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#111827]">
                {formattedEarning}
              </span>
              <GreenWaveSparkline />
            </div>

            <div className="pt-1">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-zinc-100 text-zinc-600">
                <span className="font-normal">acumulado real do período</span>
              </span>
            </div>
          </div>

          {/* Right Column: Customer */}
          <div className="space-y-6 md:border-l md:border-zinc-100 md:pl-10 lg:pl-14">
            <div className="w-12 h-12 rounded-full bg-[#f4f5f7] flex items-center justify-center text-zinc-400">
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="6.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 16C4 13 7 12 10 12C13 12 16 13 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>

            <div className="flex items-center gap-1 text-sm font-semibold text-[#6c757d]">
              <span>Customer</span>
              <HelpCircle className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
            </div>

            <div>
              <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#a1a7b3]">
                {customerCount}
              </span>
            </div>

            <div className="pt-1">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-zinc-100 text-zinc-600">
                <span className="font-normal">base real de clientes</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom Card: Product Activity ──────── */}
      <div className="bg-white rounded-[32px] p-7 sm:p-9 shadow-[0_2px_14px_rgba(0,0,0,0.03)] border border-zinc-200/40">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[#111827]">Product activity</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${base}/orders`)}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 rounded-xl"
          >
            <span>View all</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-[#f4f5f7] flex items-center justify-center text-zinc-400 mb-1">
              <Package className="w-5 h-5" />
            </div>
            <p className="font-semibold text-zinc-700 text-sm">No recent product activity</p>
            <span className="text-zinc-400">Transactions and sales will appear here automatically.</span>
            <Button
              size="sm"
              onClick={() => navigate(`${base}/pos`)}
              className="mt-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold px-4"
            >
              Open Shop Terminal
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {recentOrders.map((order: any) => (
              <div key={order.id} className="py-4 flex items-center justify-between text-xs hover:bg-zinc-50/50 px-2 rounded-2xl transition">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#f4f5f7] font-bold text-zinc-800 flex items-center justify-center shrink-0">
                    #{order.orderNumber}
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900 text-sm">
                      {order.items?.map((i: any) => `${i.quantity}x ${i.product?.name}`).join(', ') || 'Sale items'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>·</span>
                      <span>{order.customer ? order.customer.name : 'Customer'}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-extrabold text-zinc-900 text-base block font-mono">
                    {(Number(order.totalCents || 0) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-zinc-400">
                    {order.paymentMethod}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const TenantDashboardPage: React.FC = () => {
  const { tenant } = useTenant();

  const isRestaurant =
    tenant?.niche === 'RESTAURANT' ||
    (!['RESTAURANT', 'BARBERSHOP', 'SUPERMARKET', 'UNIVERSAL'].includes(String(tenant?.niche || '').toUpperCase()) &&
      ['JAPANESE', 'BURGER_HOUSE', 'PIZZERIA', 'PASTRY', 'RESTAURANT'].includes(
        String(tenant?.niche || (tenant as any)?.category || (tenant as any)?.company?.category || '').toUpperCase()
      )) ||
    (tenant?.features || []).includes('tables') ||
    (tenant?.features || []).includes('kds');

  const isBarbershop =
    !isRestaurant &&
    (tenant?.niche === 'BARBERSHOP' ||
      (tenant?.features || []).includes('appointments') ||
      (tenant?.features || []).includes('barbers'));

  const isSupermarket =
    !isRestaurant &&
    !isBarbershop &&
    (tenant?.niche === 'SUPERMARKET' ||
      tenant?.niche === 'UNIVERSAL' ||
      (tenant?.features || []).includes('pos_fast') ||
      (tenant?.features || []).includes('stock_batches'));

  if (isRestaurant) {
    return <RestaurantDashboardPage />;
  }

  // Dashboard Universal (o do mercadinho): vale para Universal, mercado e
  // TODA a parte da barbearia (barbearia, salão, refrigeração, gráfica,
  // internet, loja) — um painel só, com dado real. ACADEMIA tem painel
  // fitness próprio.
  const companyCategory = String(
    (tenant as any)?.company?.category || (tenant as any)?.category || '',
  ).toUpperCase();
  if (companyCategory === 'ACADEMIA' && (tenant?.niche === 'BARBERSHOP' || (tenant?.features || []).includes('gym'))) {
    return <AcademyDashboardPage />;
  }

  if (companyCategory === 'REFRIGERACAO' && (tenant?.niche === 'BARBERSHOP' || (tenant?.features || []).includes('service'))) {
    return <RefrigerationDashboardPage />;
  }

  if (isSupermarket || isBarbershop) {
    return <SupermarketDashboardPage />;
  }

  return <GenericTenantDashboard isBarbershop={false} />;
};

