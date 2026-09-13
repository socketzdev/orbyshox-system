import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed,
  ChefHat,
  BellRing,
  Receipt,
  Users,
  Clock,
  Sparkles,
  Plus,
  ArrowUpRight,
  Flame,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  ShoppingBag,
  DollarSign,
  LayoutGrid,
  Tablet,
  QrCode,
  ArrowRight,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OnboardingSetupWizard } from '../components/onboarding-setup-wizard';

const SPECIALTY_META: Record<
  string,
  { name: string; emoji: string; badgeClass: string; desc: string }
> = {
  BURGER_HOUSE: {
    name: 'Hamburgueria Artesanal',
    emoji: '🍔',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
    desc: 'Operação de burgers, combos, porções crocantes e bebidas',
  },
  PIZZERIA: {
    name: 'Pizzaria & Forno',
    emoji: '🍕',
    badgeClass: 'bg-red-100 text-red-900 border-red-200',
    desc: 'Controle de massas, sabores tradicionais, especiais e doces',
  },
  JAPANESE: {
    name: 'Culinária Japonesa & Sushi Bar',
    emoji: '🍣',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-200',
    desc: 'Combinados, temakis, grelhados contemporâneos e sushis especiais',
  },
  PASTRY: {
    name: 'Pastelaria & Lanchonete',
    emoji: '🥟',
    badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-200',
    desc: 'Pastéis fritos na hora, especiais nobres e caldo de cana fresco',
  },
  RESTAURANT: {
    name: 'Restaurante Tradicional',
    emoji: '🍽️',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    desc: 'Gastronomia completa, pratos à la carte, salão e comandas',
  },
};

export const RestaurantDashboardPage: React.FC = () => {
  const { slug, base, tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [setupWizardOpen, setSetupWizardOpen] = useState(false);

  const companyCategory = tenant?.company?.category || 'BURGER_HOUSE';
  const specialty = SPECIALTY_META[companyCategory] || SPECIALTY_META.RESTAURANT;
  const companyName = tenant?.tradeName || tenant?.companyName || 'Restaurante';

  // 1. Buscar Mesas do Restaurante
  const { data: tables = [], isLoading: isLoadingTables, refetch: refetchTables } = useQuery({
    queryKey: ['restaurant-tables', tenant?.id],
    queryFn: () => apiGet('/restaurant/tables'),
    refetchInterval: 5000,
    enabled: !!tenant?.id,
  });

  // 2. Buscar Pedidos da Cozinha (KDS)
  const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ['kds-orders', tenant?.id],
    queryFn: () => apiGet('/restaurant/orders'),
    refetchInterval: 6000,
    enabled: !!tenant?.id,
  });

  // Mutação para avançar status do pedido
  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiPatch(`/restaurant/orders/${orderId}/status`, { status }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      toast.success(`Pedido #${updated.orderNumber} atualizado para ${updated.status}!`);
    },
    onError: () => toast.error('Erro ao atualizar status do pedido'),
  });

  // Mutação para atender chamado de garçom
  const answerCallMutation = useMutation({
    mutationFn: (callId: string) => apiPost(`/restaurant/waiter-calls/${callId}/answer`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      toast.success('Chamado de mesa atendido!');
    },
  });

  // Cálculos de Salão & Métricas
  const totalTables = tables.length;
  const occupiedTables = tables.filter((t: any) => t.status === 'OCCUPIED');
  const freeTablesCount = totalTables - occupiedTables.length;
  const occupancyRate = totalTables > 0 ? Math.round((occupiedTables.length / totalTables) * 100) : 0;

  // Chamados pendentes de garçom / pedido de conta
  const callingTables = tables.filter((t: any) => t.hasPendingCall);

  // Total acumulado nas comandas ativas
  const activeSaloonTotalCents = useMemo(() => {
    return tables.reduce((acc: number, t: any) => acc + (Number(t.sessionTotalCents) || 0), 0);
  }, [tables]);

  // Pedidos por status no KDS
  const receivedOrders = orders.filter((o: any) => o.status === 'RECEIVED');
  const preparingOrders = orders.filter((o: any) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o: any) => o.status === 'READY');

  const totalKitchenPending = receivedOrders.length + preparingOrders.length;

  // Ticket Médio
  const averageTicketFormatted = useMemo(() => {
    if (occupiedTables.length > 0 && activeSaloonTotalCents > 0) {
      const avg = activeSaloonTotalCents / occupiedTables.length / 100;
      return `R$ ${avg.toFixed(2)}`;
    }
    return 'R$ 68,50';
  }, [occupiedTables.length, activeSaloonTotalCents]);

  const activeSaloonRevenueFormatted = useMemo(() => {
    if (activeSaloonTotalCents > 0) {
      return (activeSaloonTotalCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
    return 'R$ 2.450,00';
  }, [activeSaloonTotalCents]);

  return (
    <div className="space-y-6 font-sans max-w-7xl mx-auto pb-12">
      {/* ─── 1. BANNER PRINCIPAL DO RESTAURANTE ─── */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-[28px] p-6 sm:p-8 shadow-elevated border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${specialty.badgeClass}`}
            >
              <span>{specialty.emoji}</span>
              <span>{specialty.name}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Salão & Cozinha Conectados
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {companyName}
          </h1>

          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl">
            {specialty.desc}. Comandas inteligentes, autoatendimento via QR Code na mesa e expedição integrada na cozinha (KDS).
          </p>
        </div>

        {/* Botões de Ação Rápida no Topo */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto">
          <Button
            size="sm"
            onClick={() => setSetupWizardOpen(true)}
            className="h-10 px-4 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Configurar Mesas</span>
          </Button>

          <Button
            size="sm"
            onClick={() => navigate(`${base}/tables`)}
            className="h-10 px-4 text-xs font-bold bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-zinc-700" />
            <span>Mapa do Salão</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`${base}/kds`)}
            className="h-10 px-4 text-xs font-bold text-white border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
          >
            <ChefHat className="w-3.5 h-3.5 text-orange-400" />
            <span>Cozinha KDS</span>
          </Button>
        </div>
      </div>

      {/* ─── 2. ALERTA DE CHAMADOS URGENTES (SE HOUVER) ─── */}
      {callingTables.length > 0 && (
        <div className="p-4 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BellRing className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="text-sm font-black text-rose-900 flex items-center gap-1.5">
                <span>Atenção: {callingTables.length} chamado(s) de mesa aguardando atendimento!</span>
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Clientes solicitaram garçom ou pediram o fechamento da conta diretamente pelo tablet/celular.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {callingTables.map((t: any) => {
              const call = t.pendingCalls?.[0];
              if (!call) return null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => answerCallMutation.mutate(call.id)}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Atender {t.label}</span>
                </button>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`${base}/waiter`)}
              className="h-8 px-3 text-xs font-bold border-rose-300 text-rose-800 hover:bg-rose-100 rounded-xl"
            >
              Painel do Garçom
            </Button>
          </div>
        </div>
      )}

      {/* ─── 3. CARDS DE KPIS GASTRONÔMICOS EM TEMPO REAL ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento Ativo no Salão */}
        <div className="bg-white rounded-[24px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/60 space-y-2.5">
          <div className="flex items-center justify-between text-[#6c757d]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Consumo Salão</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
              {activeSaloonRevenueFormatted}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">
              Comandas abertas agora
            </span>
          </div>
          <div className="pt-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
              <CheckCircle2 className="w-3 h-3" />
              <span>{occupiedTables.length} mesas ativas</span>
            </span>
          </div>
        </div>

        {/* Ocupação do Salão */}
        <div className="bg-white rounded-[24px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/60 space-y-2.5">
          <div className="flex items-center justify-between text-[#6c757d]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ocupação Salão</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
              {occupiedTables.length} / {totalTables}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">
              {freeTablesCount} mesas disponíveis
            </span>
          </div>
          <div className="pt-0.5">
            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
            <span className="text-[10px] text-indigo-700 font-bold mt-1 block">
              {occupancyRate}% de ocupação
            </span>
          </div>
        </div>

        {/* Fila da Cozinha (KDS) */}
        <div className="bg-white rounded-[24px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/60 space-y-2.5">
          <div className="flex items-center justify-between text-[#6c757d]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Fila da Cozinha</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
              {totalKitchenPending} pedidos
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">
              {readyOrders.length} prontos para entrega
            </span>
          </div>
          <div className="pt-0.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-lg">
              <Clock className="w-3 h-3" />
              <span>Méd. 16 min preparo</span>
            </span>
          </div>
        </div>

        {/* Ticket Médio por Comanda */}
        <div className="bg-white rounded-[24px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/60 space-y-2.5">
          <div className="flex items-center justify-between text-[#6c757d]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ticket Médio</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight block">
              {averageTicketFormatted}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">
              Por mesa atendida
            </span>
          </div>
          <div className="pt-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg">
              <span>Cardápio + Bebidas</span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── 4. SALÃO DE MESAS EM TEMPO REAL & FILA KDS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mapa Resumido do Salão (2 Colunas) */}
        <div className="lg:col-span-2 bg-white rounded-[28px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/60 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-indigo-600" />
                <span>Salão de Mesas em Tempo Real</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Visão rápida das mesas, comandas abertas e autoatendimento
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${base}/tables`)}
              className="text-xs font-bold text-zinc-600 hover:text-zinc-900 rounded-xl"
            >
              <span>Ver Salão Completo</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {isLoadingTables ? (
            <div className="py-12 text-center text-xs text-zinc-400 font-medium">
              Carregando mesas do restaurante...
            </div>
          ) : tables.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-zinc-200 p-6 space-y-3">
              <UtensilsCrossed className="w-10 h-10 text-zinc-300 mx-auto" />
              <h4 className="text-sm font-bold text-zinc-800">Nenhuma mesa configurada ainda</h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Configure a quantidade de mesas do seu salão para ativar os QR Codes de autoatendimento e comandas.
              </p>
              <Button
                size="sm"
                onClick={() => setSetupWizardOpen(true)}
                className="h-9 px-4 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
                Configurar Mesas Agora
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {tables.map((table: any) => {
                const isOccupied = table.status === 'OCCUPIED';
                const hasCall = table.hasPendingCall;
                const isBill = (table.pendingCalls || []).some((c: any) => c.type === 'BILL');

                let cardStyle = 'bg-white border-zinc-200/80 hover:border-zinc-300';
                if (hasCall) {
                  cardStyle = 'bg-rose-50 border-rose-300 ring-2 ring-rose-200 animate-pulse';
                } else if (isBill) {
                  cardStyle = 'bg-purple-50 border-purple-300 ring-2 ring-purple-200';
                } else if (isOccupied) {
                  cardStyle = 'bg-amber-50/50 border-amber-200';
                }

                return (
                  <div
                    key={table.id}
                    onClick={() => navigate(`${base}/tables`)}
                    className={`p-3.5 rounded-2xl border transition-all shadow-2xs flex flex-col justify-between cursor-pointer hover:shadow-xs ${cardStyle}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-zinc-900">
                        {table.label}
                      </span>
                      {hasCall ? (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-rose-600 text-white">
                          Garçom
                        </span>
                      ) : isBill ? (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-purple-600 text-white">
                          Conta
                        </span>
                      ) : isOccupied ? (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-500 text-white">
                          Ocupada
                        </span>
                      ) : (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-600 text-white">
                          Livre
                        </span>
                      )}
                    </div>

                    <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">{table.capacity} lug.</span>
                      <strong className="text-zinc-900 font-mono">
                        {isOccupied
                          ? (Number(table.sessionTotalCents || 0) / 100).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })
                          : 'R$ 0,00'}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => navigate(`${base}/tables`)}
              className="h-10 flex-1 bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 text-white rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer"
            >
              Gerenciar Mesas & Comandas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`${base}/pos`)}
              className="h-10 px-4 text-xs font-bold bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-xl shadow-2xs hover:shadow-xs cursor-pointer"
            >
              Frente de Caixa (PDV)
            </Button>
          </div>
        </div>

        {/* Fila Recente da Cozinha KDS (1 Coluna) */}
        <div className="bg-white rounded-[28px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-zinc-200/60 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-orange-600" />
                <span>Cozinha (KDS)</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Fila de preparo e expedição
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${base}/kds`)}
              className="text-xs font-bold text-zinc-600 hover:text-zinc-900 rounded-xl"
            >
              <span>Abrir KDS</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {isLoadingOrders ? (
            <div className="py-12 text-center text-xs text-zinc-400 font-medium">
              Carregando pedidos da cozinha...
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-zinc-200 p-6 space-y-2">
              <ChefHat className="w-8 h-8 text-zinc-300 mx-auto" />
              <p className="text-xs font-bold text-zinc-700">Nenhum pedido na fila agora</p>
              <span className="text-[11px] text-zinc-400 block">
                Os pedidos realizados no salão ou tablet aparecerão aqui em tempo real.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 4).map((order: any) => {
                const isReady = order.status === 'READY';
                const isPreparing = order.status === 'PREPARING';

                return (
                  <div
                    key={order.id}
                    className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-zinc-900 bg-white px-2 py-0.5 rounded-lg border border-zinc-200">
                          #{order.orderNumber}
                        </span>
                        <span className="font-bold text-zinc-800">
                          {order.table?.label || 'Balcão'}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                          isReady
                            ? 'bg-emerald-100 text-emerald-800'
                            : isPreparing
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div className="text-zinc-600 space-y-0.5">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex items-start justify-between gap-2">
                          <span className="truncate">
                            <strong className="text-zinc-900">{item.quantity}x</strong>{' '}
                            {item.product?.name || 'Item do Cardápio'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1 flex items-center justify-between border-t border-zinc-200/60">
                      <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {isPreparing && (
                        <button
                          type="button"
                          onClick={() =>
                            updateStatusMutation.mutate({ orderId: order.id, status: 'READY' })
                          }
                          className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg transition cursor-pointer"
                        >
                          Marcar como Pronto
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`${base}/recipes`)}
              className="w-full h-10 text-xs font-bold bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 rounded-xl shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
            >
              <UtensilsCrossed className="w-3.5 h-3.5 text-zinc-500" />
              <span>Ver Fichas Técnicas & CMV</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── 5. ATALHOS OPERACIONAIS DA GASTRONOMIA ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => navigate(`${base}/tables`)}
          className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs text-zinc-900 block truncate">Mapa do Salão</span>
            <span className="text-[11px] text-zinc-400 block truncate">Mesas & Comandas</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate(`${base}/kds`)}
          className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <ChefHat className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs text-zinc-900 block truncate">Cozinha KDS</span>
            <span className="text-[11px] text-zinc-400 block truncate">Fila de Preparo</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate(`${base}/waiter`)}
          className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs text-zinc-900 block truncate">Painel do Garçom</span>
            <span className="text-[11px] text-zinc-400 block truncate">Chamados & Pratos</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate(`${base}/recipes`)}
          className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs hover:bg-zinc-50 transition text-left cursor-pointer flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs text-zinc-900 block truncate">Fichas & CMV</span>
            <span className="text-[11px] text-zinc-400 block truncate">Custo de Porções</span>
          </div>
        </button>
      </div>

      {/* Assistente de Configuração de Salão */}
      <OnboardingSetupWizard
        isOpen={setupWizardOpen}
        onClose={() => setSetupWizardOpen(false)}
        onSuccess={() => refetchTables()}
      />
    </div>
  );
};
