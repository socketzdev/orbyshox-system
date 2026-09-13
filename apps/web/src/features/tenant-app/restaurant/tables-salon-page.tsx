import React, { useState, useMemo } from 'react';
import { useTenant } from '../context/tenant-context';
import {
  UtensilsCrossed,
  Users,
  Plus,
  Search,
  ArrowRightLeft,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Split,
  CalendarCheck,
  X,
  CreditCard,
  DollarSign,
  QrCode,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type TableStatus = 'LIVRE' | 'OCUPADA' | 'RESERVADA' | 'CONTA_SOLICITADA';

export interface ComandaItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers?: string[];
  orderedAt: string;
}

export interface SalonTable {
  id: string;
  number: number;
  label: string;
  capacity: number;
  status: TableStatus;
  waiter?: string;
  customerName?: string;
  guestCount?: number;
  openedAt?: string;
  reservationTime?: string;
  items: ComandaItem[];
}

const INITIAL_TABLES: SalonTable[] = [
  {
    id: 't-1',
    number: 1,
    label: 'Mesa 01',
    capacity: 2,
    status: 'LIVRE',
    items: [],
  },
  {
    id: 't-2',
    number: 2,
    label: 'Mesa 02',
    capacity: 4,
    status: 'OCUPADA',
    waiter: 'Carlos Garçom',
    customerName: 'Lucas Lima',
    guestCount: 3,
    openedAt: '42 min atrás',
    items: [
      { id: 'i-1', name: 'X-Burger Artesanal', quantity: 2, unitPrice: 34.9, modifiers: ['Ponto: Médio', 'Sem cebola'], orderedAt: '12:15' },
      { id: 'i-2', name: 'Batata Rústica c/ Alecrim', quantity: 1, unitPrice: 22.0, modifiers: ['Molho especial à parte'], orderedAt: '12:18' },
      { id: 'i-3', name: 'Suco Natural Laranja 500ml', quantity: 3, unitPrice: 12.0, modifiers: ['Sem açúcar', 'Com gelo'], orderedAt: '12:20' },
    ],
  },
  {
    id: 't-3',
    number: 3,
    label: 'Mesa 03',
    capacity: 4,
    status: 'CONTA_SOLICITADA',
    waiter: 'Amanda Souza',
    customerName: 'Juliana Paes',
    guestCount: 2,
    openedAt: '1h 10min atrás',
    items: [
      { id: 'i-4', name: 'Bife Ancho Grelhado', quantity: 2, unitPrice: 68.0, modifiers: ['Ao ponto para mal'], orderedAt: '11:45' },
      { id: 'i-5', name: 'Vinho Tinto Cabernet 750ml', quantity: 1, unitPrice: 95.0, orderedAt: '11:50' },
      { id: 'i-6', name: 'Petit Gâteau c/ Sorvete', quantity: 2, unitPrice: 24.0, orderedAt: '12:40' },
    ],
  },
  {
    id: 't-4',
    number: 4,
    label: 'Mesa 04',
    capacity: 6,
    status: 'RESERVADA',
    customerName: 'Família Silveira (Aniversário)',
    reservationTime: '19:30',
    guestCount: 6,
    items: [],
  },
  {
    id: 't-5',
    number: 5,
    label: 'Mesa 05',
    capacity: 2,
    status: 'LIVRE',
    items: [],
  },
  {
    id: 't-6',
    number: 6,
    label: 'Mesa 06',
    capacity: 8,
    status: 'OCUPADA',
    waiter: 'Carlos Garçom',
    customerName: 'Turma de TI',
    guestCount: 7,
    openedAt: '25 min atrás',
    items: [
      { id: 'i-7', name: 'Pizza Grande Calabresa Especial', quantity: 2, unitPrice: 59.9, modifiers: ['Borda recheada Catupiry'], orderedAt: '12:35' },
      { id: 'i-8', name: 'Chopp Pilsen Artesanal 500ml', quantity: 8, unitPrice: 14.0, orderedAt: '12:36' },
    ],
  },
  {
    id: 't-7',
    number: 7,
    label: 'Mesa 07',
    capacity: 4,
    status: 'LIVRE',
    items: [],
  },
  {
    id: 't-8',
    number: 8,
    label: 'Mesa 08',
    capacity: 4,
    status: 'LIVRE',
    items: [],
  },
];

const AVAILABLE_MENU_ITEMS = [
  { id: 'm-1', name: 'X-Burger Artesanal', price: 34.9, category: 'Hambúrgueres' },
  { id: 'm-2', name: 'Batata Rústica c/ Alecrim', price: 22.0, category: 'Porções' },
  { id: 'm-3', name: 'Bife Ancho Grelhado', price: 68.0, category: 'Pratos Principais' },
  { id: 'm-4', name: 'Pizza Grande Calabresa Especial', price: 59.9, category: 'Pizzas' },
  { id: 'm-5', name: 'Chopp Pilsen Artesanal 500ml', price: 14.0, category: 'Bebidas' },
  { id: 'm-6', name: 'Suco Natural Laranja 500ml', price: 12.0, category: 'Bebidas' },
  { id: 'm-7', name: 'Petit Gâteau c/ Sorvete', price: 24.0, category: 'Sobremesas' },
  { id: 'm-8', name: 'Café Expresso Especial', price: 7.5, category: 'Bebidas' },
];

export const TablesSalonPage: React.FC = () => {
  const { slug, tenant } = useTenant();

  const [tables, setTables] = useState<SalonTable[]>(() => {
    const saved = localStorage.getItem(`salon_tables_${slug}`);
    return saved ? JSON.parse(saved) : INITIAL_TABLES;
  });

  const [statusFilter, setStatusFilter] = useState<'ALL' | TableStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected table modal
  const [selectedTable, setSelectedTable] = useState<SalonTable | null>(null);
  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);

  // Modals
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isSplitBillOpen, setIsSplitBillOpen] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);

  // Add Product Form State
  const [selectedProductId, setSelectedProductId] = useState(AVAILABLE_MENU_ITEMS[0].id);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productModifiers, setProductModifiers] = useState('');

  // Open Table Form State
  const [newWaiter, setNewWaiter] = useState('Carlos Garçom');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newGuestCount, setNewGuestCount] = useState(2);

  // Transfer Table State
  const [targetTableNumber, setTargetTableNumber] = useState<number | null>(null);

  // Split Bill State
  const [splitMethod, setSplitMethod] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');
  const [splitPeopleCount, setSplitPeopleCount] = useState(2);
  const [paymentMethod, setPaymentMethod] = useState('PIX');

  // Save changes helper
  const updateTable = (updated: SalonTable) => {
    const newTables = tables.map((t) => (t.id === updated.id ? updated : t));
    setTables(newTables);
    localStorage.setItem(`salon_tables_${slug}`, JSON.stringify(newTables));
    setSelectedTable(updated);
  };

  // KPIs
  const stats = useMemo(() => {
    const total = tables.length;
    const livres = tables.filter((t) => t.status === 'LIVRE').length;
    const ocupadas = tables.filter((t) => t.status === 'OCUPADA').length;
    const conta = tables.filter((t) => t.status === 'CONTA_SOLICITADA').length;
    const reservadas = tables.filter((t) => t.status === 'RESERVADA').length;

    const totalFaturamentoAberto = tables.reduce((acc, t) => {
      if (t.status === 'OCUPADA' || t.status === 'CONTA_SOLICITADA') {
        const tableTotal = t.items.reduce((s, item) => s + item.quantity * item.unitPrice, 0);
        return acc + tableTotal;
      }
      return acc;
    }, 0);

    return { total, livres, ocupadas, conta, reservadas, totalFaturamentoAberto };
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchQuery =
        t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.customerName && t.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.waiter && t.waiter.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchStatus && matchQuery;
    });
  }, [tables, statusFilter, searchQuery]);

  // Calculate table bill total
  const getTableTotal = (table: SalonTable) => {
    return table.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  };

  // Handle open comanda for free table
  const handleOpenComanda = (table: SalonTable) => {
    const updated: SalonTable = {
      ...table,
      status: 'OCUPADA',
      waiter: newWaiter,
      customerName: newCustomerName.trim() || `Cliente Mesa ${table.number}`,
      guestCount: Number(newGuestCount),
      openedAt: 'Agora mesmo',
      items: [],
    };
    updateTable(updated);
    setIsComandaModalOpen(true);
  };

  // Handle add item to comanda
  const handleAddItemToComanda = () => {
    if (!selectedTable) return;
    const menuItem = AVAILABLE_MENU_ITEMS.find((m) => m.id === selectedProductId);
    if (!menuItem) return;

    const modifiersList = productModifiers
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    const newItem: ComandaItem = {
      id: `item-${Date.now()}`,
      name: menuItem.name,
      quantity: Number(productQuantity),
      unitPrice: menuItem.price,
      modifiers: modifiersList.length > 0 ? modifiersList : undefined,
      orderedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updated: SalonTable = {
      ...selectedTable,
      items: [...selectedTable.items, newItem],
    };
    updateTable(updated);
    setIsAddProductOpen(false);
    setProductQuantity(1);
    setProductModifiers('');
  };

  // Handle table transfer
  const handleTransferTable = () => {
    if (!selectedTable || !targetTableNumber) return;
    const target = tables.find((t) => t.number === targetTableNumber);
    if (!target) return;

    const updatedTarget: SalonTable = {
      ...target,
      status: selectedTable.status,
      waiter: selectedTable.waiter,
      customerName: selectedTable.customerName,
      guestCount: selectedTable.guestCount,
      openedAt: selectedTable.openedAt,
      items: [...target.items, ...selectedTable.items],
    };

    const updatedSource: SalonTable = {
      ...selectedTable,
      status: 'LIVRE',
      waiter: undefined,
      customerName: undefined,
      guestCount: undefined,
      openedAt: undefined,
      items: [],
    };

    const newTables = tables.map((t) => {
      if (t.id === updatedSource.id) return updatedSource;
      if (t.id === updatedTarget.id) return updatedTarget;
      return t;
    });

    setTables(newTables);
    localStorage.setItem(`salon_tables_${slug}`, JSON.stringify(newTables));
    setSelectedTable(updatedTarget);
    setIsTransferOpen(false);
  };

  // Handle finalize comanda (Close bill & free table)
  const handleFinalizeBill = () => {
    if (!selectedTable) return;
    const updated: SalonTable = {
      ...selectedTable,
      status: 'LIVRE',
      waiter: undefined,
      customerName: undefined,
      guestCount: undefined,
      openedAt: undefined,
      items: [],
    };
    updateTable(updated);
    setIsSplitBillOpen(false);
    setIsComandaModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Top Stats Bar ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Total de Mesas</span>
            <UtensilsCrossed className="w-4 h-4 text-zinc-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{stats.total}</p>
          <span className="text-[11px] text-zinc-400 font-mono">Salão Principal</span>
        </div>

        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Mesas Livres</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{stats.livres}</p>
          <span className="text-[11px] text-emerald-600">Disponíveis agora</span>
        </div>

        <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Em Atendimento</span>
            <Users className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-1">{stats.ocupadas}</p>
          <span className="text-[11px] text-amber-700 font-medium">Consumo ativo</span>
        </div>

        <div className="bg-purple-50/50 rounded-2xl p-4 border border-purple-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700">Conta Pedida</span>
            <Receipt className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-900 mt-1">{stats.conta}</p>
          <span className="text-[11px] text-purple-700 font-medium">Aguardando fechamento</span>
        </div>

        <div className="bg-zinc-900 text-white rounded-2xl p-4 border border-zinc-800 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total em Aberto</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-1">
            R$ {stats.totalFaturamentoAberto.toFixed(2).replace('.', ',')}
          </p>
          <span className="text-[11px] text-zinc-400">Mesas ocupadas hoje</span>
        </div>
      </div>

      {/* ─── Filters & Search ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('ALL')}
            className={`rounded-xl text-xs font-semibold h-8 ${statusFilter === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'}`}
          >
            Todas ({tables.length})
          </Button>
          <Button
            variant={statusFilter === 'LIVRE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('LIVRE')}
            className={`rounded-xl text-xs font-semibold h-8 ${statusFilter === 'LIVRE' ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-700 border-emerald-200'}`}
          >
            Livres ({stats.livres})
          </Button>
          <Button
            variant={statusFilter === 'OCUPADA' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('OCUPADA')}
            className={`rounded-xl text-xs font-semibold h-8 ${statusFilter === 'OCUPADA' ? 'bg-amber-700 text-white' : 'bg-white text-amber-700 border-amber-200'}`}
          >
            Ocupadas ({stats.ocupadas})
          </Button>
          <Button
            variant={statusFilter === 'CONTA_SOLICITADA' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('CONTA_SOLICITADA')}
            className={`rounded-xl text-xs font-semibold h-8 ${statusFilter === 'CONTA_SOLICITADA' ? 'bg-purple-700 text-white' : 'bg-white text-purple-700 border-purple-200'}`}
          >
            Conta Solicitada ({stats.conta})
          </Button>
          <Button
            variant={statusFilter === 'RESERVADA' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('RESERVADA')}
            className={`rounded-xl text-xs font-semibold h-8 ${statusFilter === 'RESERVADA' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700 border-blue-200'}`}
          >
            Reservadas ({stats.reservadas})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar por mesa, cliente ou garçom..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs rounded-xl bg-white border-zinc-200"
          />
        </div>
      </div>

      {/* ─── Interactive Tables Floor Grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((table) => {
          const total = getTableTotal(table);

          const statusStyles = {
            LIVRE: {
              card: 'border-zinc-200 hover:border-emerald-400 bg-white hover:shadow-md',
              badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              text: 'Livre',
              ring: 'group-hover:border-emerald-500',
            },
            OCUPADA: {
              card: 'border-amber-300 bg-amber-50/20 shadow-2xs hover:shadow-md',
              badge: 'bg-amber-100 text-amber-800 border-amber-300',
              text: 'Ocupada',
              ring: 'border-amber-500',
            },
            CONTA_SOLICITADA: {
              card: 'border-purple-300 bg-purple-50/30 shadow-2xs hover:shadow-md',
              badge: 'bg-purple-100 text-purple-800 border-purple-300 animate-pulse',
              text: 'Conta Solicitada',
              ring: 'border-purple-500',
            },
            RESERVADA: {
              card: 'border-blue-200 bg-blue-50/20 shadow-2xs hover:shadow-md',
              badge: 'bg-blue-100 text-blue-800 border-blue-300',
              text: 'Reservada',
              ring: 'border-blue-400',
            },
          }[table.status];

          return (
            <div
              key={table.id}
              onClick={() => {
                setSelectedTable(table);
                setSplitPeopleCount(table.guestCount || 2);
                setIsComandaModalOpen(true);
              }}
              className={`group relative rounded-2xl border p-4.5 transition-all cursor-pointer flex flex-col justify-between min-h-[175px] ${statusStyles.card}`}
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-zinc-900">
                      {table.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyles.badge}`}
                  >
                    {statusStyles.text}
                  </span>
                </div>

                {table.status === 'LIVRE' && (
                  <div className="py-4 text-center">
                    <span className="text-xs text-zinc-400 block">Mesa higienizada e pronta</span>
                    <span className="text-[11px] font-semibold text-emerald-600 mt-1 inline-flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Abrir Comanda
                    </span>
                  </div>
                )}

                {(table.status === 'OCUPADA' || table.status === 'CONTA_SOLICITADA') && (
                  <div className="space-y-1.5 text-xs text-zinc-600">
                    <div className="flex items-center justify-between font-medium text-zinc-800 truncate">
                      <span className="truncate">{table.customerName}</span>
                      <span className="text-[11px] text-zinc-500 shrink-0 font-mono">
                        {table.guestCount} pax
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>{table.waiter}</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {table.openedAt}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 pt-1">
                      {table.items.length} {table.items.length === 1 ? 'item pedido' : 'itens pedidos'}
                    </div>
                  </div>
                )}

                {table.status === 'RESERVADA' && (
                  <div className="space-y-1 text-xs text-zinc-600 py-1">
                    <span className="font-semibold text-zinc-800 block truncate">
                      {table.customerName}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-700 font-mono">
                      <CalendarCheck className="w-3.5 h-3.5" />
                      <span>Horário: {table.reservationTime}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom footer */}
              {(table.status === 'OCUPADA' || table.status === 'CONTA_SOLICITADA') && (
                <div className="pt-3 border-t border-zinc-200/60 flex items-center justify-between mt-2">
                  <span className="text-[11px] text-zinc-400 font-medium">Subtotal</span>
                  <span className="text-sm font-bold text-zinc-900 font-mono">
                    R$ {total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Modal de Detalhes da Comanda / Mesa ─── */}
      <Dialog open={isComandaModalOpen} onOpenChange={setIsComandaModalOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6 border-zinc-200">
          {selectedTable && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-mono font-bold text-base">
                      {selectedTable.number}
                    </div>
                    <div>
                      <DialogTitle className="text-xl font-bold text-zinc-900">
                        {selectedTable.label}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-zinc-500">
                        Atendimento Presencial • Salão Principal
                      </DialogDescription>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      selectedTable.status === 'LIVRE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : selectedTable.status === 'OCUPADA'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : selectedTable.status === 'CONTA_SOLICITADA'
                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}
                  >
                    {selectedTable.status}
                  </span>
                </div>
              </DialogHeader>

              {/* Se a mesa estiver LIVRE: Formulário para abrir comanda */}
              {selectedTable.status === 'LIVRE' && (
                <div className="py-6 space-y-4">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/70 space-y-4">
                    <h4 className="text-sm font-bold text-zinc-800">
                      Iniciar Atendimento na Mesa
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-zinc-600 mb-1 block">Nome do Cliente / Comanda</Label>
                        <Input
                          placeholder="Ex: Lucas Ferreira ou Família Lima"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          className="h-9 text-xs rounded-xl"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-zinc-600 mb-1 block">Qtd. de Pessoas (Pax)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={newGuestCount}
                          onChange={(e) => setNewGuestCount(Number(e.target.value))}
                          className="h-9 text-xs rounded-xl"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label className="text-xs text-zinc-600 mb-1 block">Garçom Responsável</Label>
                        <Select value={newWaiter} onValueChange={setNewWaiter}>
                          <SelectTrigger className="h-9 text-xs rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="Carlos Garçom">Carlos Garçom</SelectItem>
                            <SelectItem value="Amanda Souza">Amanda Souza</SelectItem>
                            <SelectItem value="Roberto Silva">Roberto Silva</SelectItem>
                            <SelectItem value="Balcão / Autoatendimento">Balcão / Autoatendimento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleOpenComanda(selectedTable)}
                    className="w-full bg-zinc-900 text-white rounded-2xl h-10 font-bold text-xs hover:bg-zinc-800"
                  >
                    Confirmar e Abrir Comanda
                  </Button>
                </div>
              )}

              {/* Se a mesa estiver OCUPADA ou CONTA_SOLICITADA */}
              {(selectedTable.status === 'OCUPADA' || selectedTable.status === 'CONTA_SOLICITADA') && (
                <div className="py-4 space-y-4">
                  {/* Cabeçalho da comanda ativa */}
                  <div className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200/60 text-xs">
                    <div>
                      <span className="font-bold text-zinc-900 block">{selectedTable.customerName}</span>
                      <span className="text-zinc-500">Garçom: {selectedTable.waiter}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-zinc-700 block font-semibold">
                        {selectedTable.guestCount} pessoas
                      </span>
                      <span className="text-zinc-400 font-mono">{selectedTable.openedAt}</span>
                    </div>
                  </div>

                  {/* Ações da comanda (Adicionar item, Transferir mesa, Pedir conta) */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setIsAddProductOpen(true)}
                      className="h-8 text-xs font-bold bg-zinc-900 text-white rounded-xl gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Item ao Pedido
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTransferOpen(true)}
                      className="h-8 text-xs font-semibold rounded-xl text-zinc-700 gap-1 border-zinc-200"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500" /> Transferir Mesa
                    </Button>

                    {selectedTable.status === 'OCUPADA' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateTable({ ...selectedTable, status: 'CONTA_SOLICITADA' });
                        }}
                        className="h-8 text-xs font-semibold rounded-xl text-purple-700 bg-purple-50/60 border-purple-200 hover:bg-purple-100 gap-1"
                      >
                        <Receipt className="w-3.5 h-3.5" /> Solicitar Fechamento
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateTable({ ...selectedTable, status: 'OCUPADA' });
                        }}
                        className="h-8 text-xs font-semibold rounded-xl text-zinc-600"
                      >
                        Voltar para Em Atendimento
                      </Button>
                    )}
                  </div>

                  {/* Lista de itens consumidos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-500 px-2 uppercase tracking-wider">
                      <span>Itens do Pedido ({selectedTable.items.length})</span>
                      <span>Total</span>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                      {selectedTable.items.length === 0 ? (
                        <div className="text-center py-6 text-zinc-400 text-xs bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                          Nenhum item lançado ainda nesta comanda.
                        </div>
                      ) : (
                        selectedTable.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 bg-white rounded-2xl border border-zinc-200/80 shadow-2xs flex items-center justify-between"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded">
                                  {item.quantity}x
                                </span>
                                <span className="text-xs font-bold text-zinc-900">{item.name}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  às {item.orderedAt}
                                </span>
                              </div>

                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1 pl-6">
                                  {item.modifiers.map((mod, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/60 px-1.5 py-0.2 rounded-md font-medium"
                                    >
                                      {mod}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <span className="font-mono text-xs font-bold text-zinc-900">
                              R$ {(item.quantity * item.unitPrice).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Resumo da conta e botão de divisão */}
                  <div className="p-4 bg-zinc-900 text-white rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-zinc-400 block">Total Geral da Comanda</span>
                      <span className="text-xl font-bold font-mono text-white">
                        R$ {getTableTotal(selectedTable).toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    <Button
                      onClick={() => setIsSplitBillOpen(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs rounded-xl h-9 px-4 gap-1.5 shadow-sm"
                    >
                      <Split className="w-3.5 h-3.5" />
                      <span>Fechar Conta & Dividir</span>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Adicionar Item ao Pedido com Modificadores ─── */}
      <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Adicionar Item ao Pedido
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Selecione o produto do cardápio e adicione observações estruturadas para a cozinha
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs text-zinc-600 mb-1 block">Item do Cardápio</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-56">
                  {AVAILABLE_MENU_ITEMS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} — R$ {item.price.toFixed(2).replace('.', ',')} ({item.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-zinc-600 mb-1 block">Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={productQuantity}
                onChange={(e) => setProductQuantity(Number(e.target.value))}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs text-zinc-600 mb-1 block">
                Modificadores para a Cozinha / KDS (Separados por vírgula)
              </Label>
              <Input
                placeholder="Ex: Sem cebola, Ao ponto, Sem glúten, Gelo e limão"
                value={productModifiers}
                onChange={(e) => setProductModifiers(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Estas observações aparecem destacadas na tela de preparo da cozinha (KDS).
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddProductOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleAddItemToComanda}
              className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
            >
              Enviar para Cozinha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Transferência de Mesa ─── */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-zinc-500" />
              Transferir Mesa
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Mover todo o consumo da {selectedTable?.label} para outra mesa livre
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <Label className="text-xs text-zinc-600">Selecione a Mesa de Destino</Label>
            <Select
              value={targetTableNumber ? String(targetTableNumber) : ''}
              onValueChange={(val) => setTargetTableNumber(Number(val))}
            >
              <SelectTrigger className="h-9 text-xs rounded-xl">
                <SelectValue placeholder="Escolha uma mesa disponível..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {tables
                  .filter((t) => t.id !== selectedTable?.id && t.status === 'LIVRE')
                  .map((t) => (
                    <SelectItem key={t.id} value={String(t.number)}>
                      {t.label} (Capacidade: {t.capacity} pessoas)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTransferOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!targetTableNumber}
              onClick={handleTransferTable}
              className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
            >
              Confirmar Transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Split Bill (Divisão de Conta e Fechamento) ─── */}
      <Dialog open={isSplitBillOpen} onOpenChange={setIsSplitBillOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Split className="w-4 h-4 text-emerald-600" />
              Divisão de Conta & Pagamento ({selectedTable?.label})
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Calcule a divisão por pessoa ou receba o valor integral
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="space-y-4 py-3">
              {/* Valor total */}
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/80 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">Total a pagar:</span>
                <span className="text-2xl font-bold font-mono text-zinc-900">
                  R$ {getTableTotal(selectedTable).toFixed(2).replace('.', ',')}
                </span>
              </div>

              {/* Divisor por pessoa */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-600">Quantidade de pagantes</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={splitPeopleCount}
                    onChange={(e) => setSplitPeopleCount(Math.max(1, Number(e.target.value)))}
                    className="h-9 text-xs rounded-xl w-28 font-mono"
                  />
                  <div className="flex-1 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between font-mono">
                    <span>Valor por pessoa:</span>
                    <span className="text-sm">
                      R${' '}
                      {(getTableTotal(selectedTable) / Math.max(1, splitPeopleCount))
                        .toFixed(2)
                        .replace('.', ',')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Método de pagamento */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-600">Forma de Pagamento Principal</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'PIX', label: 'PIX', icon: QrCode },
                    { id: 'CREDIT', label: 'Crédito', icon: CreditCard },
                    { id: 'DEBIT', label: 'Débito', icon: CreditCard },
                    { id: 'CASH', label: 'Dinheiro', icon: DollarSign },
                  ].map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        paymentMethod === method.id
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <method.icon className="w-4 h-4" />
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSplitBillOpen(false)}
              className="text-xs rounded-xl"
            >
              Voltar
            </Button>
            <Button
              size="sm"
              onClick={handleFinalizeBill}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Pagamento e Liberar Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
