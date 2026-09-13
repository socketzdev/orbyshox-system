import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { io, Socket } from 'socket.io-client';
import {
  BellRing,
  Receipt,
  Users,
  CheckCircle2,
  UtensilsCrossed,
  Plus,
  Flame,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';

const playWaiterChime = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5
    osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.15); // E6
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch {}
};

export const WaiterHubPage: React.FC = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const companyId = tenant?.id;

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Buscar mesas
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['waiter-tables', companyId],
    queryFn: () => apiGet('/restaurant/tables'),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  // Mutação para atender chamado
  const answerCallMutation = useMutation({
    mutationFn: (callId: string) => apiPost(`/restaurant/waiter-calls/${callId}/answer`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      toast.success('Chamado atendido com sucesso!');
    },
  });

  // Mutação para encerrar comanda e liberar mesa
  const closeSessionMutation = useMutation({
    mutationFn: (tableId: string) => apiPost(`/restaurant/tables/${tableId}/close-session`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      toast.success('Comanda encerrada e mesa liberada para novos clientes!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao encerrar comanda'),
  });

  // WebSocket em tempo real para o Garçom
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

    socket.on('waiter:call', (call: any) => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      if (soundEnabled) playWaiterChime();
      const isBill = call.type === 'BILL';
      toast.error(
        isBill
          ? `🧾 ${call.table?.label || 'Mesa'} pediu a CONTA!`
          : `🔔 ${call.table?.label || 'Mesa'} chamou o GARÇOM!`,
        { duration: 8000 },
      );
    });

    socket.on('order:status_update', (order: any) => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      if (order.status === 'READY') {
        if (soundEnabled) playWaiterChime();
        toast.success(`🍽️ Pedido #${order.orderNumber} da ${order.table?.label} está PRONTO para servir!`, {
          duration: 7000,
        });
      }
    });

    socket.on('table:status_change', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [companyId, soundEnabled, queryClient]);

  const callingTables = tables.filter((t: any) => t.hasPendingCall);

  return (
    <div className="space-y-5 max-w-6xl mx-auto font-sans pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-zinc-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Painel do Garçom / Salão
            </h1>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-bold text-xs">
              Tempo Real
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Receba chamados de mesas, pedidos de conta e notificações de pratos prontos na cozinha.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="h-8 px-3 text-xs font-bold border-zinc-200 text-zinc-700 rounded-xl"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Som Ativado</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
              <span>Som Mudo</span>
            </>
          )}
        </Button>
      </div>

      {/* Alertas de Chamados Pendentes com Destaque */}
      {callingTables.length > 0 && (
        <div className="p-4 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-rose-600 animate-bounce" />
            <h2 className="text-sm font-black text-rose-900">
              Chamados de Mesa Urgentes ({callingTables.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {callingTables.map((t: any) => {
              const call = t.pendingCalls?.[0];
              const isBill = call?.type === 'BILL';
              return (
                <div
                  key={t.id}
                  className="p-3.5 bg-white rounded-2xl border border-rose-200 shadow-2xs flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="text-sm font-black text-zinc-900 block">{t.label}</span>
                    <Badge className={isBill ? 'bg-purple-600 text-white text-[10px]' : 'bg-rose-600 text-white text-[10px]'}>
                      {isBill ? 'Pediu a Conta' : 'Chamando Garçom'}
                    </Badge>
                  </div>

                  {call && (
                    <Button
                      size="sm"
                      onClick={() => answerCallMutation.mutate(call.id)}
                      className="h-8 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
                    >
                      Atender
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid de Mesas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map((table: any) => {
          const isOccupied = table.status === 'OCCUPIED';
          const hasCall = table.hasPendingCall;
          const billRequested = (table.pendingCalls || []).some((c: any) => c.type === 'BILL');

          let cardBg = 'bg-white border-zinc-200';
          if (hasCall) cardBg = 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-200';
          else if (billRequested) cardBg = 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-200';
          else if (isOccupied) cardBg = 'bg-amber-50/30 border-amber-200';

          return (
            <div
              key={table.id}
              className={`p-4 rounded-3xl border transition shadow-2xs flex flex-col justify-between ${cardBg}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black text-zinc-900">{table.label}</h3>
                    <span className="text-[11px] text-zinc-400 font-medium">
                      Capacidade: {table.capacity} pessoas
                    </span>
                  </div>

                  {hasCall ? (
                    <Badge className="bg-rose-600 text-white font-black text-[10px]">
                      Chamando
                    </Badge>
                  ) : isOccupied ? (
                    <Badge className="bg-amber-500 text-white font-black text-[10px]">
                      Ocupada
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-600 text-white font-black text-[10px]">
                      Livre
                    </Badge>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-100 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-zinc-500">
                    <span>Consumo da Mesa:</span>
                    <strong className="text-zinc-900 font-black">
                      {(table.sessionTotalCents / 100).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                    <span>Pedidos em aberto:</span>
                    <span className="font-bold text-zinc-800">{table.activeOrdersCount}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 mt-3 flex flex-col gap-1.5">
                {isOccupied ? (
                  <Button
                    size="sm"
                    onClick={() => closeSessionMutation.mutate(table.id)}
                    className="w-full h-8 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl cursor-pointer"
                  >
                    Fechar Comanda & Liberar
                  </Button>
                ) : (
                  <div className="text-center text-[11px] text-zinc-400 font-medium py-1">
                    Mesa pronta para receber clientes
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default WaiterHubPage;
