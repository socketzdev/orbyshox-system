import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
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
  Split,
  Trash2,
  Edit3,
  Search,
  Minus,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { OnboardingSetupWizard } from '../components/onboarding-setup-wizard';
import { CreateFoodProductDialog } from '../components/create-food-product-dialog';

export const RestaurantTablesPage: React.FC = () => {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Modals state
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [createFoodOpen, setCreateFoodOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');

  // Selected table bottom sheet state
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [sheetView, setSheetView] = useState<'MAIN' | 'ADD_ITEM' | 'CUSTOMIZE_ITEM' | 'TRANSFER' | 'DIVIDE' | 'EDIT_TABLE'>('MAIN');
  const [tableCapacity, setTableCapacity] = useState<number>(4);
  const [menuSearch, setMenuSearch] = useState('');
  const [splitPeople, setSplitPeople] = useState<number>(2);
  const [editTableNumber, setEditTableNumber] = useState('');
  const [editTableLabel, setEditTableLabel] = useState('');
  const [addedItemFeedback, setAddedItemFeedback] = useState<string | null>(null);

  // Customizing product state (Ponto da Carne, molhos, opcionais)
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [customizingNotes, setCustomizingNotes] = useState('');

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
  });

  // Mutações
  const openSessionMutation = useMutation({
    mutationFn: ({ tableId, customerCount }: { tableId: string; customerCount?: number }) =>
      apiPost(`/restaurant/tables/${tableId}/open-session`, { customerCount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-session', selectedTable?.id] });
      setSelectedTable((prev: any) => (prev ? { ...prev, status: 'OCCUPIED' } : null));
      toast.success(`Mesa ${selectedTable?.number} aberta com sucesso!`);
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
    mutationFn: (tableId: string) => apiPost(`/restaurant/tables/${tableId}/close-session`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      setSelectedTable(null);
      setSheetView('MAIN');
      toast.success('Comanda encerrada e mesa liberada com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao encerrar comanda'),
  });

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
    setSelectedTable(table);
    setSheetView('MAIN');
    setTableCapacity(table.capacity || 4);
    setEditTableNumber(String(table.number));
    setEditTableLabel(table.label || '');
    setMenuSearch('');
    setCustomizingProduct(null);
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
    setCustomizingNotes('');
    setSheetView('CUSTOMIZE_ITEM');
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
  const callingTables = tables.filter((t: any) => t.hasPendingCall).length;

  // Filtragem dinâmica
  const filteredTables = useMemo(() => {
    if (statusFilter === 'FREE') return tables.filter((t: any) => t.status !== 'OCCUPIED' && !t.hasPendingCall);
    if (statusFilter === 'OCCUPIED') return tables.filter((t: any) => t.status === 'OCCUPIED');
    if (statusFilter === 'CALLING') return tables.filter((t: any) => t.hasPendingCall);
    return tables;
  }, [tables, statusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Top Header com Título & Ações Principais */}
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
        <div className="flex items-center gap-2.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
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
              bottomBadge = (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-500/40 text-rose-950 dark:text-rose-100 font-black text-[9px] truncate max-w-full">
                  {table.sessionTotalCents > 0
                    ? (table.sessionTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                    : 'Ocupada'}
                </span>
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

      {/* ─── BOTTOM SHEET NATIVO PARA MOBILE & DESKTOP ─── */}
      {selectedTable && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedTable(null);
              setSheetView('MAIN');
            }
          }}
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

                {/* Botão Principal: 🪑 ABRIR MESA */}
                <Button
                  onClick={() =>
                    openSessionMutation.mutate({
                      tableId: selectedTable.id,
                      customerCount: tableCapacity,
                    })
                  }
                  disabled={openSessionMutation.isPending}
                  className="w-full h-13 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.98] cursor-pointer"
                >
                  <span>🪑 ABRIR MESA</span>
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

                {/* Link: ⚙️ Editar mesa */}
                <div className="pt-1 text-center">
                  <button
                    onClick={() => setSheetView('EDIT_TABLE')}
                    className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center justify-center gap-1.5 mx-auto py-1 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>⚙️ Editar mesa</span>
                  </button>
                </div>
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
                    <button
                      onClick={() => setSheetView('EDIT_TABLE')}
                      title="Editar Mesa"
                      className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Substatus Bar */}
                <div className="px-6 py-2 bg-zinc-50/80 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                    <span>🔴 Ocupada • {tableCapacity} pessoas</span>
                  </div>

                  <span className="font-mono font-black text-[11px] text-zinc-500 tracking-wider">
                    COMANDA #{sessionData?.session?.id ? sessionData.session.id.slice(0, 4).toUpperCase() : '1048'}
                  </span>
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
                      {sessionData.session.aggregatedItems.map((item: any, idx: number) => (
                        <div key={idx} className="py-2.5 flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-zinc-900 dark:text-white">
                                {item.productName}
                              </span>
                              <span className="text-[11px] px-1.5 py-0.2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black">
                                {item.quantity}x
                              </span>
                            </div>
                            {item.modifiers?.length > 0 && (
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {item.modifiers.join(', ')}
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                                Obs: {item.notes}
                              </div>
                            )}
                          </div>

                          <div className="text-xs font-black text-zinc-950 dark:text-white">
                            {((item.totalPriceCents || 0) / 100).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
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

                  {/* Botão: FECHAR CONTA */}
                  <Button
                    onClick={() => closeSessionMutation.mutate(selectedTable.id)}
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
                  <Button
                    size="sm"
                    onClick={() => setCreateFoodOpen(true)}
                    className="h-10 px-3 text-xs font-black bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-xl shrink-0 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Cadastrar nova comida com pontos e molhos"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nova Comida</span>
                  </Button>
                </div>

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

                              return (
                                <div
                                  key={product.id}
                                  className="p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/50 flex flex-col justify-between hover:border-zinc-300 transition shadow-2xs"
                                >
                                  <div
                                    onClick={() => {
                                      if (hasModifiers) handleStartCustomize(product);
                                    }}
                                    className={hasModifiers ? 'cursor-pointer group' : ''}
                                  >
                                    <div className="text-xs font-bold text-zinc-900 dark:text-white leading-tight group-hover:text-amber-600 transition-colors">
                                      {product.name}
                                    </div>
                                    <div className="text-xs font-black text-zinc-950 dark:text-white mt-1">
                                      {((product.salePriceCents || 0) / 100).toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })}
                                    </div>
                                    {hasModifiers && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 mt-1">
                                        <span>⚙️ Opções & Ponto</span>
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-3 flex items-center gap-1.5">
                                    {hasModifiers && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleStartCustomize(product)}
                                        className="h-8 flex-1 rounded-xl text-[11px] font-bold border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 cursor-pointer"
                                      >
                                        Opções
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        addOrderItemMutation.mutate({
                                          tableId: selectedTable.id,
                                          productId: product.id,
                                        })
                                      }
                                      disabled={addOrderItemMutation.isPending}
                                      title={hasModifiers ? 'Adicionar rápido com opções padrão (ex: Ao Ponto)' : 'Adicionar à comanda'}
                                      className={`h-8 rounded-xl font-black text-sm flex items-center justify-center transition cursor-pointer shadow-xs ${
                                        hasModifiers ? 'w-10 shrink-0' : 'w-full'
                                      } ${
                                        isAddedJustNow
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:opacity-90 active:scale-[0.96]'
                                      }`}
                                    >
                                      {isAddedJustNow ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </Button>
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

                {/* Barra inferior para voltar à comanda */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
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

                  {/* Observações do item */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Observações / Instruções (Opcional)
                    </label>
                    <Input
                      placeholder="Ex: Sem cebola, molho à parte, bem quente..."
                      value={customizingNotes}
                      onChange={(e) => setCustomizingNotes(e.target.value)}
                      className="h-10 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Footer de confirmação */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <Button
                    onClick={() => {
                      const modifiersPayload = selectedModifierIds.map(id => ({ modifierItemId: id }));
                      addOrderItemMutation.mutate({
                        tableId: selectedTable.id,
                        productId: customizingProduct.id,
                        modifiers: modifiersPayload,
                        notes: customizingNotes.trim() || undefined,
                      });
                    }}
                    disabled={addOrderItemMutation.isPending}
                    className="w-full h-12 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Lançar na Mesa {selectedTable.number}</span>
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
                            {isOccupied ? '🔴 Ocupada' : '🟢 Livre'}
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
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    `${window.location.origin}/q/${qrModalTable.qrToken || qrModalTable.id}`,
                  )}`}
                  alt={`QR Code ${qrModalTable.label}`}
                  className="w-48 h-48 rounded-lg"
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
    </div>
  );
};

export default RestaurantTablesPage;

