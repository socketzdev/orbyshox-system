import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Check,
  X,
  User,
  RefreshCw,
  ChefHat,
  ShoppingBag,
  ArrowRight,
  Info,
  RotateCcw,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
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
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PurchasePaymentSection } from './purchase-payment-section';

export interface PurchaseNoteItem {
  id: string;
  purchaseNoteId: string;
  itemName: string;
  quantity: string;
  status: 'PENDING' | 'BOUGHT' | 'NOT_BOUGHT';
  buyerNotes?: string | null;
  priceCents?: number | null;
  paymentMethod?: string | null;
  createdAt: string;
}

export interface PurchaseNote {
  id: string;
  tenantId?: string | null;
  companyId?: string | null;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'CONFIRMED' | 'PARTIAL';
  createdByName?: string | null;
  buyerName?: string | null;
  notes?: string | null;
  totalCents?: number | null;
  paymentsJson?: string | null;
  paidAt?: string | null;
  supplierName?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseNoteItem[];
  stats?: {
    total: number;
    bought: number;
    notBought: number;
    pending: number;
  };
}

interface NewItemRow {
  tempId: string;
  itemName: string;
  quantity: string;
}

export function PurchaseNotesPage() {
  const { slug, currentUser } = useTenant();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'CONFIRMED' | 'PARTIAL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais e gavetas
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Estado da Nova Nota
  const [noteTitle, setNoteTitle] = useState('Nota de Compra — Cozinha');
  const [createdByName, setCreatedByName] = useState(currentUser?.name || 'Cozinheiro');
  const [generalNotes, setGeneralNotes] = useState('');
  const [itemRows, setItemRows] = useState<NewItemRow[]>([
    { tempId: '1', itemName: 'Arroz', quantity: '2 sacos' },
    { tempId: '2', itemName: 'Feijão', quantity: '1 saco' },
    { tempId: '3', itemName: 'Batata', quantity: '10 kg' },
    { tempId: '4', itemName: 'Tomate', quantity: '5 kg' },
  ]);

  // Estado para inline de observação de "Não Comprado"
  const [itemNotBoughtPrompt, setItemNotBoughtPrompt] = useState<{
    itemId: string;
    itemName: string;
    reason: string;
  } | null>(null);

  // Estado para adicionar itens à nota existente
  const [isAddingExtraItem, setIsAddingExtraItem] = useState(false);
  const [extraItemName, setExtraItemName] = useState('');
  const [extraItemQuantity, setExtraItemQuantity] = useState('');

  // Query das notas: busca SEMPRE a lista completa (sem filtro de status no
  // servidor). O filtro por status é client-side — assim os contadores das
  // pills fecham e a nota aberta no detalhe nunca some no meio do uso (ex.:
  // marcou um item e ela mudou de PENDENTE para EM COMPRA).
  const { data: notes = [], isLoading, refetch } = useQuery<PurchaseNote[]>({
    queryKey: ['purchase-notes', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-notes`),
    enabled: !!slug,
    refetchInterval: 10000,
  });

  // Nota selecionada para o Sheet de detalhes
  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // Contadores globais de status
  const counts = useMemo(() => {
    return {
      all: notes.length,
      pending: notes.filter((n) => n.status === 'PENDING').length,
      inProgress: notes.filter((n) => n.status === 'IN_PROGRESS').length,
      confirmed: notes.filter((n) => n.status === 'CONFIRMED').length,
      partial: notes.filter((n) => n.status === 'PARTIAL').length,
    };
  }, [notes]);

  // Notas filtradas por status + busca (tudo client-side sobre a lista completa).
  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return notes.filter((n) => {
      if (statusFilter !== 'ALL' && n.status !== statusFilter) return false;
      if (!term) return true;
      return (
        n.title.toLowerCase().includes(term) ||
        (n.createdByName && n.createdByName.toLowerCase().includes(term)) ||
        (n.buyerName && n.buyerName.toLowerCase().includes(term)) ||
        n.items.some((i) => i.itemName.toLowerCase().includes(term))
      );
    });
  }, [notes, searchTerm, statusFilter]);

  // Mutação: Criar Nova Nota
  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/purchase-notes`, payload),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-notes', slug] });
      setIsNewModalOpen(false);
      resetNewForm();
      if (newNote?.id) {
        setSelectedNoteId(newNote.id);
      }
    },
  });

  // Mutação: Atualizar Status da Nota
  const updateNoteStatusMutation = useMutation({
    mutationFn: ({ id, status, buyerName }: { id: string; status?: string; buyerName?: string }) =>
      apiPatch(`/tenant-app/${slug}/purchase-notes/${id}/status`, { status, buyerName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-notes', slug] });
    },
  });

  // Mutação: Atualizar Item (Comprado, Não Comprado, Pendente)
  const updateItemMutation = useMutation({
    mutationFn: ({
      noteId,
      itemId,
      status,
      buyerNotes,
      buyerName,
    }: {
      noteId: string;
      itemId: string;
      status: 'PENDING' | 'BOUGHT' | 'NOT_BOUGHT';
      buyerNotes?: string;
      buyerName?: string;
    }) =>
      apiPatch(`/tenant-app/${slug}/purchase-notes/${noteId}/items/${itemId}`, {
        status,
        buyerNotes,
        buyerName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-notes', slug] });
      setItemNotBoughtPrompt(null);
    },
  });

  // Mutação: Adicionar Item a Nota Existente
  const addItemsMutation = useMutation({
    mutationFn: ({ noteId, items }: { noteId: string; items: any[] }) =>
      apiPost(`/tenant-app/${slug}/purchase-notes/${noteId}/items`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-notes', slug] });
      setExtraItemName('');
      setExtraItemQuantity('');
      setIsAddingExtraItem(false);
    },
  });

  // Mutação: Excluir Nota
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/purchase-notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-notes', slug] });
      if (selectedNoteId === deleteConfirmId) {
        setSelectedNoteId(null);
      }
      setDeleteConfirmId(null);
    },
  });

  function resetNewForm() {
    setNoteTitle('Nota de Compra — Cozinha');
    setCreatedByName(currentUser?.name || 'Cozinheiro');
    setGeneralNotes('');
    setItemRows([
      { tempId: String(Date.now()), itemName: '', quantity: '' },
      { tempId: String(Date.now() + 1), itemName: '', quantity: '' },
    ]);
  }

  function handleAddRow() {
    setItemRows((prev) => [...prev, { tempId: String(Date.now()), itemName: '', quantity: '' }]);
  }

  function handleRemoveRow(index: number) {
    if (itemRows.length <= 1) {
      setItemRows([{ tempId: String(Date.now()), itemName: '', quantity: '' }]);
      return;
    }
    setItemRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleItemChange(index: number, field: 'itemName' | 'quantity', value: string) {
    setItemRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function handleKeyDownQuantity(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === itemRows.length - 1) {
        handleAddRow();
      }
    }
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = itemRows.filter((r) => r.itemName.trim().length > 0);
    if (validItems.length === 0) {
      alert('Adicione pelo menos um item à lista!');
      return;
    }

    createMutation.mutate({
      title: noteTitle.trim() || 'Nota de Compra',
      createdByName: createdByName.trim() || 'Cozinha',
      notes: generalNotes.trim() || null,
      items: validItems.map((r) => ({
        itemName: r.itemName.trim(),
        quantity: r.quantity.trim() || '1 un',
      })),
    });
  }

  function handleTakePurchase(note: PurchaseNote) {
    const buyer = currentUser?.name || 'Comprador';
    updateNoteStatusMutation.mutate({
      id: note.id,
      status: 'IN_PROGRESS',
      buyerName: buyer,
    });
  }

  function handleMarkAllBought(note: PurchaseNote) {
    const pendingItems = note.items.filter((i) => i.status !== 'BOUGHT');
    if (pendingItems.length === 0) return;

    pendingItems.forEach((item) => {
      updateItemMutation.mutate({
        noteId: note.id,
        itemId: item.id,
        status: 'BOUGHT',
        buyerName: currentUser?.name || note.buyerName || 'Comprador',
      });
    });
  }

  function handleConfirmNotBought() {
    if (!itemNotBoughtPrompt || !selectedNote) return;
    updateItemMutation.mutate({
      noteId: selectedNote.id,
      itemId: itemNotBoughtPrompt.itemId,
      status: 'NOT_BOUGHT',
      buyerNotes: itemNotBoughtPrompt.reason.trim() || 'Produto não encontrado',
      buyerName: currentUser?.name || selectedNote.buyerName || 'Comprador',
    });
  }

  function renderStatusBadge(status: PurchaseNote['status']) {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            🟡 Pendente
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            🔵 Em compra
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            🟢 Confirmada
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-200">
            <AlertTriangle className="w-3 h-3 text-orange-600" />
            🟠 Parcial
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/60">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                Notas de Compra
              </h1>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Módulo Cozinha & Suprimentos
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">
              O cozinheiro digita o que precisa sem procurar no catálogo. O comprador assume, confere os itens e o histórico nunca se perde.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="rounded-2xl gap-2 border-zinc-200 text-zinc-600 hover:text-zinc-900"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          <Button
            onClick={() => {
              resetNewForm();
              setIsNewModalOpen(true);
            }}
            className="rounded-2xl gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold shadow-sm px-4 py-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Nota de Compra</span>
          </Button>
        </div>
      </div>

      {/* ─── Filters & Search ─── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Pills de Status */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 ${
              statusFilter === 'ALL'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
            }`}
          >
            Todas ({counts.all})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white text-zinc-600 hover:bg-amber-50 hover:text-amber-900 border border-zinc-200'
            }`}
          >
            <span>🟡 Pendente</span>
            <span className="text-[10px] opacity-80">({counts.pending})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'IN_PROGRESS'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-zinc-600 hover:bg-sky-50 hover:text-sky-900 border border-zinc-200'
            }`}
          >
            <span>🔵 Em compra</span>
            <span className="text-[10px] opacity-80">({counts.inProgress})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('CONFIRMED')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'CONFIRMED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-zinc-600 hover:bg-emerald-50 hover:text-emerald-900 border border-zinc-200'
            }`}
          >
            <span>🟢 Confirmada</span>
            <span className="text-[10px] opacity-80">({counts.confirmed})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('PARTIAL')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'PARTIAL'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-white text-zinc-600 hover:bg-orange-50 hover:text-orange-900 border border-zinc-200'
            }`}
          >
            <span>🟠 Parcial</span>
            <span className="text-[10px] opacity-80">({counts.partial})</span>
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar nota, item ou solicitante..."
            className="pl-9 rounded-2xl bg-white border-zinc-200 text-xs focus:ring-zinc-900"
          />
        </div>
      </div>

      {/* ─── Notes Grid ─── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-200 rounded-full animate-spin" />
          <span className="text-xs text-zinc-500 font-medium">Carregando notas de compra...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-700">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-zinc-900">Nenhuma nota encontrada</h3>
            <p className="text-xs text-zinc-500 mt-1">
              {searchTerm
                ? 'Nenhuma nota corresponde à sua busca atual.'
                : 'A cozinha ainda não criou nenhuma nota de compra neste status. Clique no botão abaixo para criar a primeira!'}
            </p>
          </div>
          <Button
            onClick={() => {
              resetNewForm();
              setIsNewModalOpen(true);
            }}
            className="rounded-2xl gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Nova Nota de Compra</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredNotes.map((note) => {
            const total = note.items.length;
            const bought = note.items.filter((i) => i.status === 'BOUGHT').length;
            const notBought = note.items.filter((i) => i.status === 'NOT_BOUGHT').length;
            const progressPercent = total > 0 ? Math.round((bought / total) * 100) : 0;

            const dateFormatted = new Date(note.createdAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={note.id}
                onClick={() => setSelectedNoteId(note.id)}
                className="bg-white rounded-3xl border border-zinc-200/90 p-5 shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {/* Top Header Card */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-zinc-900 group-hover:text-amber-700 transition truncate">
                        {note.title}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <ChefHat className="w-3 h-3 text-zinc-400 shrink-0" />
                          {note.createdByName || 'Cozinha'}
                        </span>
                        <span>•</span>
                        <span>{dateFormatted}</span>
                      </div>
                    </div>
                    {renderStatusBadge(note.status)}
                  </div>

                  {/* Buyer info if exists */}
                  {note.buyerName && (
                    <div className="mb-3 px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-100 flex items-center gap-2 text-[11.5px] text-sky-900 font-medium">
                      <User className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>Comprador: <strong>{note.buyerName}</strong></span>
                    </div>
                  )}

                  {/* General notes snippet */}
                  {note.notes && (
                    <p className="text-[11.5px] text-zinc-500 italic mb-3 line-clamp-1 bg-zinc-50 px-2.5 py-1 rounded-lg">
                      "{note.notes}"
                    </p>
                  )}

                  {/* Items Preview */}
                  <div className="space-y-1.5 my-3">
                    {note.items.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 last:border-0"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {item.status === 'BOUGHT' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : item.status === 'NOT_BOUGHT' ? (
                            <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0 ml-1 mr-1" />
                          )}
                          <span
                            className={`truncate ${
                              item.status === 'BOUGHT'
                                ? 'line-through text-zinc-400'
                                : item.status === 'NOT_BOUGHT'
                                ? 'text-rose-700 font-medium'
                                : 'text-zinc-800'
                            }`}
                          >
                            {item.itemName}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-zinc-500 shrink-0 ml-2">
                          {item.quantity}
                        </span>
                      </div>
                    ))}
                    {note.items.length > 4 && (
                      <span className="text-[10px] text-zinc-400 font-medium block pt-1">
                        + {note.items.length - 4} outros itens...
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Progress & Quick Action */}
                <div className="pt-3 border-t border-zinc-100 mt-2">
                  {/* Valor pago (quando confirmado financeiramente) */}
                  {(note as any).paidAt && (
                    <div className="flex items-center justify-between mb-2 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/70">
                      <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wide">
                        Pago
                      </span>
                      <span className="text-sm font-black text-emerald-900 font-mono">
                        {(Number((note as any).totalCents || 0) / 100).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1.5">
                    <span>
                      {bought} de {total} comprados
                      {notBought > 0 && ` (${notBought} ausente)`}
                    </span>
                    <span className="font-bold text-zinc-700">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        progressPercent === 100
                          ? 'bg-emerald-500'
                          : notBought > 0
                          ? 'bg-orange-500'
                          : 'bg-sky-500'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-3 text-xs font-semibold text-zinc-900 group-hover:text-amber-700">
                    <span>Ver detalhes & itens</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODAL: NOVA NOTA DE COMPRA ─── */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white rounded-3xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <ChefHat className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-zinc-900">
                  Nova Nota de Compra
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500">
                  Sem catálogo, sem complicação: digite o item e a quantidade necessária.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 my-2 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-zinc-700">Título / Finalidade</Label>
                <Input
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Ex: Reposição Cozinha Almoço"
                  className="rounded-xl mt-1 text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-zinc-700">Quem está pedindo?</Label>
                <Input
                  value={createdByName}
                  onChange={(e) => setCreatedByName(e.target.value)}
                  placeholder="Ex: Cozinheiro João / Chef Carlos"
                  className="rounded-xl mt-1 text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-zinc-700">
                Observações gerais (opcional)
              </Label>
              <Input
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="Ex: Dar prioridade no arroz e batata para o almoço das 11h"
                className="rounded-xl mt-1 text-xs"
              />
            </div>

            {/* Tabela de Itens Rápida */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-zinc-900">
                  Itens Necessários ({itemRows.filter((r) => r.itemName.trim()).length})
                </Label>
                <span className="text-[11px] text-zinc-400">
                  Pressione <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-[10px] font-mono">Enter</kbd> na quantidade para criar outra linha
                </span>
              </div>

              <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80 space-y-2 max-h-[300px] overflow-y-auto">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-zinc-400 px-2 uppercase">
                  <div className="col-span-7">Item / Produto</div>
                  <div className="col-span-4">Quantidade</div>
                  <div className="col-span-1 text-center">×</div>
                </div>

                {itemRows.map((row, idx) => (
                  <div key={row.tempId} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7">
                      <Input
                        value={row.itemName}
                        onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                        placeholder={idx === 0 ? 'Ex: Arroz' : idx === 1 ? 'Ex: Feijão' : idx === 2 ? 'Ex: Batata' : 'Nome do item'}
                        className="rounded-xl bg-white text-xs h-9"
                        autoFocus={idx === 0}
                      />
                    </div>
                    <div className="col-span-4">
                      <Input
                        value={row.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        onKeyDown={(e) => handleKeyDownQuantity(e, idx)}
                        placeholder={idx === 0 ? 'Ex: 2 sacos' : idx === 1 ? 'Ex: 1 saco' : idx === 2 ? 'Ex: 10 kg' : 'Ex: 5 kg, 2 un'}
                        className="rounded-xl bg-white text-xs h-9"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="w-7 h-7 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                  className="w-full rounded-xl text-xs gap-1.5 border-dashed border-zinc-300 text-zinc-600 hover:bg-white mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Mais uma Linha</span>
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-zinc-100 flex items-center justify-between sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsNewModalOpen(false)}
                className="rounded-xl text-xs text-zinc-500"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-2xl gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs px-5"
              >
                {createMutation.isPending ? (
                  <span>Salvando...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Criar Nota de Compra</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── SHEET: DETALHES & FLUXO DE COMPRA INTERATIVO ─── */}
      <Sheet open={!!selectedNote} onOpenChange={(open) => !open && setSelectedNoteId(null)}>
        <SheetContent className="w-full sm:max-w-xl bg-white p-0 flex flex-col shadow-2xl overflow-hidden">
          {selectedNote && (
            <>
              {/* Header do Sheet */}
              <div className="p-6 border-b border-zinc-100 bg-zinc-50/70">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-zinc-900 truncate">
                      {selectedNote.title}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                      <span>Criada por: <strong>{selectedNote.createdByName || 'Cozinha'}</strong></span>
                      <span>•</span>
                      <span>
                        {new Date(selectedNote.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  {renderStatusBadge(selectedNote.status)}
                </div>

                {/* Buyer Responsibility Box */}
                <div className="mt-4 p-3 rounded-2xl bg-white border border-zinc-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                        Responsável pelas Compras
                      </span>
                      <span className="font-bold text-zinc-800">
                        {selectedNote.buyerName || 'Nenhum comprador assumiu'}
                      </span>
                    </div>
                  </div>

                  {!selectedNote.buyerName || selectedNote.status === 'PENDING' ? (
                    <Button
                      size="sm"
                      onClick={() => handleTakePurchase(selectedNote)}
                      disabled={updateNoteStatusMutation.isPending}
                      className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs gap-1.5 shrink-0"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Assumir Compra 🛒</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkAllBought(selectedNote)}
                      className="rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs gap-1.5 shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Marcar Todos Comprados</span>
                    </Button>
                  )}
                </div>

                {selectedNote.notes && (
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
                    <span><strong>Obs da Cozinha:</strong> {selectedNote.notes}</span>
                  </div>
                )}
              </div>

              {/* Lista de Itens com Ações de Compra */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    Itens da Lista ({selectedNote.items.length})
                  </h3>
                  <div className="text-[11px] text-zinc-500">
                    <strong className="text-emerald-700">
                      {selectedNote.items.filter((i) => i.status === 'BOUGHT').length} comprados
                    </strong>{' '}
                    / {selectedNote.items.length}
                  </div>
                </div>

                {selectedNote.items.map((item) => {
                  const isBought = item.status === 'BOUGHT';
                  const isNotBought = item.status === 'NOT_BOUGHT';

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isBought
                          ? 'bg-emerald-50/50 border-emerald-200/80'
                          : isNotBought
                          ? 'bg-rose-50/50 border-rose-200/80'
                          : 'bg-zinc-50/70 border-zinc-200'
                      }`}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[15px] font-bold ${
                                isBought
                                  ? 'line-through text-emerald-900/60'
                                  : isNotBought
                                  ? 'text-rose-900'
                                  : 'text-zinc-900'
                              }`}
                            >
                              {item.itemName}
                            </span>
                            <span className="px-2.5 py-1 rounded-md bg-white border border-zinc-200/70 font-mono text-xs font-semibold text-zinc-700 shrink-0">
                              {item.quantity}
                            </span>
                          </div>

                          {/* Observação de Não Comprado */}
                          {isNotBought && item.buyerNotes && (
                            <div className="mt-2 text-xs text-rose-800 bg-white/80 p-2 rounded-xl border border-rose-200 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                              <span>
                                <strong>Motivo:</strong> {item.buyerNotes}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Botões de Ação do Comprador (alvos grandes p/ dedo no celular) */}
                        <div className="flex items-center gap-2">
                          {isBought ? (
                            <>
                              <span className="flex-1 text-sm font-bold text-emerald-700 px-3 min-h-[48px] bg-emerald-100 rounded-xl flex items-center justify-center gap-1.5">
                                <Check className="w-4 h-4" /> Comprado
                              </span>
                              <button
                                type="button"
                                title="Desfazer"
                                aria-label="Desfazer"
                                onClick={() =>
                                  updateItemMutation.mutate({
                                    noteId: selectedNote.id,
                                    itemId: item.id,
                                    status: 'PENDING',
                                  })
                                }
                                className="w-12 h-12 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/70 flex items-center justify-center shrink-0 border border-zinc-200 bg-white cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </>
                          ) : isNotBought ? (
                            <>
                              <span className="flex-1 text-sm font-bold text-rose-700 px-3 min-h-[48px] bg-rose-100 rounded-xl flex items-center justify-center gap-1.5">
                                <X className="w-4 h-4" /> Não comprado
                              </span>
                              <button
                                type="button"
                                title="Desfazer"
                                aria-label="Desfazer"
                                onClick={() =>
                                  updateItemMutation.mutate({
                                    noteId: selectedNote.id,
                                    itemId: item.id,
                                    status: 'PENDING',
                                  })
                                }
                                className="w-12 h-12 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/70 flex items-center justify-center shrink-0 border border-zinc-200 bg-white cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  updateItemMutation.mutate({
                                    noteId: selectedNote.id,
                                    itemId: item.id,
                                    status: 'BOUGHT',
                                    buyerName: currentUser?.name || selectedNote.buyerName || 'Comprador',
                                  })
                                }
                                className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-3 gap-1.5 shadow-2xs"
                              >
                                <Check className="w-4 h-4" />
                                <span>Comprado</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setItemNotBoughtPrompt({
                                    itemId: item.id,
                                    itemName: item.itemName,
                                    reason: '',
                                  })
                                }
                                className="flex-1 min-h-[48px] rounded-xl border-rose-300 text-rose-700 hover:bg-rose-50 text-sm font-bold px-3 gap-1.5"
                              >
                                <X className="w-4 h-4" />
                                <span>Não achei</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Adicionar mais item se cozinheiro lembrar */}
                {isAddingExtraItem ? (
                  <div className="p-3.5 rounded-2xl bg-zinc-100/80 border border-zinc-300 space-y-2">
                    <Label className="text-xs font-bold text-zinc-800">
                      Adicionar item extra nesta nota
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={extraItemName}
                        onChange={(e) => setExtraItemName(e.target.value)}
                        placeholder="Nome do produto"
                        className="rounded-xl text-xs bg-white h-8"
                      />
                      <Input
                        value={extraItemQuantity}
                        onChange={(e) => setExtraItemQuantity(e.target.value)}
                        placeholder="Quantidade (ex: 2 un)"
                        className="rounded-xl text-xs bg-white h-8"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsAddingExtraItem(false)}
                        className="h-7 text-xs rounded-lg text-zinc-500"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!extraItemName.trim()) return;
                          addItemsMutation.mutate({
                            noteId: selectedNote.id,
                            items: [{ itemName: extraItemName.trim(), quantity: extraItemQuantity.trim() || '1 un' }],
                          });
                        }}
                        disabled={addItemsMutation.isPending}
                        className="h-7 text-xs rounded-lg bg-zinc-900 text-white font-semibold"
                      >
                        Salvar Item
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddingExtraItem(true)}
                    className="w-full text-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl gap-1.5 py-2 border border-dashed border-zinc-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Lembrou de algo? Adicionar item à nota</span>
                  </Button>
                )}
              </div>

              {/* Pagamento + abatimento no caixa do turno */}
              <div className="px-6 pb-2">
                <PurchasePaymentSection key={selectedNote.id} note={selectedNote} slug={slug} />
              </div>

              {/* Footer do Sheet */}
              <div className="p-4 border-t border-zinc-200/80 bg-zinc-50 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmId(selectedNote.id)}
                  className="rounded-xl text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Nota</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedNoteId(null)}
                  className="rounded-xl text-xs text-zinc-600 border-zinc-300"
                >
                  Fechar
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── MODAL: MOTIVO DE NÃO COMPRADO ─── */}
      <Dialog open={!!itemNotBoughtPrompt} onOpenChange={(open) => !open && setItemNotBoughtPrompt(null)}>
        <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-zinc-900">
                  Não comprado: {itemNotBoughtPrompt?.itemName}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500">
                  Explique para a cozinha por que este item não pôde ser comprado hoje.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <Label className="text-xs font-semibold text-zinc-700">Motivo / Observação</Label>
            <Input
              value={itemNotBoughtPrompt?.reason || ''}
              onChange={(e) =>
                setItemNotBoughtPrompt((prev) => (prev ? { ...prev, reason: e.target.value } : null))
              }
              placeholder="Ex: Não consegui encontrar batata hoje / Estava em falta"
              className="rounded-xl text-xs"
              autoFocus
            />

            {/* Sugestões rápidas de 1 clique */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                'Não encontrei hoje',
                'Estava em falta no fornecedor',
                'Qualidade ruim / estragado',
                'Preço excessivamente alto',
              ].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() =>
                    setItemNotBoughtPrompt((prev) => (prev ? { ...prev, reason: sug } : null))
                  }
                  className="text-[11px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2.5 py-1 rounded-lg transition"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setItemNotBoughtPrompt(null)}
              className="rounded-xl text-xs text-zinc-500"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmNotBought}
              className="rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4"
            >
              Confirmar Não Comprado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog para Excluir Nota */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        title="Excluir Nota de Compra?"
        description="Esta nota será removida do histórico permanentemente."
        confirmLabel="Sim, excluir nota"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId);
        }}
      />
    </div>
  );
}
