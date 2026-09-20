import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { qrToSvg } from '@/lib/qr-code';
import { useTenant } from '../context/tenant-context';
import {
  buildLaunchSelection,
  launchTotalCents,
  setLaunchQty as setLaunchQtyPure,
  toLaunchPayload,
} from './launch-selection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  LayoutGrid,
  Plus,
  QrCode,
  Tablet,
  ExternalLink,
  CheckCircle2,
  BellRing,
  Receipt,
  Copy,
  Printer,
  RotateCcw,
  Sparkles,
  UtensilsCrossed,
  Clock,
  ArrowRight,
  ChevronRight,
  Filter,
  DollarSign,
  AlertTriangle,
  ArrowLeft,
  MoreVertical,
  X,
  Users,
  ArrowRightLeft,
  DoorOpen,
  Split,
  Trash2,
  Edit3,
  Search,
  Minus,
  Check,
  Pencil,
  ShoppingCart,
  Volume2,
  VolumeX,
  CreditCard,
  Banknote,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import { OnboardingSetupWizard } from '../components/onboarding-setup-wizard';
import { CreateFoodProductDialog } from '../components/create-food-product-dialog';
import { ReceiptDialog } from '../components/receipt-dialog';

/**
 * Alerta sonoro de chamado de mesa.
 *
 * Veio do antigo `waiter-hub-page.tsx`, que foi removido por ser duplicado
 * deste mapa. O som era a ÚNICA coisa que só ele tinha: o mapa já atualiza
 * sozinho por polling (3-5s), mas sem aviso audível o garçom em salão só
 * percebe o chamado se estiver olhando a tela.
 */
const playWaiterChime = (urgent = false) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const repeats = urgent ? 3 : 1;
    for (let i = 0; i < repeats; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.35;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, t); // B5
      osc.frequency.setValueAtTime(1318.51, t + 0.15); // E6
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    }
  } catch {}
};

/** Vibra o celular (quando o aparelho permite) — o garçom sente no bolso. */
const vibratePhone = (pattern: number | number[]) => {
  try {
    (navigator as any)?.vibrate?.(pattern);
  } catch {}
};

/** Garçom responsável pelo pedido: nome próprio ou herdado da comanda. */
const orderWaiterName = (order: any): string | null =>
  (order?.waiterName || order?.tableSession?.waiterName || null) as string | null;

/** Id do responsável (vínculo confiável — nome pode repetir entre garçons). */
const orderWaiterId = (order: any): string | null =>
  (order?.waiterId || order?.tableSession?.waiterId || null) as string | null;

/**
 * Decide se o pedido é MEU (deve apitar forte + vibrar neste celular).
 *
 * Ordem de confiança: 1) ID igual ao meu → meu; 2) pedido tem dono com ID
 * diferente do meu → NÃO é meu (mesmo que o nome coincida); 3) sem ID,
 * compara o nome; 4) sem dono nenhum → trata como meu (melhor apitar do que
 * o prato esfriar sem ninguém saber).
 */
const isMyOrder = (order: any, me: { id?: string; name?: string | null }): boolean => {
  const ownerId = orderWaiterId(order);
  const myId = (me?.id || '').trim();
  if (ownerId && myId) return ownerId === myId;
  if (ownerId && !myId) return false;
  const owner = (orderWaiterName(order) || '').trim().toLowerCase();
  const myName = (me?.name || '').trim().toLowerCase();
  if (owner && myName) return owner === myName;
  return true;
};

const QUICK_OBSERVATIONS = [
  'Sem cebola',
  'Carne bem passada',
  'Carne ao ponto',
  'Carne mal passada',
  'Sem gelo',
  'Gelo e limão',
  'Sem pimenta',
  'Molho à parte',
  'Pouco sal',
  'Sem tomate',
  'Caprichado',
];

export const RestaurantTablesPage: React.FC = () => {
  const { tenant, isWaiter, currentUser } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Modals state
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [createFoodOpen, setCreateFoodOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');

  // Modal de abertura de mesa: pede o nome da comanda antes de ocupar a mesa.
  const [openComandaTable, setOpenComandaTable] = useState<any | null>(null);
  const [comandaName, setComandaName] = useState('');
  const [comandaNameError, setComandaNameError] = useState<string | null>(null);

  // Recibo exibido ao fechar a comanda (conta devolvida pelo backend).
  const [closedReceipt, setClosedReceipt] = useState<any>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // ─── Fechamento com forma de pagamento ───
  // Fluxo exigido: FECHAR CONTA -> confirmação -> modal forma de pagamento
  // (Cartão Crédito/Débito, PIX com QR automático, Dinheiro) -> confirmação
  // "já está pago?" -> recibo/impressão.
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'DINHEIRO'>('PIX');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  // 10% (caixinha separado): escolha + valor pago + canal. O status final é
  // derivado no backend a partir dos valores.
  const [tipChoice, setTipChoice] = useState<'NONE' | 'PAID' | 'OVER' | 'UNDER'>('PAID');
  const [tipPaid, setTipPaid] = useState('');
  const [tipMethod, setTipMethod] = useState<string>('PIX');

  // Selected table bottom sheet state
  // Trava síncrona anti-duplo-toque no Confirmar: o `isPending` só desabilita
  // o botão após o re-render — dois toques rápidos no celular passavam e
  // geravam 2 POSTs (item duplicado na comanda). Ref vira na hora.
  const launchingRef = useRef(false);

  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [sheetView, setSheetView] = useState<'MAIN' | 'ADD_ITEM' | 'CUSTOMIZE_ITEM' | 'TRANSFER' | 'DIVIDE' | 'EDIT_TABLE'>('MAIN');
  const [tableCapacity, setTableCapacity] = useState<number>(4);
  const [menuSearch, setMenuSearch] = useState('');
  // Atalho de categoria no lançamento ('ALL' = todas). Ex.: Bebidas,
  // Sobremesas, Batatas — as categorias vêm do Cardápio, onde são criadas.
  const [menuCategory, setMenuCategory] = useState<string>('ALL');
  const [splitPeople, setSplitPeople] = useState<number>(2);
  const [editTableNumber, setEditTableNumber] = useState('');
  const [editTableLabel, setEditTableLabel] = useState('');
  const [addedItemFeedback, setAddedItemFeedback] = useState<string | null>(null);

  // Customizing product state (Ponto da Carne, molhos, opcionais)
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [customizingNotes, setCustomizingNotes] = useState('');
  // Quantidade escolhida na tela de personalização (antes era fixo em 1)
  const [customizingQuantity, setCustomizingQuantity] = useState(1);

  // ─── Multi-seleção para lançamento em lote ───
  // O garçom anota vários itens de uma vez (a mesa toda pede junto) e lança
  // tudo num só passo, com uma única confirmação.
  // Mapa productId -> quantidade. Ausente = não selecionado.
  const [selectedLaunchItems, setSelectedLaunchItems] = useState<Record<string, number>>({});
  const [isBatchLaunchOpen, setIsBatchLaunchOpen] = useState(false);

  // ─── Edição / remoção de item já lançado ───
  const [editingItem, setEditingItem] = useState<{
    orderId: string;
    itemId: string;
    name: string;
    quantity: number;
  } | null>(null);
  const [editingQuantity, setEditingQuantity] = useState(1);
  const [removingItem, setRemovingItem] = useState<{
    orderId: string;
    itemId: string;
    name: string;
  } | null>(null);

  // Modal exclusivo de configurações & gerenciamento de mesas (apenas aqui pode excluir mesas)
  const [manageTablesOpen, setManageTablesOpen] = useState(false);

  // Status filter ('ALL' | 'FREE' | 'OCCUPIED' | 'CALLING')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FREE' | 'OCCUPIED' | 'CALLING'>('ALL');

  const [qrModalTable, setQrModalTable] = useState<any | null>(null);
  const [pairedDeviceData, setPairedDeviceData] = useState<{
    deviceId: string;
    deviceToken: string;
    tableName: string;
    tabletUrl: string;
  } | null>(null);

  // Buscar mesas em tempo real
  const { data: tables = [], isLoading, refetch } = useQuery({
    queryKey: ['restaurant-tables', tenant?.id],
    queryFn: () => apiGet('/restaurant/tables'),
    refetchInterval: 5000, // polling suave a cada 5s para refletir novos chamados/pedidos
    enabled: !!tenant?.id,
  });

  // Consulta da comanda em tempo real da mesa selecionada
  const { data: sessionData, isLoading: isLoadingSession } = useQuery({
    queryKey: ['table-session', selectedTable?.id],
    queryFn: () => apiGet(`/restaurant/tables/${selectedTable?.id}/session`),
    enabled: !!selectedTable?.id,
    refetchInterval: 3000,
  });

  // Consulta o cardápio da empresa para 'Adicionar Item'
  const { data: restaurantMenu = [] } = useQuery({
    queryKey: ['restaurant-menu', tenant?.id],
    queryFn: () => apiGet('/restaurant/menu'),
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Total atual da comanda selecionada (usado nos modais de confirmação/pagamento).
  const currentTotalCents = Number(
    (sessionData as any)?.session?.totalCents ?? (selectedTable as any)?.sessionTotalCents ?? 0,
  );

  // Taxa dos 10% (configurável na área Caixa 10%; 1000 = 10%).
  const { data: tipRateData } = useQuery({
    queryKey: ['tip-rate'],
    queryFn: () => apiGet('/restaurant/tips/rate'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const tipPercentBps = Number(tipRateData?.percentBps) > 0 ? Number(tipRateData.percentBps) : 1000;
  const tipSuggestedCents = Math.round((currentTotalCents * tipPercentBps) / 10000);
  const fmtCentsInput = (cents: number) =>
    cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '';

  // Cobrança PIX automática: busca o BR Code com o valor exato da comanda.
  // Só dispara quando o modal de pagamento está aberto e PIX selecionado.
  const {
    data: pixCharge,
    isLoading: isLoadingPix,
    isError: isPixError,
    refetch: refetchPix,
  } = useQuery({
    queryKey: ['table-pix-charge', selectedTable?.id, currentTotalCents],
    queryFn: () => apiGet(`/restaurant/tables/${selectedTable?.id}/pix-charge`),
    enabled: !!selectedTable?.id && paymentModalOpen && paymentMethod === 'PIX',
    staleTime: 30_000,
    retry: 1,
  });

  /**
   * Itens marcados para lançamento em lote, já resolvidos para produto + quantidade.
   * A regra vive em `launch-selection.ts` (pura e testada) — aqui só é aplicada.
   * A obs de cada item viaja junto (`selectedLaunchNotes`).
   */
  const [selectedLaunchNotes, setSelectedLaunchNotes] = useState<Record<string, string>>({});
  const launchSelection = useMemo(
    () => buildLaunchSelection(selectedLaunchItems, restaurantMenu as any[], selectedLaunchNotes),
    [selectedLaunchItems, selectedLaunchNotes, restaurantMenu],
  );

  /** Soma do lote selecionado, em centavos. */
  const launchSelectionTotal = useMemo(() => launchTotalCents(launchSelection), [launchSelection]);

  /** Marca/ajusta a quantidade de um produto no lote. qty <= 0 remove. */
  const setLaunchQty = (productId: string, qty: number) => {
    setSelectedLaunchItems((prev) => setLaunchQtyPure(prev, productId, qty));
    if (qty <= 0) {
      setSelectedLaunchNotes((prev) => {
        if (!(String(productId) in prev)) return prev;
        const next = { ...prev };
        delete next[String(productId)];
        return next;
      });
    }
  };

  /** Limpa o lote selecionado (quantidades + observações). */
  const clearLaunchSelection = () => {
    setSelectedLaunchItems({});
    setSelectedLaunchNotes({});
  };

  // Trocar de mesa invalida a seleção: senão o garçom poderia lançar na mesa
  // errada itens marcados para a anterior.
  useEffect(() => {
    setSelectedLaunchItems({});
    setSelectedLaunchNotes({});
    setIsBatchLaunchOpen(false);
    setMenuCategory('ALL');
    setMenuSearch('');
  }, [selectedTable?.id]);

  // Alerta sonoro ligado/desligado (o garçom escolhe; em salão cheio o som ajuda)
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Tempo real: chamado de mesa, pedido pronto na cozinha e mudança de status.
  // Substitui o WebSocket que vivia no painel do garçom removido.
  useEffect(() => {
    const companyId = tenant?.id;
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
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      if (soundEnabled) playWaiterChime();
      const isBill = call.type === 'BILL';
      toast.error(
        isBill
          ? `${call.table?.label || 'Mesa'} pediu a CONTA!`
          : `${call.table?.label || 'Mesa'} chamou o GARÇOM!`,
        { duration: 8000 },
      );
    });

    socket.on('order:status_update', (order: any) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      if (order.status === 'READY') {
        // Toca no celular do garçom responsável: quem lançou/assumiu a mesa
        // recebe alerta forte + vibração ("vai buscar!"); pros outros é
        // discreto, só pra ciência. Vínculo por ID, com fallback por nome.
        const mine = isMyOrder(order, { id: (currentUser as any)?.id, name: currentUser?.name });
        const waiter = orderWaiterName(order);
        if (soundEnabled) playWaiterChime(mine);
        if (mine) vibratePhone([200, 100, 200, 100, 300]);
        toast.success(
          mine
            ? `🔔 SEU pedido #${order.orderNumber} da ${order.table?.label || 'mesa'} está PRONTO — vai buscar!`
            : `Pedido #${order.orderNumber} da ${order.table?.label || 'mesa'} está PRONTO${waiter ? ` (garçom: ${waiter})` : ''}!`,
          { duration: 7000 },
        );
      }
    });

    socket.on('table:status_change', () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [tenant?.id, soundEnabled, queryClient, currentUser?.id, currentUser?.name]);

  // Destrava o áudio no primeiro toque/tecla: o navegador bloqueia som sem
  // gesto do usuário, e sem isso o "apitou pra mim" nunca sairia no celular.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        if (ctx.state === 'suspended') void ctx.resume();
        if (ctx.state !== 'closed') void ctx.close?.();
      } catch {}
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Mutações
  const openSessionMutation = useMutation({
    mutationFn: ({
      tableId,
      customerCount,
      comandaName,
    }: {
      tableId: string;
      customerCount?: number;
      comandaName?: string;
    }) =>
      // O garçom que abre assume a mesa: id + nome viajam juntos para o KDS
      // saber quem deve buscar os pratos quando ficarem prontos.
      apiPost(`/restaurant/tables/${tableId}/open-session`, {
        customerCount,
        comandaName,
        waiterName: currentUser?.name || undefined,
        waiterId: (currentUser as any)?.id || undefined,
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-session', vars.tableId] });
      setSelectedTable((prev: any) =>
        prev && prev.id === vars.tableId ? { ...prev, status: 'OCCUPIED' } : prev,
      );
      setOpenComandaTable(null);
      setComandaName('');
      setComandaNameError(null);
      toast.success(`Comanda "${vars.comandaName}" aberta com sucesso!`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao abrir mesa'),
  });

  const addOrderItemMutation = useMutation({
    mutationFn: ({
      tableId,
      productId,
      quantity = 1,
      modifiers = [],
      notes,
    }: {
      tableId: string;
      productId: string;
      quantity?: number;
      modifiers?: Array<{ modifierItemId: string }>;
      notes?: string;
    }) =>
      apiPost(`/restaurant/tables/${tableId}/orders`, {
        items: [{ productId, quantity, modifiers, notes }],
        waiterName: currentUser?.name || undefined,
        waiterId: (currentUser as any)?.id || undefined,
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['table-session', vars.tableId] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setAddedItemFeedback(vars.productId);
      setTimeout(() => setAddedItemFeedback(null), 1500);
      setSheetView('MAIN');
      setCustomizingProduct(null);
      toast.success('Item lançado na comanda!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao adicionar item'),
  });

  // ─── Correção de lançamento ───
  // Antes não havia como corrigir um item errado: o garçom só podia cancelar a
  // comanda inteira. Agora dá para ajustar a quantidade ou remover o item
  // preservando o resto do pedido.
  // ─── Lançamento em lote ───
  // Envia todos os itens selecionados numa ÚNICA ordem (um só POST). A rota já
  // aceita `items[]`, então a cozinha recebe um pedido agrupado da mesa em vez
  // de vários pedidos avulsos.
  const launchBatchMutation = useMutation({
    mutationFn: ({ tableId, items }: { tableId: string; items: Array<{ productId: string; quantity: number; notes?: string }> }) =>
      apiPost(`/restaurant/tables/${tableId}/orders`, {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, modifiers: [], ...(i.notes ? { notes: i.notes } : {}) })),
        origin: 'WAITER',
        waiterName: currentUser?.name || undefined,
        waiterId: (currentUser as any)?.id || undefined,
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['table-session', vars.tableId] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      clearLaunchSelection();
      setIsBatchLaunchOpen(false);
      setSheetView('MAIN');
      toast.success(`${vars.items.length} item(ns) lançado(s) na comanda!`);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Erro ao lançar os itens'),
  });

  const updateOrderItemMutation = useMutation({
    mutationFn: ({ orderId, itemId, quantity }: { orderId: string; itemId: string; quantity: number }) =>
      apiPatch(`/restaurant/orders/${orderId}/items/${itemId}`, { quantity }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['table-session', selectedTable?.id] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      toast.success('Quantidade atualizada!');
      void vars;
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Erro ao atualizar item'),
  });

  const removeOrderItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      apiDelete(`/restaurant/orders/${orderId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-session', selectedTable?.id] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      toast.success('Item removido da comanda!');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Erro ao remover item'),
  });

  const transferTableMutation = useMutation({
    mutationFn: ({ fromTableId, toTableId }: { fromTableId: string; toTableId: string }) =>
      apiPost(`/restaurant/tables/${fromTableId}/transfer`, { toTableId }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setSelectedTable(null);
      setSheetView('MAIN');
      toast.success(data?.message || 'Comanda transferida com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao transferir mesa'),
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ tableId, data }: { tableId: string; data: { number?: number; label?: string; capacity?: number } }) =>
      apiPatch(`/restaurant/tables/${tableId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setSelectedTable(null);
      setSheetView('MAIN');
      toast.success('Mesa atualizada com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao atualizar mesa'),
  });

  const deleteTableMutation = useMutation({
    mutationFn: (tableId: string) => apiDelete(`/restaurant/tables/${tableId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setSelectedTable(null);
      setSheetView('MAIN');
      toast.success('Mesa excluída com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir mesa'),
  });

  const createTableMutation = useMutation({
    mutationFn: (newTable: { number: number; label?: string; capacity?: number }) =>
      apiPost('/restaurant/tables', newTable),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setAddTableOpen(false);
      setNewTableNumber('');
      setNewTableLabel('');
      toast.success(`Mesa ${data.number} criada com sucesso!`);
      if (data.qrToken) {
        setQrModalTable(data);
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao criar mesa'),
  });

  const pairDeviceMutation = useMutation({
    mutationFn: ({ tableId, deviceName }: { tableId: string; deviceName?: string }) =>
      apiPost(`/restaurant/tables/${tableId}/devices`, { deviceName }),
    onSuccess: (data: any) => {
      const tabletUrl = `${window.location.origin}/tablet/${data.deviceToken}`;
      setPairedDeviceData({
        ...data,
        tabletUrl,
      });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      toast.success(`Tablet pareado com a ${data.tableLabel}!`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao parear tablet'),
  });

  const rotateQrMutation = useMutation({
    mutationFn: (tableId: string) => apiPost(`/restaurant/tables/${tableId}/rotate-qr`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setQrModalTable((prev: any) => (prev ? { ...prev, qrToken: data.newQrToken } : null));
      toast.success('Novo QR Code gerado! O anterior foi invalidado.');
    },
    onError: (err: any) => toast.error('Erro ao rotacionar QR code'),
  });

  const closeSessionMutation = useMutation({
    mutationFn: ({
      tableId,
      method,
      amountReceivedCents,
      notes,
      tip,
    }: {
      tableId: string;
      method?: string;
      amountReceivedCents?: number;
      notes?: string;
      tip?: { paidCents: number; method?: string };
    }) =>
      apiPost(`/restaurant/tables/${tableId}/close-session`, {
        method,
        amountReceivedCents,
        notes,
        tip,
      }),
    onSuccess: (data: any) => {
      // Fecha e atualiza TUDO que depende de venda: mapa, histórico, caixas,
      // fechamento e relatórios — tempo real sem F5 em nenhuma tela.
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      queryClient.invalidateQueries({ queryKey: ['tips-summary'] });
      queryClient.invalidateQueries({ queryKey: ['tips-history'] });
      queryClient.invalidateQueries({ queryKey: ['tips-payout-preview'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register'] });
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      queryClient.invalidateQueries({ queryKey: ['kds-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] });
      setSelectedTable(null);
      setSheetView('MAIN');
      setConfirmCloseOpen(false);
      setPaymentModalOpen(false);
      setConfirmPaidOpen(false);
      setCashReceived('');
      setPaymentNotes('');
      setTipChoice('PAID');
      setTipPaid('');
      setTipMethod('PIX');
      toast.success('Comanda encerrada e mesa liberada com sucesso!');

      // O fechamento devolve a conta montada (itens + total). Mostrar o recibo
      // aqui é o que faltava: antes a mesa simplesmente liberava e o valor a
      // pagar não aparecia em lugar nenhum.
      if (data?.receipt) {
        setClosedReceipt(data.receipt);
        setReceiptOpen(true);
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao encerrar comanda'),
  });

  /** Converte "12,50" / "12.50" em centavos. */
  const parseCashToCents = (raw: string): number => {
    const normalized = (raw || '').replace(/[^\d,.-]/g, '').replace(',', '.');
    const value = parseFloat(normalized);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * 100);
  };

  /** Monta o 10% para o fechamento (status final é derivado no backend). */
  const buildTipPayload = (): { paidCents: number; method?: string } => {
    if (tipChoice === 'NONE') return { paidCents: 0 };
    if (tipChoice === 'PAID') return { paidCents: tipSuggestedCents, method: tipMethod };
    return { paidCents: parseCashToCents(tipPaid), method: tipMethod };
  };

  /** Rótulo da escolha dos 10% para conferência. */
  const tipChoiceLabel =
    tipChoice === 'NONE'
      ? 'Não pagou'
      : tipChoice === 'PAID'
        ? 'Pagou'
        : tipChoice === 'OVER'
          ? 'Pagou a mais'
          : 'Pagou a menos';

  const answerCallMutation = useMutation({
    mutationFn: (callId: string) => apiPost(`/restaurant/waiter-calls/${callId}/answer`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      if (selectedTable) {
        setSelectedTable((prev: any) => (prev ? { ...prev, hasPendingCall: false, pendingCalls: [] } : null));
      }
      toast.success('Chamado atendido!');
    },
  });

  const handleSelectTable = (table: any) => {
    // Mesa livre: o gesto de abrir passa pelo modal de nome da comanda.
    // Mesa ocupada: mantém o bottom sheet de gestão (comportamento atual).
    if (table?.status !== 'OCCUPIED') {
      setOpenComandaTable(table);
      setComandaName('');
      setComandaNameError(null);
      return;
    }

    setSelectedTable(table);
    setSheetView('MAIN');
    setTableCapacity(table.capacity || 4);
    setEditTableNumber(String(table.number));
    setEditTableLabel(table.label || '');
    setMenuSearch('');
    setCustomizingProduct(null);
  };

  /**
   * Confirma a abertura da mesa.
   *
   * O nome é obrigatório: sem ele a comanda fica sem identificação no salão e
   * o garçom não consegue distinguir duas mesas abertas ao mesmo tempo.
   */
  const handleConfirmOpenComanda = () => {
    const name = comandaName.trim();
    if (!name) {
      setComandaNameError('Informe o nome da comanda para continuar.');
      return;
    }
    if (!openComandaTable) return;

    openSessionMutation.mutate({
      tableId: openComandaTable.id,
      customerCount: openComandaTable.capacity || tableCapacity || 4,
      comandaName: name,
    });
  };

  const handleStartCustomize = (product: any) => {
    setCustomizingProduct(product);
    const preSelected: string[] = [];
    (product.modifierGroups || []).forEach((g: any) => {
      if (g.isRequired && g.items && g.items.length > 0) {
        preSelected.push(g.items[0].id);
      }
    });
    setSelectedModifierIds(preSelected);
    // Reabre a obs que já está no lote (se o garçom voltar para ajustar).
    setCustomizingNotes(String(selectedLaunchNotes[String(product.id)] || ''));
    setSheetView('CUSTOMIZE_ITEM');
  };

  const toggleObservationChip = (chip: string) => {
    setCustomizingNotes((prev) => {
      const parts = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.includes(chip)) {
        return parts.filter((p) => p !== chip).join(', ');
      } else {
        return [...parts, chip].join(', ');
      }
    });
  };


  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(newTableNumber, 10);
    if (isNaN(num) || num <= 0) {
      return toast.error('Informe um número de mesa válido.');
    }
    createTableMutation.mutate({
      number: num,
      label: newTableLabel.trim() || undefined,
      capacity: 4,
    });
  };

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  // Contadores
  const totalTables = tables.length;
  const occupiedTables = tables.filter((t: any) => t.status === 'OCCUPIED').length;
  const freeTables = totalTables - occupiedTables;

  /** Mesa tem algo pedindo atenção: chamado do cliente OU pronto p/ servir. */
  const tableNeedsAttention = (t: any) => t.hasPendingCall || Number(t.readyOrdersCount || 0) > 0;
  const callingTables = tables.filter(tableNeedsAttention).length;

  /** Mesas com pronto(s) do garçom logado (por ID, com fallback por nome). */
  const myReadyTables = useMemo(() => {
    const myId = String((currentUser as any)?.id || '').trim();
    const myName = String(currentUser?.name || '').trim().toLowerCase();
    return tables.filter((t: any) => {
      const ready: any[] = t.readyOrders || [];
      if (ready.length === 0) return false;
      return ready.some((o: any) => {
        if (o.waiterId && myId) return String(o.waiterId) === myId;
        if (o.waiterId && !myId) return false;
        const w = String(o.waiterName || t.waiterName || '').trim().toLowerCase();
        return Boolean(w && myName && w === myName);
      });
    });
  }, [tables, currentUser]);

  // Filtragem dinâmica. "Chamando Garçom" = chamado do cliente + prontos p/
  // servir; para o garçom logado mostra SÓ as mesas dele (esconde as dos
  // outros atendentes, como exige a operação do salão).
  const filteredTables = useMemo(() => {
    if (statusFilter === 'FREE') return tables.filter((t: any) => t.status !== 'OCCUPIED' && !tableNeedsAttention(t));
    if (statusFilter === 'OCCUPIED') return tables.filter((t: any) => t.status === 'OCCUPIED');
    if (statusFilter === 'CALLING') {
      const needing = tables.filter(tableNeedsAttention);
      if (!isWaiter) return needing;
      const mine = new Set(myReadyTables.map((t: any) => t.id));
      return needing.filter((t: any) => {
        if (mine.has(t.id)) return true;
        // Chamado de cliente em mesa minha (sem pronto ainda).
        if (!t.hasPendingCall) return false;
        const myId = String((currentUser as any)?.id || '').trim();
        if (t.waiterId && myId) return String(t.waiterId) === myId;
        const w = String(t.waiterName || '').trim().toLowerCase();
        const myName = String(currentUser?.name || '').trim().toLowerCase();
        return Boolean(!t.waiterId && !w) || Boolean(w && myName && w === myName);
      });
    }
    return tables;
  }, [tables, statusFilter, isWaiter, myReadyTables, currentUser]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Alerta sonoro — visível para todos os papéis, inclusive o garçom
          (o cabeçalho abaixo só aparece para admin/dono). */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={
            soundEnabled
              ? 'Desligar o aviso sonoro de chamados'
              : 'Ligar o aviso sonoro de chamados'
          }
          className="h-8 px-3 text-xs font-bold border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="ml-1.5">Alerta sonoro ligado</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
              <span className="ml-1.5">Alerta sonoro mudo</span>
            </>
          )}
        </Button>
      </div>

      {/* Top Header com Título & Ações Principais (Apenas para Administrador / Dono) */}
      {!isWaiter && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-5 sm:p-6 rounded-3xl border border-zinc-200/90 dark:border-zinc-800 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  Mapa de Salão & Gestão de Mesas
                </h1>
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 font-bold text-xs">
                  Tempo Real
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Visualização simplificada em quadradinhos: toque em qualquer mesa para gerenciar comandas, ver QR Code ou parear tablets.
              </p>
            </div>

            {/* Botões de Ação do Dono */}
            <div className="flex items-center flex-wrap gap-2">
              {/* Botão de Destaque: Cadastrar Comidas & Produtos */}
              <Button
                size="sm"
                onClick={() => setCreateFoodOpen(true)}
                className="h-10 px-4 text-xs font-black text-zinc-950 bg-amber-400 hover:bg-amber-500 rounded-2xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <UtensilsCrossed className="w-4 h-4 text-zinc-950" />
                <span>＋ Nova Comida & Opcionais</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageTablesOpen(true)}
                className="h-10 px-3.5 text-xs font-bold text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 border-zinc-200 dark:border-zinc-700 rounded-2xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Configurar Salão
              </Button>

              <Button
                size="sm"
                onClick={() => setAddTableOpen(true)}
                className="h-10 px-4 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-2xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nova Mesa
              </Button>
            </div>
          </div>

          {/* Banner Orientativo para o Dono do Estabelecimento */}
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border border-amber-300/60 dark:border-amber-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                  Cardápio & Produtos: Você tem total controle!
                </h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Cadastre todos os seus pratos, carnes com pontos, porções, hambúrgueres e molhos especiais. Fica disponível instantaneamente para os clientes e pedidos!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setCreateFoodOpen(true)}
                className="h-8 px-3 text-[11px] font-black text-zinc-950 bg-amber-400 hover:bg-amber-500 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar Comida Rápida</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/app/products')}
                className="h-8 px-3 text-[11px] font-bold text-amber-900 dark:text-amber-300 bg-white dark:bg-zinc-900 border-amber-300 dark:border-amber-700 rounded-xl hover:bg-amber-50 transition cursor-pointer flex items-center gap-1"
              >
                <span>Ver Catálogo</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Barra de Filtros & Métricas do Salão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'ALL'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <span>Todas</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
              {totalTables}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('FREE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'FREE'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>Livres</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
              {freeTables}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('OCCUPIED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'OCCUPIED'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span>Ocupadas</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
              {occupiedTables}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('CALLING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'CALLING'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40'
            }`}
          >
            <BellRing className={`w-3.5 h-3.5 ${callingTables > 0 ? 'text-orange-500 animate-bounce' : ''}`} />
            <span>Chamando Garçom</span>
            {callingTables > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-orange-500 text-white font-black animate-pulse">
                {callingTables}
              </span>
            )}
          </button>
        </div>

        {/* Legenda visual com as cores solicitadas */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600 inline-block shadow-xs" />
            Verde = Livre
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-rose-600 inline-block shadow-xs" />
            Vermelho = Ocupado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-600 inline-block shadow-xs" />
            Laranja = Garçom
          </span>
        </div>
      </div>

      {/* Prontos para buscar: faixa fixa enquanto eu tiver pedido pronto. Tocar
          abre a mesa direto — sem F5, atualiza por socket + polling. A baixa é
          o "Entregue na mesa" no KDS: zerou os prontos, a faixa some e o sino
          para. */}
      {myReadyTables.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-emerald-600 text-white shadow-md space-y-2">
          <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
            <BellRing className="w-4 h-4 animate-bounce" />
            Pronto para servir — vai buscar! ({myReadyTables.length} mesa(s))
          </p>
          <div className="flex flex-wrap gap-1.5">
            {myReadyTables.map((t: any) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTable(t)}
                className="px-3 py-1.5 rounded-xl bg-white text-emerald-900 text-xs font-black hover:bg-emerald-50 active:scale-95 transition cursor-pointer"
              >
                {t.label || `Mesa ${t.number}`} •{' '}
                {(t.readyOrders || []).map((o: any) => `#${o.orderNumber}`).join(', ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid de Mesas em Quadradinhos com Blur Completo e Bordas Bem Visíveis */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400 font-medium text-xs flex flex-col items-center justify-center space-y-2">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
          <span>Carregando salão de mesas...</span>
        </div>
      ) : tables.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 p-12 text-center rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800">
          <UtensilsCrossed className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-black text-zinc-800 dark:text-white">Nenhuma mesa cadastrada</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            Adicione mesas ao seu salão para gerar os quadradinhos, QR codes de autoatendimento e comandas digitais.
          </p>
          <div className="flex items-center justify-center gap-3 mt-5">
            <Button
              onClick={() => setSetupWizardOpen(true)}
              size="sm"
              className="bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 rounded-2xl text-xs font-bold flex items-center gap-1.5 h-10 px-5 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              Configurar Salão em Lote
            </Button>
            <Button
              onClick={() => setAddTableOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-2xl text-xs font-semibold border-zinc-200 dark:border-zinc-700 h-10 px-4 cursor-pointer"
            >
              Adicionar Mesa Avulsa
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 2xl:grid-cols-11 gap-2 sm:gap-2.5">
          {filteredTables.map((table: any) => {
            const isOccupied = table.status === 'OCCUPIED';
            const hasCall = table.hasPendingCall;
            const billRequested = (table.pendingCalls || []).some((c: any) => c.type === 'BILL');
            // Prontos aguardando busca (vem do KDS em tempo real via socket).
            const readyCount = Number(table.readyOrdersCount || (table.readyOrders || []).length || 0);
            const hasTablet = table.devices && table.devices.some((d: any) => d.status === 'ACTIVE');

            // Regras de Cores, Blur e Bordas Visíveis:
            // 🟢 Verde = Livre
            // 🔴 Vermelho = Ocupado
            // 🟠 Laranja = Chamando Garçom
            let cardClasses = '';
            let innerBlurGlow = '';
            let numberColor = '';
            let mesaLabelColor = '';
            let bottomBadge = null;

            if (hasCall) {
              // LARANJA: Chamando o garçom
              cardClasses = 'border-2 border-orange-500 dark:border-orange-400 bg-orange-500/20 dark:bg-orange-950/50 ring-2 ring-orange-400/50 shadow-md shadow-orange-500/30 animate-pulse';
              innerBlurGlow = 'bg-gradient-to-br from-orange-400/35 via-orange-500/15 to-orange-600/30';
              numberColor = 'text-orange-950 dark:text-white';
              mesaLabelColor = 'text-orange-800 dark:text-orange-300';
              bottomBadge = (
                <span className="px-1.5 py-0.5 rounded-full bg-orange-500 text-white font-black text-[9px] flex items-center gap-0.5 shadow-xs animate-bounce">
                  <BellRing className="w-2.5 h-2.5" />
                  <span>{billRequested ? 'Conta' : 'Garçom!'}</span>
                </span>
              );
            } else if (isOccupied) {
              // VERMELHO: Ocupado
              cardClasses = 'border-2 border-rose-500 dark:border-rose-400 bg-rose-500/15 dark:bg-rose-950/40 shadow-sm shadow-rose-500/20 hover:border-rose-600 hover:shadow-rose-500/30';
              innerBlurGlow = 'bg-gradient-to-br from-rose-400/30 via-rose-500/10 to-rose-600/25';
              numberColor = 'text-rose-950 dark:text-white';
              mesaLabelColor = 'text-rose-800 dark:text-rose-300';
              // O nome da comanda é mais útil que um "Ocupada" genérico: dois
              // garçons conseguem saber de quem é cada mesa só de olhar o mapa.
              // Sessões abertas antes da coluna existir caem no valor total e,
              // sem consumo ainda, no rótulo antigo.
              bottomBadge = (
                <div className="w-full flex flex-col items-center gap-0.5">
                  {table.comandaName ? (
                    <span
                      title={table.comandaName}
                      className="px-1.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-500/40 text-rose-950 dark:text-rose-100 font-black text-[9px] truncate max-w-full"
                    >
                      {table.comandaName}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-500/40 text-rose-950 dark:text-rose-100 font-black text-[9px] truncate max-w-full">
                      {table.sessionTotalCents > 0
                        ? (table.sessionTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                        : 'Ocupada'}
                    </span>
                  )}
                  {/* O consumo continua visível mesmo quando há nome. */}
                  {table.comandaName && table.sessionTotalCents > 0 && (
                    <span className="text-[9px] font-bold text-rose-900/70 dark:text-rose-200/70 tabular-nums">
                      {(table.sessionTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                    </span>
                  )}
                  {/* Pronto p/ servir: o garçom vê sem abrir a comanda. */}
                  {readyCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-black text-[9px] flex items-center gap-0.5 shadow-xs animate-pulse">
                      <BellRing className="w-2.5 h-2.5" />
                      <span>{readyCount} pronto{readyCount > 1 ? 's' : ''}!</span>
                    </span>
                  )}
                </div>
              );
            } else {
              // VERDE: Livre
              cardClasses = 'border-2 border-emerald-500 dark:border-emerald-400 bg-emerald-500/15 dark:bg-emerald-950/40 shadow-sm shadow-emerald-500/20 hover:border-emerald-600 hover:shadow-emerald-500/30';
              innerBlurGlow = 'bg-gradient-to-br from-emerald-400/30 via-emerald-500/10 to-emerald-600/25';
              numberColor = 'text-emerald-950 dark:text-white';
              mesaLabelColor = 'text-emerald-800 dark:text-emerald-300';
              bottomBadge = (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-500/40 text-emerald-900 dark:text-emerald-200 font-black text-[9px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  <span>Livre</span>
                </span>
              );
            }

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => handleSelectTable(table)}
                className={`relative aspect-square rounded-2xl p-2 sm:p-2.5 flex flex-col justify-between items-center text-center transition-all duration-200 cursor-pointer select-none group backdrop-blur-md backdrop-saturate-150 overflow-hidden hover:scale-[1.05] active:scale-[0.95] ${cardClasses}`}
              >
                {/* Efeito de Blur Completo + Glow Interno do Quadradinho */}
                <div className={`absolute inset-0 backdrop-blur-md ${innerBlurGlow} pointer-events-none`} />
                <div className="absolute -top-4 -right-4 w-12 h-12 rounded-full bg-white/25 dark:bg-white/10 blur-md pointer-events-none" />

                {/* Linha Superior: Palavra MESA bem pequena + Ícones de Status */}
                <div className="relative z-10 w-full flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-0.5">
                    {hasTablet && (
                      <span title="Tablet Pareado" className="p-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                        <Tablet className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {table.qrToken && (
                      <span title="QR Code Ativo" className="p-0.5 rounded bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                        <QrCode className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>

                  {/* Palavra 'mesa' bem pequena */}
                  <span className={`text-[9px] font-black tracking-widest uppercase ${mesaLabelColor}`}>
                    MESA
                  </span>

                  {/* Ponto indicador de status */}
                  {hasCall ? (
                    <span className="w-2 h-2 rounded-full bg-orange-500 shadow-xs shadow-orange-500 animate-ping" />
                  ) : readyCount > 0 ? (
                    <span
                      title={`${readyCount} pedido(s) pronto(s) para servir`}
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-amber-500 text-white shadow-xs animate-bounce"
                    >
                      <BellRing className="w-2.5 h-2.5" />
                      <span className="text-[8px] font-black tabular-nums">{readyCount}</span>
                    </span>
                  ) : isOccupied ? (
                    <span className="w-2 h-2 rounded-full bg-rose-500 shadow-xs shadow-rose-500" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500" />
                  )}
                </div>

                {/* Centro: O NÚMERO É BEM GRANDE! */}
                <div className="relative z-10 my-auto flex flex-col items-center justify-center">
                  <span className={`text-2xl sm:text-3xl font-black tracking-tight leading-none drop-shadow-xs ${numberColor}`}>
                    {table.number}
                  </span>
                  {table.label && table.label !== `Mesa ${table.number}` && table.label !== `Mesa ${String(table.number).padStart(2, '0')}` && (
                    <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[65px] mt-0.5">
                      {table.label}
                    </span>
                  )}
                </div>

                {/* Linha Inferior: Indicador Visual Limpo */}
                <div className="relative z-10 w-full flex items-center justify-center">
                  {bottomBadge}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── BOTTOM SHEET NATIVO PARA MOBILE & DESKTOP ───
          Não fecha clicando fora (regra global dos modais): só pelos botões
          de voltar/fechar da própria tela, para não perder a comanda. */}
      {selectedTable && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-[32px] sm:rounded-3xl shadow-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-300 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra de arraste no mobile */}
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
            </div>

            {/* ─── TELA 1: MESA LIVRE (🟢 Livre) ─── */}
            {sheetView === 'MAIN' && selectedTable.status !== 'OCCUPIED' && (
              <div className="p-6 space-y-4">
                {/* Header: Nome da mesa + Botão Fechar */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 text-center pr-2">
                    <h2 className="text-2xl font-black text-zinc-950 dark:text-white uppercase tracking-tight">
                      {selectedTable.label || `MESA ${String(selectedTable.number).padStart(2, '0')}`}
                    </h2>
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Livre
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedTable(null)}
                    className="p-2 -mr-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <hr className="border-zinc-100 dark:border-zinc-800" />

                {/* Capacidade */}
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="font-bold text-zinc-600 dark:text-zinc-400">Capacidade</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTableCapacity((c) => Math.max(1, c - 1))}
                      className="w-8 h-8 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-black hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-black text-zinc-900 dark:text-white min-w-[75px] text-center">
                      {tableCapacity} pessoas
                    </span>
                    <button
                      onClick={() => setTableCapacity((c) => c + 1)}
                      className="w-8 h-8 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-black hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Botão Principal: abrir mesa (passa pelo modal de comanda) */}
                <Button
                  onClick={() => {
                    setOpenComandaTable(selectedTable);
                    setComandaName('');
                    setComandaNameError(null);
                  }}
                  disabled={openSessionMutation.isPending}
                  className="w-full h-13 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.98] cursor-pointer"
                >
                  <DoorOpen className="w-4 h-4" />
                  <span>Abrir mesa</span>
                </Button>

                {/* Botão Secundário: 📱 VER QR CODE */}
                <Button
                  variant="outline"
                  onClick={() => {
                    setQrModalTable(selectedTable);
                    setSelectedTable(null);
                  }}
                  className="w-full h-12 rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/60 text-zinc-900 dark:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  <span>📱 VER QR CODE</span>
                </Button>

                {/* Link: ⚙️ Editar mesa (Apenas Dono / Admin) */}
                {!isWaiter && (
                  <div className="pt-1 text-center">
                    <button
                      onClick={() => setSheetView('EDIT_TABLE')}
                      className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center justify-center gap-1.5 mx-auto py-1 cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>⚙️ Editar mesa</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─── TELA 2: MESA OCUPADA (🔴 Ocupada • Comanda) ─── */}
            {sheetView === 'MAIN' && selectedTable.status === 'OCCUPIED' && (
              <div className="flex flex-col h-full max-h-[85vh]">
                {/* Header */}
                <div className="px-6 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white hover:opacity-80 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Mesa {String(selectedTable.number).padStart(2, '0')}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setQrModalTable(selectedTable);
                        setSelectedTable(null);
                      }}
                      title="Ver QR Code"
                      className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                    {!isWaiter && (
                      <button
                        onClick={() => setSheetView('EDIT_TABLE')}
                        title="Editar Mesa"
                        className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Substatus Bar */}
                <div className="px-6 py-2 bg-zinc-50/80 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                    <span className="truncate">
                      {selectedTable?.comandaName
                        ? `${selectedTable.comandaName} • ${tableCapacity} pessoas`
                        : `Ocupada • ${tableCapacity} pessoas`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(selectedTable?.waiterName || (sessionData as any)?.session?.waiterName) && (
                      <span
                        title="Garçom responsável"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black max-w-[140px]"
                      >
                        <Users className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {selectedTable?.waiterName || (sessionData as any)?.session?.waiterName}
                        </span>
                      </span>
                    )}
                    <span className="font-mono font-black text-[11px] text-zinc-500 tracking-wider">
                      COMANDA #{sessionData?.session?.id ? sessionData.session.id.slice(0, 4).toUpperCase() : '1048'}
                    </span>
                  </div>
                </div>

                {/* Chamado de Garçom Ativo se houver */}
                {selectedTable.hasPendingCall && selectedTable.pendingCalls?.[0] && (
                  <div className="mx-6 mt-3 p-3 rounded-2xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-950 dark:text-orange-200">
                      <BellRing className="w-4 h-4 text-orange-500 animate-bounce" />
                      <span>
                        {selectedTable.pendingCalls[0].type === 'BILL' ? 'Cliente pediu a conta!' : 'Cliente chamando garçom!'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => answerCallMutation.mutate(selectedTable.pendingCalls[0].id)}
                      disabled={answerCallMutation.isPending}
                      className="h-7 px-3 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-xs cursor-pointer"
                    >
                      Atender
                    </Button>
                  </div>
                )}

                {/* Observações Registradas na Mesa */}
                {sessionData?.session?.rawOrders?.some((o: any) => o.notes) && (
                  <div className="mx-6 mt-2 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1">
                      📝 Observação da Mesa:
                    </span>
                    <div className="space-y-0.5">
                      {sessionData.session.rawOrders
                        .filter((o: any) => o.notes)
                        .map((o: any, idx: number) => (
                          <div key={idx} className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                            • Pedido #{o.orderNumber}: {o.notes}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Lista de Itens da Comanda (Scrollable) */}
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3 min-h-[160px]">
                  {isLoadingSession ? (
                    <div className="py-8 text-center text-xs text-zinc-400">Carregando itens da comanda...</div>
                  ) : !sessionData?.session || sessionData.session.aggregatedItems.length === 0 ? (
                    <div className="py-10 text-center text-zinc-400 text-xs">
                      <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                      <p className="font-bold text-zinc-600 dark:text-zinc-400">Nenhum item lançado ainda</p>
                      <p className="text-[11px] mt-0.5">Toque em "＋ ADICIONAR ITEM" para lançar pratos ou bebidas.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {(
                        // Usa os itens BRUTOS (com id) em vez dos agregados:
                        // sem o id não há como editar ou remover um lançamento.
                        (sessionData.session.rawOrders || []).flatMap((order: any) =>
                          (order.items || [])
                            .filter((it: any) => order.status !== 'CANCELLED')
                            .map((it: any) => ({
                              orderId: order.id,
                              itemId: it.id,
                              name: it.product?.name || 'Item',
                              quantity: it.quantity,
                              notes: it.notes,
                              modifiers: (it.modifiers || []).map((m: any) => m.name),
                              totalCents: it.totalPrice ?? it.totalPriceCents ?? 0,
                            })),
                        )
                      ).map((item: any, idx: number) => (
                        <div
                          key={`${item.orderId}-${item.itemId}-${idx}`}
                          className="py-2.5 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-zinc-900 dark:text-white truncate">
                                {item.name}
                              </span>
                              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black shrink-0">
                                {item.quantity}x
                              </span>
                            </div>
                            {item.modifiers?.length > 0 && (
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {item.modifiers.join(', ')}
                              </div>
                            )}
                            {item.notes && (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-900 dark:text-amber-300">
                                <span>📝</span>
                                <span>Obs: {item.notes}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-black text-zinc-950 dark:text-white">
                              {((item.totalCents || 0) / 100).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </span>

                            {/* Alvos de 44px: o garçom usa o celular com uma mão,
                                no meio do salão. */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem({
                                  orderId: item.orderId,
                                  itemId: item.itemId,
                                  name: item.name,
                                  quantity: item.quantity,
                                });
                                setEditingQuantity(Math.round(item.quantity) || 1);
                              }}
                              title="Ajustar quantidade"
                              aria-label={`Ajustar quantidade de ${item.name}`}
                              className="h-11 w-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer"
                            >
                              <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setRemovingItem({
                                  orderId: item.orderId,
                                  itemId: item.itemId,
                                  name: item.name,
                                })
                              }
                              title="Remover item"
                              aria-label={`Remover ${item.name}`}
                              className="h-11 w-11 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center active:scale-95 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer com Total e Ações */}
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3 bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">TOTAL</span>
                    <span className="text-2xl font-black text-zinc-950 dark:text-white">
                      {(((sessionData?.session?.totalCents || selectedTable.sessionTotalCents || 0)) / 100).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </span>
                  </div>

                  {/* Botão: ＋ ADICIONAR ITEM */}
                  <Button
                    onClick={() => setSheetView('ADD_ITEM')}
                    className="w-full h-12 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.98] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>＋ ADICIONAR ITEM</span>
                  </Button>

                  {/* Transferir e Dividir */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSheetView('TRANSFER')}
                      className="h-10 text-xs font-bold rounded-xl border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Transferir</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSheetView('DIVIDE')}
                      className="h-10 text-xs font-bold rounded-xl border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Split className="w-3.5 h-3.5 text-amber-600" />
                      <span>Dividir</span>
                    </Button>
                  </div>

                  {/* Botão: FECHAR CONTA -> abre confirmação, depois forma de pagamento */}
                  <Button
                    onClick={() => {
                      setPaymentMethod('PIX');
                      setCashReceived('');
                      setPaymentNotes('');
                      // 10% começa como "Pagou" no sugerido, mesmo canal da conta.
                      setTipChoice('PAID');
                      setTipPaid(fmtCentsInput(tipSuggestedCents));
                      setTipMethod('PIX');
                      setConfirmCloseOpen(true);
                    }}
                    disabled={closeSessionMutation.isPending}
                    className="w-full h-12 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>FECHAR CONTA</span>
                  </Button>
                </div>
              </div>
            )}

            {/* ─── TELA 3: ADICIONAR ITEM (🍔 Cardápio do Restaurante) ─── */}
            {sheetView === 'ADD_ITEM' && (
              <div className="flex flex-col h-full max-h-[85vh]">
                {/* Header */}
                <div className="px-6 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <button
                    onClick={() => setSheetView('MAIN')}
                    className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white hover:opacity-80 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Adicionar item</span>
                  </button>
                  <span className="text-xs font-bold text-zinc-400">
                    Mesa {selectedTable.number}
                  </span>
                </div>

                {/* Input de Busca & Botão Nova Comida */}
                <div className="px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="🔎 Buscar..."
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="pl-9 h-10 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                    />
                  </div>
                  {!isWaiter && (
                    <Button
                      size="sm"
                      onClick={() => setCreateFoodOpen(true)}
                      className="h-10 px-3 text-xs font-black bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-xl shrink-0 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      title="Cadastrar nova comida com pontos e molhos"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Nova Comida</span>
                    </Button>
                  )}
                </div>

                {/* Atalhos fixos: só as principais (Bebidas, Sobremesas, Batatas).
                    1 toque filtra; de novo volta. A busca continua valendo dentro. */}
                {(() => {
                  const norm = (s: string) =>
                    (s || '')
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .toLowerCase();
                  // Ordem fixa dos atalhos + palavra que identifica a categoria
                  // (pega "Bebidas & Sucos", "Batata Frita" etc.).
                  const SHORTCUTS: { key: string; match: string }[] = [
                    { key: 'Bebidas', match: 'bebida' },
                    { key: 'Sobremesas', match: 'sobremesa' },
                    { key: 'Batatas', match: 'batata' },
                  ];
                  const shortcutCats = SHORTCUTS.map((s) => ({
                    ...s,
                    cat: (restaurantMenu as any[]).find((c: any) => norm(c.name).includes(s.match)),
                  })).filter((s) => s.cat);
                  if (shortcutCats.length === 0) return null;
                  return (
                    <div className="px-6 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                      <button
                        type="button"
                        onClick={() => setMenuCategory('ALL')}
                        title="Mostrar todas as categorias"
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                          menuCategory === 'ALL'
                            ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        Todas
                      </button>
                      {shortcutCats.map(({ key, cat }: any) => {
                        const count = (cat.products || []).length;
                        const active = menuCategory === String(cat.id);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMenuCategory(active ? 'ALL' : String(cat.id))}
                            title={`${cat.name} (${count})`}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                              active
                                ? 'bg-amber-500 text-zinc-950 shadow-xs'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            <span className="max-w-[110px] truncate">{key}</span>
                            <span
                              className={`text-[10px] font-mono tabular-nums ${
                                active ? 'text-zinc-800' : 'text-zinc-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Categorias e Produtos */}
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-5">
                  {restaurantMenu.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-400 space-y-3">
                      <UtensilsCrossed className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700" />
                      <p className="font-bold text-zinc-700 dark:text-zinc-300">Nenhum produto cadastrado</p>
                      <p className="text-[11px] max-w-xs mx-auto">
                        Cadastre seus pratos, hambúrgueres e bebidas para adicionar itens rapidamente às comandas.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setCreateFoodOpen(true)}
                        className="rounded-xl text-xs font-bold bg-amber-500 text-zinc-950 hover:bg-amber-600 cursor-pointer"
                      >
                        ＋ Cadastrar Primeira Comida
                      </Button>
                    </div>
                  ) : (
                    restaurantMenu.map((category: any) => {
                      // Atalho ativo: mostra só a categoria escolhida (a busca
                      // continua valendo dentro dela).
                      if (menuCategory !== 'ALL' && String(category.id) !== menuCategory) return null;
                      const filteredProducts = (category.products || []).filter((p: any) => {
                        if (!menuSearch.trim()) return true;
                        return p.name.toLowerCase().includes(menuSearch.toLowerCase());
                      });

                      if (filteredProducts.length === 0) return null;

                      return (
                        <div key={category.id} className="space-y-2.5">
                          <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                            <span>{category.name}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">({filteredProducts.length})</span>
                          </h4>

                          <div className="grid grid-cols-2 gap-2.5">
                            {filteredProducts.map((product: any) => {
                              const isAddedJustNow = addedItemFeedback === product.id;
                              const hasModifiers = (product.modifierGroups || []).length > 0;
                              const selectedQty = Number(selectedLaunchItems[String(product.id)] || 0);

                              return (
                                <div
                                  key={product.id}
                                  className={`p-3 rounded-2xl border bg-zinc-50/70 dark:bg-zinc-800/50 flex flex-col justify-between transition shadow-2xs ${
                                    selectedQty > 0
                                      ? 'border-amber-400 dark:border-amber-500/60 ring-2 ring-amber-400/25'
                                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                                  }`}
                                >
                                  <div
                                    onClick={() => {
                                      if (hasModifiers) handleStartCustomize(product);
                                    }}
                                    className={hasModifiers ? 'cursor-pointer group' : ''}
                                  >
                                    <div className="flex items-start gap-2.5">
                                      {product.imageUrl && (
                                        <img
                                          src={product.imageUrl}
                                          alt={product.name}
                                          className="w-11 h-11 rounded-xl object-cover shrink-0 border border-zinc-200 dark:border-zinc-700"
                                        />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold text-zinc-900 dark:text-white leading-tight group-hover:text-amber-600 transition-colors">
                                          {product.name}
                                        </div>
                                        {selectedLaunchNotes[String(product.id)] ? (
                                          <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 truncate mt-0.5">
                                            📝 {selectedLaunchNotes[String(product.id)]}
                                          </div>
                                        ) : null}
                                        <div className="text-xs font-black text-zinc-950 dark:text-white mt-1">
                                          {((product.salePriceCents || 0) / 100).toLocaleString('pt-BR', {
                                            style: 'currency',
                                            currency: 'BRL',
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                    {hasModifiers && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 mt-1">
                                        <span>⚙️ Opções & Ponto</span>
                                      </span>
                                    )}
                                  </div>

                                   <div className="mt-3 flex items-center gap-1.5">
                                     <Button
                                       size="sm"
                                       variant="outline"
                                       onClick={() => handleStartCustomize(product)}
                                       className="h-8 flex-1 rounded-xl text-[11px] font-bold border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 cursor-pointer flex items-center justify-center gap-1"
                                     >
                                       {hasModifiers ? 'Opções' : '＋ Obs'}
                                     </Button>

                                     {hasModifiers ? (
                                       /* Com modificadores não dá para pré-selecionar:
                                          o ponto/molho muda o preço e precisa ser
                                          escolhido antes. Vai direto para opções. */
                                       <Button
                                         size="sm"
                                         onClick={() => handleStartCustomize(product)}
                                         disabled={addOrderItemMutation.isPending}
                                         title="Personalizar opções (ponto, molho, adicionais)"
                                         className={`h-8 w-10 shrink-0 rounded-xl font-black text-sm flex items-center justify-center transition cursor-pointer shadow-xs ${
                                           isAddedJustNow
                                             ? 'bg-emerald-600 text-white'
                                             : 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:opacity-90 active:scale-[0.96]'
                                         }`}
                                       >
                                         {isAddedJustNow ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                       </Button>
                                     ) : selectedQty > 0 ? (
                                       /* Já na seleção: stepper para ajustar quantidade.
                                          Alvos generosos para uso com uma mão. */
                                       <div className="flex items-center gap-1 shrink-0">
                                         <button
                                           type="button"
                                           onClick={() => setLaunchQty(product.id, selectedQty - 1)}
                                           aria-label={`Diminuir ${product.name}`}
                                           className="h-8 w-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer"
                                         >
                                           <Minus className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-200" />
                                         </button>
                                         <span className="w-7 text-center text-xs font-black tabular-nums text-zinc-950 dark:text-white">
                                           {selectedQty}
                                         </span>
                                         <button
                                           type="button"
                                           onClick={() => setLaunchQty(product.id, selectedQty + 1)}
                                           aria-label={`Aumentar ${product.name}`}
                                           className="h-8 w-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer"
                                         >
                                           <Plus className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-200" />
                                         </button>
                                       </div>
                                     ) : (
                                       <Button
                                         size="sm"
                                         onClick={() => setLaunchQty(product.id, 1)}
                                         disabled={addOrderItemMutation.isPending}
                                         title="Selecionar para lançar"
                                         className={`h-8 w-10 shrink-0 rounded-xl font-black text-sm flex items-center justify-center transition cursor-pointer shadow-xs ${
                                           isAddedJustNow
                                             ? 'bg-emerald-600 text-white'
                                             : 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:opacity-90 active:scale-[0.96]'
                                         }`}
                                       >
                                         {isAddedJustNow ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                       </Button>
                                     )}
                                   </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Barra inferior: lançar lote e voltar à comanda */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  {/* Lançar em lote — aparece só quando há itens selecionados.
                      Fica ACIMA de "Ver Comanda", como pedido: o garçom monta a
                      seleção da mesa inteira e lança tudo de uma vez. */}
                  {launchSelection.length > 0 && (
                    <Button
                      onClick={() => setIsBatchLaunchOpen(true)}
                      disabled={addOrderItemMutation.isPending}
                      className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black text-sm uppercase tracking-wider flex items-center justify-between px-4 shadow-md active:scale-[0.98] transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5" />
                        <span>Lançar ({launchSelection.length})</span>
                      </span>
                      <span className="tabular-nums">
                        {(launchSelectionTotal / 100).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </Button>
                  )}

                  <Button
                    onClick={() => setSheetView('MAIN')}
                    className="w-full h-11 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs cursor-pointer"
                  >
                    Ver Comanda da Mesa
                  </Button>
                </div>
              </div>
            )}

            {/* ─── TELA: PERSONALIZAR ITEM (Ponto da Carne, Molhos, Adicionais) ─── */}
            {sheetView === 'CUSTOMIZE_ITEM' && customizingProduct && (
              <div className="flex flex-col h-full max-h-[85vh]">
                {/* Header */}
                <div className="px-6 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <button
                    onClick={() => setSheetView('ADD_ITEM')}
                    className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white hover:opacity-80 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar ao cardápio</span>
                  </button>
                  <span className="text-xs font-bold text-zinc-400">
                    Mesa {selectedTable.number}
                  </span>
                </div>

                {/* Produto selecionado */}
                <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-zinc-950 dark:text-white">{customizingProduct.name}</h3>
                    {customizingProduct.description && (
                      <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">{customizingProduct.description}</p>
                    )}
                  </div>
                  <div className="text-sm font-black text-zinc-950 dark:text-white">
                    {((customizingProduct.salePriceCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>

                {/* Grupos de Modificadores */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                  {(customizingProduct.modifierGroups || []).map((group: any) => {
                    const isSingle = group.maxSelectable === 1;
                    return (
                      <div key={group.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                            {group.name}
                          </label>
                          {group.isRequired ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                              Obrigatório
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400">
                              Até {group.maxSelectable} {group.maxSelectable === 1 ? 'opção' : 'opções'}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(group.items || []).map((item: any) => {
                            const isSelected = selectedModifierIds.includes(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  if (isSingle) {
                                    const otherGroupItemIds = (group.items || []).map((gi: any) => gi.id);
                                    setSelectedModifierIds(prev => [
                                      ...prev.filter(id => !otherGroupItemIds.includes(id)),
                                      item.id,
                                    ]);
                                  } else {
                                    if (isSelected) {
                                      setSelectedModifierIds(prev => prev.filter(id => id !== item.id));
                                    } else {
                                      const currentSelectedInGroup = selectedModifierIds.filter(id =>
                                        (group.items || []).some((gi: any) => gi.id === id)
                                      );
                                      if (currentSelectedInGroup.length < group.maxSelectable) {
                                        setSelectedModifierIds(prev => [...prev, item.id]);
                                      } else {
                                        toast.info(`Você já selecionou o limite de ${group.maxSelectable} opções.`);
                                      }
                                    }
                                  }
                                }}
                                className={`p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white shadow-xs font-bold'
                                    : 'bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:border-zinc-400'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                                    isSelected
                                      ? 'border-white dark:border-zinc-950 bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white'
                                      : 'border-zinc-300 dark:border-zinc-600'
                                  }`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-zinc-950 dark:bg-white" />}
                                  </div>
                                  <span className="text-xs">{item.name}</span>
                                </div>
                                {item.priceCents > 0 && (
                                  <span className={`text-[11px] font-bold ${isSelected ? 'text-amber-300 dark:text-amber-600' : 'text-zinc-500'}`}>
                                    + {(item.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Observações do item com Atalhos Rápidos */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>📝 Observações do Item</span>
                      </label>
                      <span className="text-[10px] text-zinc-400">Atalhos rápidos</span>
                    </div>

                    {/* Chips de Atalhos Rápidos */}
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_OBSERVATIONS.map((chip) => {
                        const isSelected = customizingNotes
                          .split(',')
                          .map((s) => s.trim())
                          .includes(chip);
                        return (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => toggleObservationChip(chip)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-2xs'
                                : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-amber-400'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {chip}
                          </button>
                        );
                      })}
                    </div>

                    <Input
                      placeholder="Ou digite instruções personalizadas (ex: sem sal, bem quente)..."
                      value={customizingNotes}
                      onChange={(e) => setCustomizingNotes(e.target.value)}
                      className="h-10 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                    />
                  </div>

                  {/* Quantidade — antes era fixo em 1 e obrigava a lançar
                      várias vezes o mesmo item para uma mesa com mais pessoas. */}
                  <div>
                    <span className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wide">
                      Quantidade
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomizingQuantity((q) => Math.max(1, q - 1))}
                        disabled={customizingQuantity <= 1}
                        aria-label="Diminuir quantidade"
                        className="h-12 w-12 shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer disabled:opacity-40"
                      >
                        <Minus className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
                      </button>
                      <div className="flex-1 h-12 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center">
                        <span className="text-lg font-black text-zinc-950 dark:text-white tabular-nums">
                          {customizingQuantity}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCustomizingQuantity((q) => Math.min(99, q + 1))}
                        disabled={customizingQuantity >= 99}
                        aria-label="Aumentar quantidade"
                        className="h-12 w-12 shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer disabled:opacity-40"
                      >
                        <Plus className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer: lança direto ou joga no lote com a obs */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!customizingProduct) return;
                      // Guarda no lote SEM lançar: o garçom monta a mesa inteira
                      // (inclusive com obs) e lança tudo de uma vez.
                      setLaunchQty(customizingProduct.id, customizingQuantity);
                      const obs = customizingNotes.trim();
                      setSelectedLaunchNotes((prev) => {
                        const next = { ...prev };
                        if (obs) next[String(customizingProduct.id)] = obs;
                        else delete next[String(customizingProduct.id)];
                        return next;
                      });
                      setCustomizingQuantity(1);
                      setCustomizingNotes('');
                      setSheetView('ADD_ITEM');
                      toast.success(
                        obs
                          ? 'Item com obs guardado no lote!'
                          : 'Item guardado no lote!',
                      );
                    }}
                    className="w-full h-12 rounded-2xl border-amber-400 dark:border-amber-500/60 text-amber-700 dark:text-amber-400 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>＋ Lote (lançar junto)</span>
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedTable || !customizingProduct) return;
                      if (launchingRef.current || addOrderItemMutation.isPending) return;
                      launchingRef.current = true;
                      const modifiersPayload = selectedModifierIds.map(id => ({ modifierItemId: id }));
                      setAddedItemFeedback(customizingProduct.id);
                      addOrderItemMutation.mutate(
                        {
                          tableId: selectedTable.id,
                          productId: customizingProduct.id,
                          quantity: customizingQuantity,
                          modifiers: modifiersPayload,
                          notes: customizingNotes.trim() || undefined,
                        },
                        {
                          onSuccess: () => {
                            // Lançou: volta para a lista de produtos para seguir anotando.
                            setCustomizingQuantity(1);
                            setCustomizingNotes('');
                            // Sai da seleção do lote: senão o "Lançar (N)" mandava
                            // este mesmo produto DE NOVO (duplicado na comanda).
                            setLaunchQty(customizingProduct.id, 0);
                            setSheetView('ADD_ITEM');
                          },
                          onSettled: () => {
                            launchingRef.current = false;
                          },
                        },
                      );
                    }}
                    disabled={addOrderItemMutation.isPending}
                    className="w-full h-12 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{addOrderItemMutation.isPending ? 'Lançando...' : 'Confirmar'}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* ─── TELA 4: TRANSFERIR MESA (⇄ Transferir) ─── */}
            {sheetView === 'TRANSFER' && (
              <div className="p-6 space-y-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSheetView('MAIN')}
                    className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Transferir Mesa {selectedTable.number}</span>
                  </button>
                  <X className="w-5 h-5 text-zinc-400 cursor-pointer" onClick={() => setSelectedTable(null)} />
                </div>

                <p className="text-xs text-zinc-500">
                  Selecione a mesa livre de destino para onde toda a comanda será transferida:
                </p>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {tables.filter((t: any) => t.status !== 'OCCUPIED' && t.id !== selectedTable.id).length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-400">
                      Não há mesas livres disponíveis para transferência no momento.
                    </div>
                  ) : (
                    tables
                      .filter((t: any) => t.status !== 'OCCUPIED' && t.id !== selectedTable.id)
                      .map((freeT: any) => (
                        <button
                          key={freeT.id}
                          onClick={() => {
                            if (window.confirm(`Transferir toda a comanda da Mesa ${selectedTable.number} para a Mesa ${freeT.number}?`)) {
                              transferTableMutation.mutate({
                                fromTableId: selectedTable.id,
                                toTableId: freeT.id,
                              });
                            }
                          }}
                          className="w-full p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-between transition cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-black text-sm flex items-center justify-center border border-emerald-500/40">
                              {freeT.number}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                                {freeT.label || `Mesa ${freeT.number}`}
                              </div>
                              <div className="text-[10px] text-emerald-600 font-semibold">Livre</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        </button>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* ─── TELA 5: DIVIDIR CONTA (÷ Dividir) ─── */}
            {sheetView === 'DIVIDE' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSheetView('MAIN')}
                    className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Dividir Conta • Mesa {selectedTable.number}</span>
                  </button>
                  <X className="w-5 h-5 text-zinc-400 cursor-pointer" onClick={() => setSelectedTable(null)} />
                </div>

                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-center space-y-1">
                  <div className="text-xs text-zinc-500 font-bold">Total da Comanda</div>
                  <div className="text-3xl font-black text-zinc-950 dark:text-white">
                    {(((sessionData?.session?.totalCents || selectedTable.sessionTotalCents || 0)) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block text-center">
                    Dividir entre quantas pessoas?
                  </label>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setSplitPeople((p) => Math.max(2, p - 1))}
                      className="w-10 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 text-base font-bold flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-xl font-black text-zinc-900 dark:text-white min-w-[100px] text-center">
                      {splitPeople} pessoas
                    </span>
                    <button
                      onClick={() => setSplitPeople((p) => p + 1)}
                      className="w-10 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 text-base font-bold flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Resultado por pessoa */}
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200">Cada pessoa paga:</div>
                  <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
                    {(
                      ((sessionData?.session?.totalCents || selectedTable.sessionTotalCents || 0) / splitPeople) /
                      100
                    ).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </div>
                </div>

                <Button
                  onClick={() => {
                    const total = (((sessionData?.session?.totalCents || selectedTable.sessionTotalCents || 0)) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const part = ((((sessionData?.session?.totalCents || selectedTable.sessionTotalCents || 0) / splitPeople)) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    copyToClipboard(
                      `Mesa ${selectedTable.number}:\nTotal da Conta: ${total}\nDividido em ${splitPeople} pessoas: ${part} por pessoa.`,
                      'Cálculo copiado para compartilhar!',
                    );
                  }}
                  className="w-full h-11 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs cursor-pointer"
                >
                  Copiar Divisão (WhatsApp)
                </Button>
              </div>
            )}

            {/* ─── TELA 6: EDITAR MESA (⚙️ Editar Mesa) ─── */}
            {sheetView === 'EDIT_TABLE' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSheetView('MAIN')}
                    className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Editar Mesa {selectedTable.number}</span>
                  </button>
                  <X className="w-5 h-5 text-zinc-400 cursor-pointer" onClick={() => setSelectedTable(null)} />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const num = parseInt(editTableNumber, 10);
                    if (isNaN(num) || num <= 0) return toast.error('Número de mesa inválido');
                    updateTableMutation.mutate({
                      tableId: selectedTable.id,
                      data: { number: num, label: editTableLabel.trim() || undefined },
                    });
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Número da Mesa *
                    </label>
                    <Input
                      type="number"
                      value={editTableNumber}
                      onChange={(e) => setEditTableNumber(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Nome / Identificação (Opcional)
                    </label>
                    <Input
                      value={editTableLabel}
                      onChange={(e) => setEditTableLabel(e.target.value)}
                      placeholder="Ex: Varanda, Janela, Salão"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={updateTableMutation.isPending}
                    className="w-full h-11 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs cursor-pointer"
                  >
                    Salvar Alterações
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL DE CONFIGURAÇÕES & GERENCIAMENTO DE MESAS (EXCLUSIVO PARA EXCLUSÃO E GESTÃO) ─── */}
      <Dialog open={manageTablesOpen} onOpenChange={setManageTablesOpen}>
        <DialogContent className="sm:max-w-xl bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[85vh] flex flex-col font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Configurações & Gestão de Mesas do Salão
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Gerencie a capacidade, status ou remova mesas livres do salão com segurança.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
            {tables.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                Nenhuma mesa cadastrada no momento.
              </div>
            ) : (
              tables.map((t: any) => {
                const isOccupied = t.status === 'OCCUPIED';
                return (
                  <div
                    key={t.id}
                    className="p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center border ${
                        isOccupied
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {t.number}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900 dark:text-white">
                          {t.label || `Mesa ${String(t.number).padStart(2, '0')}`}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                          <span>Capacidade: {t.capacity || 4} pessoas</span>
                          <span>•</span>
                          <span className={isOccupied ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                            {isOccupied ? (t.comandaName || 'Ocupada') : 'Livre'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isOccupied ? (
                        <span className="text-[11px] font-semibold text-zinc-400 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                          Em Atendimento
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Tem certeza que deseja remover a Mesa ${t.number} do salão?`)) {
                              deleteTableMutation.mutate(t.id);
                            }
                          }}
                          disabled={deleteTableMutation.isPending}
                          className="h-8 px-3 text-xs font-bold text-rose-600 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer rounded-xl"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Excluir Mesa
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setManageTablesOpen(false);
                setSetupWizardOpen(true);
              }}
              className="rounded-xl text-xs font-bold border-zinc-200 dark:border-zinc-700 cursor-pointer"
            >
              Configurar em Lote (Assistente)
            </Button>
            <Button
              type="button"
              onClick={() => setManageTablesOpen(false)}
              className="rounded-xl text-xs font-bold bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 cursor-pointer"
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal: Adicionar Nova Mesa Avulsa */}
      <Dialog open={addTableOpen} onOpenChange={setAddTableOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              Adicionar Nova Mesa
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              O sistema gera automaticamente o quadradinho no salão e o QR Code exclusivo desta mesa.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddTable} className="space-y-3.5 mt-3">
            <div>
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block mb-1">
                Número da Mesa *
              </label>
              <Input
                type="number"
                placeholder="Ex: 11"
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                className="h-10 text-xs font-medium rounded-xl bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block mb-1">
                Nome / Identificação do Salão (Opcional)
              </label>
              <Input
                placeholder="Ex: Varanda, Salão Nobre, Janela"
                value={newTableLabel}
                onChange={(e) => setNewTableLabel(e.target.value)}
                className="h-10 text-xs font-medium rounded-xl bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddTableOpen(false)}
                className="h-9 text-xs rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createTableMutation.isPending}
                className="h-9 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 rounded-xl"
              >
                Criar Mesa & Gerar QR
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Visualizar / Imprimir QR Code da Mesa */}
      <Dialog open={!!qrModalTable} onOpenChange={(open) => !open && setQrModalTable(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-200 dark:border-zinc-800 text-center font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 dark:text-white text-center">
              QR Code de Autoatendimento
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
              {qrModalTable?.label || `Mesa ${qrModalTable?.number}`} — O cliente escaneia com a câmera do celular e faz pedidos direto na mesa.
            </DialogDescription>
          </DialogHeader>

          {qrModalTable && (
            <div className="py-4 flex flex-col items-center justify-center space-y-4">
              {/* QR Code Imagem de Alta Qualidade */}
              <div className="p-4 bg-white rounded-2xl border-2 border-zinc-900 shadow-md">
                {/* Gerado localmente: o QR da mesa precisa ser impresso/aberto
                    mesmo com a internet do balcão fora, e um serviço de
                    terceiros não tem como responder na hora da impressão. */}
                <div
                  className="[&>svg]:w-48 [&>svg]:h-48 [&>svg]:rounded-lg"
                  dangerouslySetInnerHTML={{
                    __html:
                      qrToSvg(`${window.location.origin}/q/${qrModalTable.qrToken || qrModalTable.id}`, {
                        size: 200,
                        margin: 2,
                      }) ?? '',
                  }}
                />
              </div>

              <div className="text-center space-y-1">
                <div className="text-base font-black text-zinc-900 dark:text-white">{qrModalTable.label || `Mesa ${qrModalTable.number}`}</div>
                <div className="text-[11px] text-zinc-500 break-all px-4 font-mono">
                  {window.location.origin}/q/{qrModalTable.qrToken || '...'}
                </div>
              </div>

              <div className="flex items-center gap-2 w-full pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(
                      `${window.location.origin}/q/${qrModalTable.qrToken || qrModalTable.id}`,
                      'Link do cardápio copiado!',
                    )
                  }
                  className="flex-1 h-9 text-xs rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link
                </Button>

                <Button
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/q/${qrModalTable.qrToken || qrModalTable.id}`,
                      '_blank',
                    )
                  }
                  className="flex-1 h-9 text-xs rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Como Cliente
                </Button>
              </div>

              <button
                onClick={() => rotateQrMutation.mutate(qrModalTable.id)}
                disabled={rotateQrMutation.isPending}
                className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer pt-2"
              >
                <RotateCcw className="w-3 h-3" />
                Rotacionar e gerar novo QR code (invalida o papel atual)
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Device Token Gerado para Tablet Fixo */}
      <Dialog open={!!pairedDeviceData} onOpenChange={(open) => !open && setPairedDeviceData(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-200 dark:border-zinc-800 font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Tablet className="w-5 h-5 text-indigo-600" />
              Tablet Pareado com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {pairedDeviceData?.tableName} — Este dispositivo opera como Kiosk fixo na mesa, sem login de usuário.
            </DialogDescription>
          </DialogHeader>

          {pairedDeviceData && (
            <div className="py-3 space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800 text-xs">
                <span className="text-indigo-900 dark:text-indigo-200 font-bold block mb-1">
                  Link de Acesso Permanente do Tablet:
                </span>
                <div className="p-2 bg-white dark:bg-zinc-950 rounded-xl border border-indigo-200 dark:border-indigo-800 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 break-all select-all">
                  {pairedDeviceData.tabletUrl}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
                <p className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Como usar no Tablet físico:
                </p>
                <p>1. Abra o navegador no tablet da mesa e cole este link.</p>
                <p>2. Adicione à tela inicial para entrar em tela cheia (Modo Kiosk).</p>
                <p>3. O tablet fica permanentemente vinculado a esta mesa.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(pairedDeviceData.tabletUrl, 'Link do tablet copiado!')
                  }
                  className="flex-1 h-9 text-xs rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link
                </Button>

                <Button
                  size="sm"
                  onClick={() => window.open(pairedDeviceData.tabletUrl, '_blank')}
                  className="flex-1 h-9 text-xs rounded-xl font-bold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Tablet Agora
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assistente de Configuração do Salão */}
      <OnboardingSetupWizard
        isOpen={setupWizardOpen}
        onClose={() => setSetupWizardOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Modal de Criação Rápida de Comidas com Ponto e Molhos */}
      <CreateFoodProductDialog
        open={createFoodOpen}
        onOpenChange={setCreateFoodOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
          queryClient.invalidateQueries({ queryKey: ['pos-products'] });
        }}
      />

      {/* ─── Modal de abertura de mesa ───────────────────────────────────────
          Aparece ao tocar numa mesa livre (ou no botão "Abrir mesa" do bottom
          sheet). Nada é gravado até confirmar: cancelar, fechar ou Esc deixam
          a mesa exatamente como estava. */}
      <Dialog
        open={Boolean(openComandaTable)}
        onOpenChange={(open) => {
          if (!open && !openSessionMutation.isPending) {
            setOpenComandaTable(null);
            setComandaName('');
            setComandaNameError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Abrir mesa {openComandaTable?.label ? `- ${openComandaTable.label}` : ''}
            </DialogTitle>
            <DialogDescription>
              Informe o nome da comanda para vincular a esta mesa. A mesa passa a
              aparecer como ocupada no mapa.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmOpenComanda();
            }}
            className="space-y-2"
          >
            <label
              htmlFor="comanda-name"
              className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wide"
            >
              Nome da comanda
            </label>
            <Input
              id="comanda-name"
              value={comandaName}
              autoFocus
              placeholder="Ex: Mesa do João, Aniversário, Balcão 3"
              aria-invalid={Boolean(comandaNameError)}
              aria-describedby={comandaNameError ? 'comanda-name-error' : undefined}
              onChange={(e) => {
                setComandaName(e.target.value);
                if (comandaNameError) setComandaNameError(null);
              }}
              className={`h-11 ${
                comandaNameError ? 'border-rose-500 focus-visible:ring-rose-500' : ''
              }`}
            />
            {comandaNameError && (
              <p
                id="comanda-name-error"
                role="alert"
                className="text-[11px] font-bold text-rose-600 dark:text-rose-400"
              >
                {comandaNameError}
              </p>
            )}

            <DialogFooter className="gap-2 pt-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={openSessionMutation.isPending}
                onClick={() => {
                  setOpenComandaTable(null);
                  setComandaName('');
                  setComandaNameError(null);
                }}
                className="h-10 rounded-xl font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={openSessionMutation.isPending}
                className="h-10 rounded-xl font-black bg-zinc-950 dark:bg-white text-white dark:text-zinc-950"
              >
                {openSessionMutation.isPending ? 'Abrindo...' : 'Confirmar abertura'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* ─── Recibo do fechamento da comanda ─────────────────────────────────
          Aparece sozinho ao encerrar a mesa, com todos os itens e o valor a
          pagar. Dá para imprimir, compartilhar, baixar ou só fechar. */}
      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title="Fechamento da comanda"
        storeName={(tenant as any)?.companyName || (tenant as any)?.tradeName}
        storeInfo={[
          (tenant as any)?.cnpj ? `CNPJ: ${(tenant as any).cnpj}` : '',
          (tenant as any)?.address || '',
        ].filter(Boolean)}
        reference={
          closedReceipt
            ? `${closedReceipt.tableLabel || 'Mesa'}${
                closedReceipt.orderNumbers?.length
                  ? ` · Pedido ${closedReceipt.orderNumbers
                      .map((n: any) => `#${n}`)
                      .join(', ')}`
                  : ''
              }`
            : ''
        }
        createdAt={closedReceipt?.closedAt}
        items={closedReceipt?.items || []}
        subtotalCents={closedReceipt?.subtotalCents || 0}
        discountCents={closedReceipt?.discountCents || 0}
        tipCents={closedReceipt?.tip?.paidCents || 0}
        totalCents={closedReceipt?.totalCents || 0}
        paymentMethod={closedReceipt?.paymentMethods?.join(' + ') || null}
        extraRows={[
          {
            label: 'Aberta em',
            value: closedReceipt?.openedAt
              ? new Date(closedReceipt.openedAt).toLocaleString('pt-BR')
              : '-',
          },
          {
            label: 'Operador',
            value: currentUser?.name || 'Não identificado',
          },
        ]}
        closeLabel="Fechar e voltar ao salão"
      />

      {/* ─── CONFIRMAÇÃO DO LOTE ───
          Lista tudo que vai para a mesa antes de enviar à cozinha. Antes o
          garçom lançava item por item sem revisão e sem poder corrigir. */}
      <Dialog
        open={isBatchLaunchOpen}
        onOpenChange={(open) => {
          if (!open && !launchBatchMutation.isPending) setIsBatchLaunchOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Confirmar lançamento
            </DialogTitle>
            <DialogDescription>
              {launchSelection.length} item(ns) para{' '}
              <strong>
                {selectedTable?.label || `Mesa ${selectedTable?.number}`}
              </strong>
              . Confira antes de enviar para a cozinha.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[45vh] overflow-y-auto space-y-2">
            {launchSelection.map(({ product, quantity, notes }) => (
              <div
                key={String(product.id)}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-black text-zinc-950 dark:text-white truncate">
                    {product.name}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {((product.salePriceCents || 0) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}{' '}
                    cada
                  </p>
                  {notes ? (
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 truncate mt-0.5">
                      📝 Obs: {notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-black tabular-nums">
                    {quantity}x
                  </span>
                  <span className="text-xs font-black text-zinc-950 dark:text-white tabular-nums">
                    {(((product.salePriceCents || 0) * quantity) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-1 pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              Total do lote
            </span>
            <span className="text-lg font-black text-zinc-950 dark:text-white">
              {(launchSelectionTotal / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsBatchLaunchOpen(false)}
              disabled={launchBatchMutation.isPending}
              className="w-full sm:w-auto h-12 rounded-2xl"
            >
              Revisar
            </Button>
            <Button
              onClick={() => {
                if (!selectedTable || launchSelection.length === 0) return;
                launchBatchMutation.mutate({
                  tableId: selectedTable.id,
                  // Passa pelo helper testado: garante o formato do payload.
                  items: toLaunchPayload(launchSelection),
                });
              }}
              disabled={launchBatchMutation.isPending}
              className="w-full sm:flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider"
            >
              {launchBatchMutation.isPending ? 'Lançando...' : 'Confirmar e lançar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── REMOVER ITEM JÁ LANÇADO ─── */}
      <Dialog
        open={Boolean(removingItem)}
        onOpenChange={(open) => {
          if (!open && !removeOrderItemMutation.isPending) setRemovingItem(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" />
              Remover item?
            </DialogTitle>
            <DialogDescription>
              {removingItem?.name} será retirado da comanda.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setRemovingItem(null)}
              disabled={removeOrderItemMutation.isPending}
              className="w-full sm:w-auto h-12 rounded-2xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!removingItem) return;
                removeOrderItemMutation.mutate(
                  { orderId: removingItem.orderId, itemId: removingItem.itemId },
                  { onSuccess: () => setRemovingItem(null) },
                );
              }}
              disabled={removeOrderItemMutation.isPending}
              className="w-full sm:flex-1 h-12 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider"
            >
              {removeOrderItemMutation.isPending ? 'Removendo...' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── EDITAR QUANTIDADE DE ITEM JÁ LANÇADO ─── */}
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => {
          if (!open && !updateOrderItemMutation.isPending) setEditingItem(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              Ajustar quantidade
            </DialogTitle>
            <DialogDescription className="truncate">
              {editingItem?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingQuantity((q) => Math.max(1, q - 1))}
              disabled={editingQuantity <= 1}
              aria-label="Diminuir quantidade"
              className="h-14 w-14 shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer disabled:opacity-40"
            >
              <Minus className="w-5 h-5" />
            </button>
            <div className="flex-1 h-14 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center">
              <span className="text-xl font-black tabular-nums">{editingQuantity}</span>
            </div>
            <button
              type="button"
              onClick={() => setEditingQuantity((q) => Math.min(99, q + 1))}
              disabled={editingQuantity >= 99}
              aria-label="Aumentar quantidade"
              className="h-14 w-14 shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingItem(null)}
              disabled={updateOrderItemMutation.isPending}
              className="w-full sm:w-auto h-12 rounded-2xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editingItem) return;
                updateOrderItemMutation.mutate(
                  {
                    orderId: editingItem.orderId,
                    itemId: editingItem.itemId,
                    quantity: editingQuantity,
                  },
                  { onSuccess: () => setEditingItem(null) },
                );
              }}
              disabled={updateOrderItemMutation.isPending}
              className="w-full sm:flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider"
            >
              {updateOrderItemMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CONFIRMAÇÃO ANTES DE FECHAR O PEDIDO ───
          Evita encerrar a comanda por toque acidental. Mostra mesa + total e
          só avança para a forma de pagamento após confirmar. */}
      <Dialog open={confirmCloseOpen} onOpenChange={(open) => !closeSessionMutation.isPending && setConfirmCloseOpen(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Fechar pedido?
            </DialogTitle>
            <DialogDescription>
              Esta ação vai encerrar a comanda e liberar a mesa. Confira antes de continuar.
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-500 uppercase tracking-wider">Mesa</span>
                <span className="font-black text-zinc-950 dark:text-white">
                  {selectedTable.label || `Mesa ${selectedTable.number}`}
                  {selectedTable.comandaName ? ` • ${selectedTable.comandaName}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-500 uppercase tracking-wider">Itens</span>
                <span className="font-black tabular-nums">
                  {(sessionData as any)?.session?.rawOrders?.reduce(
                    (acc: number, o: any) => acc + (o.items?.length || 0),
                    0,
                  ) || 0}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total</span>
                <span className="text-xl font-black text-zinc-950 dark:text-white">
                  {(currentTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmCloseOpen(false)}
              disabled={closeSessionMutation.isPending}
              className="w-full sm:w-auto h-12 rounded-2xl"
            >
              Revisar comanda
            </Button>
            <Button
              onClick={() => {
                setConfirmCloseOpen(false);
                setPaymentModalOpen(true);
              }}
              disabled={!selectedTable || currentTotalCents <= 0}
              className="w-full sm:flex-1 h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black text-xs uppercase tracking-wider"
            >
              <Wallet className="w-4 h-4" />
              Forma de pagamento
            </Button>
          </DialogFooter>
          {selectedTable && currentTotalCents <= 0 && (
            <p className="text-[11px] text-center font-bold text-rose-600">
              Comanda sem valor — lance ao menos 1 item antes de fechar.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── FORMA DE PAGAMENTO (antes de imprimir) ───
          Cartão Crédito / Débito e PIX. O PIX gera o QR sozinho com o valor
          exato via GET /restaurant/tables/:id/pix-charge (chave cadastrada em
          Configurações → Pagamentos & PIX). Só após confirmar o pagamento a
          comanda é encerrada e o recibo/impressão aparece. */}
      <Dialog open={paymentModalOpen} onOpenChange={(open) => !closeSessionMutation.isPending && setPaymentModalOpen(open)}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Forma de pagamento
            </DialogTitle>
            <DialogDescription>
              {selectedTable?.label || (selectedTable ? `Mesa ${selectedTable.number}` : '')} • Total{' '}
              <strong className="text-zinc-950 dark:text-white">
                {(currentTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'PIX', label: 'PIX (QR Code)', icon: QrCode },
                { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard },
                { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
                { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`p-3 rounded-2xl border text-xs font-black flex items-center gap-2 transition cursor-pointer ${
                    active
                      ? 'border-zinc-950 dark:border-white bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md'
                      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* PIX: QR gerado sozinho */}
          {paymentMethod === 'PIX' && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 text-center space-y-3">
              {isLoadingPix ? (
                <div className="py-6 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  Gerando QR Code com o valor da conta...
                </div>
              ) : pixCharge?.available && pixCharge?.payload ? (
                <>
                  <div
                    className="p-3 bg-white rounded-2xl border border-emerald-200 inline-block shadow-sm [&>svg]:w-48 [&>svg]:h-48 [&>svg]:rounded-lg [&>svg]:mx-auto"
                    // QR gerado localmente (sem internet, sem serviço externo):
                    // o balcão precisa funcionar com a rede caída, e mandar a
                    // chave/cobrança do cliente para um terceiro é inaceitável.
                    // A matriz é equivalente byte a byte à da biblioteca de
                    // referência (ver qr-equivalence.spec.ts).
                    dangerouslySetInnerHTML={{
                      __html: qrToSvg(pixCharge.payload, { size: 200, margin: 4 }) ?? '',
                    }}
                  />
                  <div className="text-xs font-black text-emerald-900 dark:text-emerald-100">
                    {(pixCharge.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    {pixCharge.receiverName ? ` • ${pixCharge.receiverName}` : ''}
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      PIX copia e cola
                    </span>
                    <div className="mt-1 p-2 bg-white dark:bg-zinc-900 rounded-xl border border-emerald-200 dark:border-emerald-800 font-mono text-[10px] break-all text-zinc-700 dark:text-zinc-200 max-h-20 overflow-y-auto select-all">
                      {pixCharge.payload}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(pixCharge.payload, 'Código PIX copiado!')}
                      className="mt-2 w-full h-9 text-xs font-bold rounded-xl border-emerald-300"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copiar código PIX
                    </Button>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                    Cliente escaneia com o app do banco. Confirme o recebimento antes de finalizar.
                  </p>
                </>
              ) : (
                <>
                  <QrCode className="w-10 h-10 mx-auto text-emerald-700" />
                  <p className="text-xs font-bold text-emerald-900 dark:text-emerald-100">
                    {pixCharge?.reason || 'QR indisponível no momento.'}
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    Cadastre a chave em Configurações → Pagamentos &amp; PIX e tente de novo.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refetchPix()}
                      className="flex-1 h-9 text-xs font-bold rounded-xl"
                    >
                      Tentar de novo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/app/settings')}
                      className="flex-1 h-9 text-xs font-bold rounded-xl"
                    >
                      Abrir configurações
                    </Button>
                  </div>
                  {isPixError && (
                    <p className="text-[10px] text-rose-600 font-bold">Falha ao buscar a cobrança. Verifique a conexão.</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Cartão: orientação da maquininha */}
          {(paymentMethod === 'CARTAO_CREDITO' || paymentMethod === 'CARTAO_DEBITO') && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-4 text-xs space-y-1.5">
              <p className="font-black flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-zinc-700 dark:text-zinc-200" />
                {paymentMethod === 'CARTAO_CREDITO' ? 'Cartão de crédito' : 'Cartão de débito'}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                Digite o valor de {(currentTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} na
                maquininha e confirme a aprovação antes de finalizar abaixo.
              </p>
            </div>
          )}

          {/* Dinheiro: valor recebido + troco */}
          {paymentMethod === 'DINHEIRO' && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-4 space-y-3">
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-1">
                  Valor recebido (R$)
                </label>
                <Input
                  placeholder="Ex: 100,00"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="h-11 text-base font-black font-mono"
                  inputMode="decimal"
                />
              </div>
              {parseCashToCents(cashReceived) > 0 && (
                <div
                  className={`p-3 rounded-xl border flex justify-between font-black text-xs ${
                    parseCashToCents(cashReceived) >= currentTotalCents
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <span>{parseCashToCents(cashReceived) >= currentTotalCents ? 'Troco:' : 'Falta:'}</span>
                  <span className="font-mono">
                    {(
                      Math.abs(parseCashToCents(cashReceived) - currentTotalCents) / 100
                    ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-1">
              Observação (opcional)
            </label>
            <Input
              placeholder="Ex: pago metade no PIX..."
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="h-10 text-xs rounded-xl"
              maxLength={200}
            />
          </div>

          {/* 10% — caixinha separado do caixa da empresa. O consumo vai para a
              empresa; só o valor daqui entra no Caixa 10%. */}
          <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                Pagou 10%?
              </span>
              <span className="text-xs font-black text-amber-950 dark:text-amber-200">
                Sugerido:{' '}
                {(tipSuggestedCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'NONE', label: 'Não pagou' },
                  { id: 'PAID', label: 'Pagou' },
                  { id: 'OVER', label: 'Pagou a mais' },
                  { id: 'UNDER', label: 'Pagou a menos' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setTipChoice(o.id);
                    if (o.id === 'PAID') setTipPaid(fmtCentsInput(tipSuggestedCents));
                    if (o.id === 'NONE') setTipPaid('');
                  }}
                  className={`h-9 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                    tipChoice === o.id
                      ? 'bg-amber-500 border-amber-500 text-zinc-950 shadow-xs'
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-amber-400'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {tipChoice !== 'NONE' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
                    {tipChoice === 'PAID' ? 'Valor (sugerido)' : 'Valor pago (R$)'}
                  </label>
                  <Input
                    value={tipChoice === 'PAID' ? fmtCentsInput(tipSuggestedCents) : tipPaid}
                    onChange={(e) => setTipPaid(e.target.value)}
                    disabled={tipChoice === 'PAID'}
                    placeholder="Ex: 15,00"
                    inputMode="decimal"
                    className="h-10 text-sm font-black font-mono rounded-xl bg-white dark:bg-zinc-800 disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
                    Canal dos 10%
                  </label>
                  <select
                    value={tipMethod}
                    onChange={(e) => setTipMethod(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-xs font-bold"
                  >
                    <option value="PIX">Pix</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="CARTAO_CREDITO">Crédito</option>
                    <option value="CARTAO_DEBITO">Débito</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setPaymentModalOpen(false)}
              disabled={closeSessionMutation.isPending}
              className="w-full sm:w-auto h-12 rounded-2xl"
            >
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (!selectedTable) return;
                if (paymentMethod === 'DINHEIRO') {
                  const received = parseCashToCents(cashReceived);
                  if (received > 0 && received < currentTotalCents) {
                    toast.error('Valor recebido menor que o total da conta.');
                    return;
                  }
                }
                // 10%: coerência entre escolha e valor antes de avançar.
                if (tipChoice !== 'NONE') {
                  const paid = tipChoice === 'PAID' ? tipSuggestedCents : parseCashToCents(tipPaid);
                  if (paid <= 0) {
                    toast.error('Informe o valor pago de 10%.');
                    return;
                  }
                  if (tipChoice === 'OVER' && paid <= tipSuggestedCents) {
                    toast.error('Em "pagou a mais", o valor precisa ser maior que o sugerido.');
                    return;
                  }
                  if (tipChoice === 'UNDER' && (paid >= tipSuggestedCents || paid <= 0)) {
                    toast.error('Em "pagou a menos", o valor precisa ser menor que o sugerido.');
                    return;
                  }
                }
                // Não fecha direto: abre a confirmação final "já está pago?".
                setConfirmPaidOpen(true);
              }}
              disabled={
                closeSessionMutation.isPending ||
                (paymentMethod === 'PIX' && isLoadingPix) ||
                (paymentMethod === 'PIX' && pixCharge && pixCharge.available === false)
              }
              className="w-full sm:flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider"
            >
              {closeSessionMutation.isPending ? 'Fechando...' : 'Confirmar pagamento e fechar pedido'}
            </Button>
          </DialogFooter>
          {paymentMethod === 'PIX' && pixCharge && pixCharge.available === false && (
            <p className="text-[11px] text-center font-bold text-amber-700">
              Finalize em outra forma ou ajuste a chave PIX para liberar o QR.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── CONFIRMAÇÃO FINAL: "JÁ ESTÁ PAGO?" ───
          Última trava antes de encerrar: o garçom confirma que o valor entrou
          mesmo (PIX compensado, cartão aprovado, dinheiro em mãos). Só o
          "Sim, confirmo" fecha e libera a impressão. */}
      <Dialog open={confirmPaidOpen} onOpenChange={(open) => !closeSessionMutation.isPending && setConfirmPaidOpen(open)}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Tem certeza que já está pago?
            </DialogTitle>
            <DialogDescription className="text-center">
              Confira o valor e a forma antes de encerrar. Depois de fechar não dá pra desfazer.
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-4 space-y-2 text-left">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-500 uppercase tracking-wider">Mesa</span>
                <span className="font-black text-zinc-950 dark:text-white">
                  {selectedTable.label || `Mesa ${selectedTable.number}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-500 uppercase tracking-wider">Pagamento</span>
                <span className="font-black">
                  {paymentMethod === 'PIX'
                    ? 'PIX'
                    : paymentMethod === 'CARTAO_CREDITO'
                      ? 'Cartão de crédito'
                      : paymentMethod === 'CARTAO_DEBITO'
                        ? 'Cartão de débito'
                        : 'Dinheiro'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-500 uppercase tracking-wider">10% ({tipChoiceLabel})</span>
                <span className="font-black">
                  {tipChoice === 'NONE'
                    ? '—'
                    : ((tipChoice === 'PAID' ? tipSuggestedCents : parseCashToCents(tipPaid)) / 100).toLocaleString(
                        'pt-BR',
                        { style: 'currency', currency: 'BRL' },
                      )}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total</span>
                <span className="text-xl font-black text-zinc-950 dark:text-white">
                  {(currentTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              {paymentMethod === 'DINHEIRO' && parseCashToCents(cashReceived) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-500 uppercase tracking-wider">Troco</span>
                  <span className="font-black font-mono">
                    {(Math.max(0, parseCashToCents(cashReceived) - currentTotalCents) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmPaidOpen(false)}
              disabled={closeSessionMutation.isPending}
              className="w-full sm:w-auto h-12 rounded-2xl"
            >
              Ainda não
            </Button>
            <Button
              onClick={() => {
                if (!selectedTable) return;
                const tip = buildTipPayload();
                if (paymentMethod === 'DINHEIRO') {
                  const received = parseCashToCents(cashReceived);
                  closeSessionMutation.mutate({
                    tableId: selectedTable.id,
                    method: paymentMethod,
                    amountReceivedCents: received > 0 ? received : undefined,
                    notes: paymentNotes.trim() || undefined,
                    tip,
                  });
                  return;
                }
                closeSessionMutation.mutate({
                  tableId: selectedTable.id,
                  method: paymentMethod,
                  notes: paymentNotes.trim() || undefined,
                  tip,
                });
              }}
              disabled={closeSessionMutation.isPending}
              className="w-full sm:flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider"
            >
              {closeSessionMutation.isPending ? 'Fechando...' : 'Sim, confirmo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RestaurantTablesPage;

