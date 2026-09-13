import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HelpCircle,
  ArrowUp,
  ArrowDown,
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

export const TenantDashboardPage: React.FC = () => {
  const { slug, base, tenant } = useTenant();
  const navigate = useNavigate();

  const isBarbershop = tenant?.niche === 'BARBERSHOP';
  const isSupermarket = tenant?.niche === 'SUPERMARKET';
  const isRestaurant = tenant?.niche === 'RESTAURANT';

  if (isSupermarket) {
    return <SupermarketDashboardPage />;
  }

  if (isRestaurant) {
    return <RestaurantDashboardPage />;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-dashboard', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/dashboard`),
    refetchInterval: 10000,
  });

  const kpis = data?.kpis || {
    totalSalesCents: 12800000, // 128k
    orderCount: 42,
    lowStockCount: 3,
    totalCustomers: 512,
  };

  const recentOrders = data?.recentOrders || [];

  const formattedEarning = useMemo(() => {
    const total = kpis.totalSalesCents / 100;
    if (total >= 1000) {
      return `$ ${(total / 1000).toFixed(0)}k`;
    }
    return `$ ${total.toFixed(0)}`;
  }, [kpis.totalSalesCents]);

  const customerCount = kpis.totalCustomers > 0 ? kpis.totalCustomers : 512;

  const bookingUrl = `${window.location.origin}/${slug}/agendar`;

  const copyBookingLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    toast.success('Link de agendamento online copiado! Compartilhe no WhatsApp ou Instagram.');
  };

  // ══════ SE FOR BARBEARIA: TEMPLATE COMPLETO DE BARBEARIA ══════
  if (isBarbershop) {
    return (
      <div className="space-y-6 font-sans">
        {/* ─── 1. Banner Link de Agendamento Online Público ─── */}
        <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-[28px] p-6 sm:p-7 shadow-elevated border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                Página Pública de Agendamento Online Ativa
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white">
              Agendamento Online 24h para seus Clientes
            </h2>
            <p className="text-xs text-zinc-400 max-w-xl">
              Seus clientes escolhem o corte, o barbeiro favorito, o dia e o horário direto pelo celular. Sem fila de espera.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-300 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 select-all">
                /{slug}/agendar
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto">
            <Button
              size="sm"
              onClick={copyBookingLink}
              className="h-10 px-4 text-xs font-bold bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-700" />
              <span>Copiar Link do WhatsApp</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/${slug}/agendar`, '_blank')}
              className="h-10 px-4 text-xs font-bold text-white border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Testar Agendamento</span>
            </Button>
          </div>
        </div>

        {/* ─── 1.1 Barra de Atalhos Rápidos da Barbearia ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => navigate(`${base}/appointments`)}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-900 leading-tight">Agenda de Hoje</p>
              <p className="text-[10px] text-zinc-400 truncate">14 agendamentos</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate(`${base}/pos`)}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-900 leading-tight">Frente de Caixa</p>
              <p className="text-[10px] text-zinc-400 truncate">Cobrar corte / produto</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate(`${base}/barbers`)}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-900 leading-tight">Barbeiros</p>
              <p className="text-[10px] text-zinc-400 truncate">Comissões e metas</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate(`${base}/customers`)}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-900 leading-tight">Clientes CRM</p>
              <p className="text-[10px] text-zinc-400 truncate">Histórico e fidelidade</p>
            </div>
          </button>
        </div>

        {/* ─── 2. KPIs Operacionais da Barbearia ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Faturamento do Dia */}
          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/50 space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between text-[#6c757d]">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Faturamento Hoje</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
                R$ 1.840,00
              </span>
              <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium">
                Mês: <strong className="text-zinc-700">R$ 24,6k</strong>
              </span>
            </div>
            <div className="pt-0.5 sm:pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                <ArrowUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5]" />
                <span>+18.4%</span>
              </span>
            </div>
          </div>

          {/* Agendamentos de Hoje */}
          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/50 space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between text-[#6c757d]">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Agendamentos</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
                14 horários
              </span>
              <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium">
                4 restantes hoje
              </span>
            </div>
            <div className="pt-0.5 sm:pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                <span>92% taxa ocupação</span>
              </span>
            </div>
          </div>

          {/* Clientes Atendidos */}
          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/50 space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between text-[#6c757d]">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Atendidos</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
                10 cortes
              </span>
              <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium">
                0 faltas hoje
              </span>
            </div>
            <div className="pt-0.5 sm:pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>100% pontual</span>
              </span>
            </div>
          </div>

          {/* Ticket Médio */}
          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/50 space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between text-[#6c757d]">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Ticket Médio</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
                R$ 68,50
              </span>
              <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium">
                Combos + Pomadas
              </span>
            </div>
            <div className="pt-0.5 sm:pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">
                <ArrowUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5]" />
                <span>+12.1% ticket</span>
              </span>
            </div>
          </div>
        </div>

        {/* ─── 3. Próximos Horários de Hoje & Serviços Mais Vendidos ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Próximos Horários (2 Colunas) */}
          <div className="lg:col-span-2 bg-white rounded-[28px] p-5 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/50 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900">
                  Próximos Horários de Hoje
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Fila de atendimento em tempo real na barbearia
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`${base}/appointments`)}
                className="text-xs font-bold text-zinc-600 hover:text-zinc-900 rounded-xl"
              >
                <span>Ver Agenda Completa</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <div className="divide-y divide-zinc-100">
              {[
                {
                  time: '14:00',
                  customer: 'Matheus Ribeiro',
                  phone: '(11) 98765-4321',
                  service: 'Corte Degradê Navalhado',
                  barber: 'Lucas Silva',
                  price: 'R$ 50,00',
                  status: 'EM ATENDIMENTO',
                  statusColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                },
                {
                  time: '14:45',
                  customer: 'Felipe Camargo',
                  phone: '(11) 97654-3210',
                  service: 'Barboterapia com Toalha Quente',
                  barber: 'Marcos Vinicius',
                  price: 'R$ 45,00',
                  status: 'CONFIRMADO',
                  statusColor: 'bg-blue-100 text-blue-800 border-blue-200',
                },
                {
                  time: '15:30',
                  customer: 'Gabriel Souza',
                  phone: '(11) 96543-2109',
                  service: 'Combo Cabelo + Barba + Sobrancelha',
                  barber: 'Lucas Silva',
                  price: 'R$ 85,00',
                  status: 'CONFIRMADO',
                  statusColor: 'bg-blue-100 text-blue-800 border-blue-200',
                },
                {
                  time: '16:15',
                  customer: 'Thiago Mendes',
                  phone: '(11) 95432-1098',
                  service: 'Corte Social na Tesoura',
                  barber: 'André Oliveira',
                  price: 'R$ 40,00',
                  status: 'AGUARDANDO',
                  statusColor: 'bg-amber-100 text-amber-800 border-amber-200',
                },
                {
                  time: '17:00',
                  customer: 'Rodrigo Dias',
                  phone: '(11) 94321-0987',
                  service: 'Pigmentação de Barba & Alinhamento',
                  barber: 'Marcos Vinicius',
                  price: 'R$ 60,00',
                  status: 'CONFIRMADO',
                  statusColor: 'bg-blue-100 text-blue-800 border-blue-200',
                },
              ].map((apt, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-100 font-mono font-black text-zinc-900 flex items-center justify-center shrink-0 border border-zinc-200/60">
                      {apt.time}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="font-extrabold text-zinc-900 truncate">
                          {apt.customer}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 sm:px-2 py-0.5 rounded-md border ${apt.statusColor}`}>
                          {apt.status}
                        </span>
                      </div>
                      <p className="text-zinc-500 truncate mt-0.5">
                        {apt.service} · <strong className="text-zinc-700">Barbeiro: {apt.barber}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="font-mono font-extrabold text-sm text-zinc-900 block">
                        {apt.price}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {apt.phone}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const cleanPhone = apt.phone.replace(/\D/g, '');
                        const text = encodeURIComponent(
                          `Olá ${apt.customer}! 💈 Confirmando seu corte de ${apt.service} hoje às ${apt.time} na barbearia.`
                        );
                        window.open(`https://wa.me/55${cleanPhone}?text=${text}`, '_blank');
                      }}
                      className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition active:scale-95 shrink-0 cursor-pointer"
                      title="Chamar no WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => navigate(`${base}/appointments`)}
                className="h-10 flex-1 bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 text-white rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                + Novo Agendamento no Balcão
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`${base}/pos`)}
                className="h-10 px-4 text-xs font-bold bg-white hover:bg-zinc-50 border border-zinc-200/90 text-zinc-700 rounded-xl shadow-2xs hover:shadow-xs cursor-pointer transition-all"
              >
                Abrir Frente de Caixa
              </Button>
            </div>
          </div>

          {/* Barbeiros & Comissões (1 Coluna) */}
          <div className="bg-white rounded-[28px] p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/50 space-y-5">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900">
                Barbeiros em Destaque
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Faturamento e comissões do mês
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  name: 'Lucas Silva',
                  role: 'Master Barber',
                  cuts: 78,
                  revenue: 'R$ 5.240,00',
                  commission: 'R$ 2.620,00',
                  pct: '50%',
                  avatar: 'LS',
                },
                {
                  name: 'Marcos Vinicius',
                  role: 'Barbeiro & Barboterapia',
                  cuts: 64,
                  revenue: 'R$ 4.180,00',
                  commission: 'R$ 2.090,00',
                  pct: '50%',
                  avatar: 'MV',
                },
                {
                  name: 'André Oliveira',
                  role: 'Barbeiro Clássico',
                  cuts: 52,
                  revenue: 'R$ 3.320,00',
                  commission: 'R$ 1.660,00',
                  pct: '50%',
                  avatar: 'AO',
                },
              ].map((barber, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-zinc-50/80 border border-zinc-200/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                        {barber.avatar}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-900 leading-tight">
                          {barber.name}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          {barber.role} · {barber.cuts} cortes
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold text-xs shadow-2xs">
                      {barber.pct}
                    </span>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs border-t border-zinc-200/50">
                    <span className="text-[11px] text-zinc-500">Faturamento: <strong className="text-zinc-800">{barber.revenue}</strong></span>
                    <span className="text-[11px] text-emerald-700 font-bold">Comissão: {barber.commission}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`${base}/barbers`)}
                className="w-full h-10 text-xs font-bold bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 rounded-xl shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
              >
                <Users className="w-3.5 h-3.5 text-zinc-500" />
                <span>Ver Equipe & Comissões</span>
              </Button>
            </div>
          </div>
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
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-[#e8f9ef] text-[#1db869]">
                <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                <span>36.8%</span>
                <span className="font-normal text-zinc-500 ml-1">vs last year</span>
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
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-[#ffeaeb] text-[#f43f5e]">
                <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                <span>36.8%</span>
                <span className="font-normal text-zinc-400 ml-1">vs last year</span>
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
                        {new Date(order.createdAt).toLocaleTimeString([], {
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
                    $ {(order.totalCents / 100).toFixed(2)}
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

