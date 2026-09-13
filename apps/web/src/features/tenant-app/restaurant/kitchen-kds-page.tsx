import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { io, Socket } from 'socket.io-client';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  ArrowRight,
  Volume2,
  VolumeX,
  Sparkles,
  Utensils,
  BellRing,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Emite som sonoro de cozinha usando Web Audio API nativo (zero dependências externas).
 */
const playKitchenChime = (type: 'new_order' | 'status_change') => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'new_order') {
      // Tom agudo duplo de campainha de comanda de restaurante
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.12); // E6
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch (err) {
    // AudioContext pode exigir interação do usuário inicial
  }
};

export const KitchenKdsPage: React.FC = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const companyId = tenant?.id;

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Buscar todos os pedidos ativos do restaurante
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['kds-orders', companyId],
    queryFn: () => apiGet('/restaurant/orders'),
    enabled: !!companyId,
    refetchInterval: 6000,
  });

  // Mutação para avançar status do pedido
  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiPatch(`/restaurant/orders/${orderId}/status`, { status }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      if (soundEnabled) playKitchenChime('status_change');
      toast.success(`Pedido #${updated.orderNumber} atualizado para ${updated.status}!`);
    },
    onError: () => toast.error('Erro ao atualizar status do pedido'),
  });

  // Conectar ao WebSocket Gateway do Restaurante em tempo real
  useEffect(() => {
    if (!companyId) return;

    const socketUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:3001/restaurant'
      : '/restaurant';

    const socket: Socket = io(socketUrl, {
      auth: { companyId },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('join_restaurant', { companyId });
    });

    socket.on('order:new', (newOrder: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      if (soundEnabled) playKitchenChime('new_order');
      toast.success(`🔔 NOVO PEDIDO #${newOrder.orderNumber} (${newOrder.table?.label || 'Mesa'})!`, {
        duration: 6000,
      });
    });

    socket.on('order:status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [companyId, soundEnabled, queryClient]);

  // Colunas Kanban
  const pendingOrders = useMemo(
    () => orders.filter((o: any) => o.status === 'PENDING'),
    [orders],
  );
  const preparingOrders = useMemo(
    () => orders.filter((o: any) => o.status === 'PREPARING'),
    [orders],
  );
  const readyOrders = useMemo(
    () => orders.filter((o: any) => o.status === 'READY'),
    [orders],
  );

  const formatElapsed = (createdAt: string) => {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diffMs / 60000);
    return `${mins} min`;
  };

  return (
    <div className="min-h-[85vh] flex flex-col space-y-5 font-sans">
      {/* Top Banner do KDS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 text-white p-4 sm:p-5 rounded-3xl border border-zinc-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white">KDS — Painel da Cozinha</h1>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] font-bold">
                Ao Vivo
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              Pedidos transmitidos em tempo real direto dos tablets e QR Codes das mesas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-8 px-3 text-xs font-bold border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Alerta Sonoro Ativo</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                <span>Som Desativado</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Kanban com 3 Colunas de Alta Visibilidade */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
        {/* ─── Coluna 1: NOVOS PEDIDOS (Amarelo) ─── */}
        <div className="flex flex-col bg-zinc-900/60 rounded-3xl border border-amber-500/30 overflow-hidden shadow-sm">
          <div className="p-3.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <h2 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                Novos Pedidos
              </h2>
            </div>
            <Badge className="bg-amber-500 text-zinc-950 font-black text-xs px-2 py-0.5">
              {pendingOrders.length}
            </Badge>
          </div>

          <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[72vh]">
            {pendingOrders.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-xs font-medium">
                Nenhum novo pedido na fila.
              </div>
            ) : (
              pendingOrders.map((order: any) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-zinc-900 border border-amber-500/40 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2.5">
                    <div>
                      <span className="text-base font-black text-white block">
                        {order.table?.label || 'Mesa'}
                      </span>
                      <span className="text-[11px] font-bold text-amber-400">
                        Pedido #{order.orderNumber}
                      </span>
                    </div>

                    <span className="text-[11px] text-zinc-400 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-400" />
                      {formatElapsed(order.createdAt)}
                    </span>
                  </div>

                  {/* Itens do Pedido */}
                  <div className="space-y-2 text-xs">
                    {(order.items || []).map((item: any) => (
                      <div key={item.id} className="p-2 rounded-xl bg-zinc-800/70">
                        <div className="font-black text-white text-sm">
                          {item.quantity}x {item.product?.name}
                        </div>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-[11px] text-amber-300 font-bold mt-0.5">
                            + {item.modifiers.map((m: any) => m.name).join(', ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] text-rose-400 italic mt-0.5">
                            Obs: {item.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Botão de Avanço */}
                  <Button
                    onClick={() =>
                      updateStatusMutation.mutate({ orderId: order.id, status: 'PREPARING' })
                    }
                    className="w-full h-9 text-xs font-black text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Flame className="w-4 h-4 text-zinc-950" />
                    INICIAR PREPARO
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── Coluna 2: EM PREPARO (Azul) ─── */}
        <div className="flex flex-col bg-zinc-900/60 rounded-3xl border border-indigo-500/30 overflow-hidden shadow-sm">
          <div className="p-3.5 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <h2 className="text-xs font-black text-indigo-400 uppercase tracking-wider">
                Em Preparo
              </h2>
            </div>
            <Badge className="bg-indigo-600 text-white font-black text-xs px-2 py-0.5">
              {preparingOrders.length}
            </Badge>
          </div>

          <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[72vh]">
            {preparingOrders.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-xs font-medium">
                Nenhum prato sendo preparado no momento.
              </div>
            ) : (
              preparingOrders.map((order: any) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-zinc-900 border border-indigo-500/40 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2.5">
                    <div>
                      <span className="text-base font-black text-white block">
                        {order.table?.label || 'Mesa'}
                      </span>
                      <span className="text-[11px] font-bold text-indigo-400">
                        Pedido #{order.orderNumber}
                      </span>
                    </div>

                    <span className="text-[11px] text-zinc-400 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      {formatElapsed(order.createdAt)}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {(order.items || []).map((item: any) => (
                      <div key={item.id} className="p-2 rounded-xl bg-zinc-800/70">
                        <div className="font-black text-white text-sm">
                          {item.quantity}x {item.product?.name}
                        </div>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-[11px] text-indigo-300 font-bold mt-0.5">
                            + {item.modifiers.map((m: any) => m.name).join(', ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] text-rose-400 italic mt-0.5">
                            Obs: {item.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() =>
                      updateStatusMutation.mutate({ orderId: order.id, status: 'READY' })
                    }
                    className="w-full h-9 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    MARCAR COMO PRONTO
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── Coluna 3: PRONTOS PARA SERVIR (Verde) ─── */}
        <div className="flex flex-col bg-zinc-900/60 rounded-3xl border border-emerald-500/30 overflow-hidden shadow-sm">
          <div className="p-3.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h2 className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                Prontos (Aguardando Garçom)
              </h2>
            </div>
            <Badge className="bg-emerald-600 text-white font-black text-xs px-2 py-0.5">
              {readyOrders.length}
            </Badge>
          </div>

          <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[72vh]">
            {readyOrders.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-xs font-medium">
                Nenhum pedido pronto aguardando entrega.
              </div>
            ) : (
              readyOrders.map((order: any) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-zinc-900 border border-emerald-500/40 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2.5">
                    <div>
                      <span className="text-base font-black text-white block">
                        {order.table?.label || 'Mesa'}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-400">
                        Pedido #{order.orderNumber}
                      </span>
                    </div>

                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] font-bold">
                      Pronto!
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-300">
                    {(order.items || []).map((item: any) => (
                      <div key={item.id} className="font-bold">
                        {item.quantity}x {item.product?.name}
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() =>
                      updateStatusMutation.mutate({ orderId: order.id, status: 'DELIVERED' })
                    }
                    className="w-full h-9 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    ENTREGUE NA MESA
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default KitchenKdsPage;
