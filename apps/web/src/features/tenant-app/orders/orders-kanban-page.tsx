import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Clock,
  DollarSign,
  User,
  CheckCircle2,
  Receipt,
  Search,
  Zap,
  Pencil,
  Trash2,
  Minus,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';
import { ReceiptDialog } from '../components/receipt-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  normalizePaymentMethod,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
} from '../pos/domain/payment-methods';

/** Rótulo em português cobrindo variantes legadas (CASH, CREDIT_CARD...). */
const paymentLabel = (raw: unknown): string => {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return '—';
  const canon = normalizePaymentMethod(raw, undefined as any) as string | undefined;
  if (canon && (PAYMENT_METHODS as readonly string[]).includes(canon)) {
    return PAYMENT_METHOD_LABEL[canon as keyof typeof PAYMENT_METHOD_LABEL];
  }
  return raw.trim();
};

const originLabel = (origin: unknown): string => {
  switch (String(origin || '').toUpperCase()) {
    case 'WAITER':
      return 'Salão (garçom)';
    case 'TABLET':
      return 'Tablet da mesa';
    case 'QR_CODE':
      return 'QR do cliente';
    case 'DELIVERY':
      return 'Delivery/online';
    case 'POS':
      return 'Balcão (PDV)';
    default:
      return String(origin || 'Balcão (PDV)');
  }
};

export const OrdersKanbanPage: React.FC = () => {
  const { slug, base, tenant, abilities } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  // Pedido em visualização (por ID: após um ajuste, o recibo atualiza sozinho
  // com os dados frescos da lista).
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editingItems, setEditingItems] = useState(false);
  const [removingItem, setRemovingItem] = useState<{ orderId: string; itemId: string; name: string } | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['tenant-orders', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/orders`),
    refetchInterval: 10000,
  });

  const filteredOrders = useMemo(() => {
    return orders.filter((order: any) => {
      // Compara pelo método canônico: vale p/ pedido do salão (DINHEIRO) e
      // legado do PDV (CASH) — os dois caem no mesmo filtro.
      const canon = normalizePaymentMethod(order.paymentMethod, 'OUTROS' as any);
      const matchesMethod = filterMethod === 'ALL' || canon === filterMethod;
      const matchesSearch =
        search === '' ||
        String(order.orderNumber).includes(search) ||
        (order.customer?.name && order.customer.name.toLowerCase().includes(search.toLowerCase())) ||
        order.items?.some((i: any) => i.product?.name?.toLowerCase().includes(search.toLowerCase()));
      return matchesMethod && matchesSearch;
    });
  }, [orders, filterMethod, search]);

  // Calculations
  const totalRevenueCents = orders.reduce((sum: number, o: any) => sum + (o.totalCents || 0), 0);
  const avgTicketCents = orders.length > 0 ? Math.round(totalRevenueCents / orders.length) : 0;

  const selectedOrder = useMemo(
    () => orders.find((o: any) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  // Ajuste de item lançado (mesmo motor da correção de comanda): quantidade e
  // remoção recalculam o total no backend. Só gerente/admin (canApproveOrder) —
  // o histórico é auditável e não pode virar bagunça no salão.
  const canEditHistory = Boolean(abilities?.canApproveOrder);

  const updateItemMutation = useMutation({
    mutationFn: ({ orderId, itemId, quantity }: { orderId: string; itemId: string; quantity: number }) =>
      apiPatch(`/restaurant/orders/${orderId}/items/${itemId}`, { quantity }),
    onSuccess: () => {
      // Total mudou: atualiza tudo que soma venda.
      queryClient.invalidateQueries({ queryKey: ['tenant-orders', slug] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', slug] });
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
      toast.success('Item ajustado! Total recalculado.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao ajustar item'),
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      apiDelete(`/restaurant/orders/${orderId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-orders', slug] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', slug] });
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
      setRemovingItem(null);
      toast.success('Item removido do pedido!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao remover item'),
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner with Quick Metrics */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-zinc-700" />
              Histórico de Vendas & Comandas
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-zinc-50">
              {orders.length} vendas registradas
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">
            Acompanhe em tempo real todas as vendas e recibos processados no PDV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
          <div className="p-2.5 px-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block">
              Total Faturado
            </span>
            <span className="text-sm font-bold text-zinc-900 font-mono">
              R$ {(totalRevenueCents / 100).toFixed(2)}
            </span>
          </div>

          <div className="p-2.5 px-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block">
              Ticket Médio
            </span>
            <span className="text-sm font-bold text-zinc-900 font-mono">
              R$ {(avgTicketCents / 100).toFixed(2)}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => navigate(`${base}/pos`)}
            className="h-9 px-3 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-sm flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Nova Venda</span>
          </Button>
        </div>
      </div>

      {/* Filter and Orders List */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar por número do pedido, cliente ou item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl border-zinc-200 bg-zinc-50/50"
            />
          </div>

          {/* Payment Method Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'ALL', label: 'Todas as Vendas' },
              { id: 'PIX', label: 'Pix' },
              { id: 'DINHEIRO', label: 'Dinheiro' },
              { id: 'CARTAO_CREDITO', label: 'Crédito' },
              { id: 'CARTAO_DEBITO', label: 'Débito' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMethod(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                  filterMethod === tab.id
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-zinc-100 bg-zinc-50 animate-pulse h-16" />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <ErpEmptyState
            icon={ClipboardList}
            title="Nenhum pedido encontrado"
            description="Nenhuma venda corresponde aos filtros selecionados. Abra o PDV para realizar atendimentos."
            actionLabel="Frente de Caixa (PDV)"
            onAction={() => navigate(`${base}/pos`)}
          />
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredOrders.map((order: any) => (
              <div
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedOrderId(order.id);
                  setEditingItems(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSelectedOrderId(order.id);
                    setEditingItems(false);
                  }
                }}
                title={`Ver comprovante do pedido #${order.orderNumber}`}
                className="w-full text-left py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-zinc-50/60 px-3 rounded-xl transition cursor-pointer"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white font-mono font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    #{order.orderNumber}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 text-sm">
                        Pedido #{order.orderNumber}
                      </span>
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Concluído
                      </Badge>
                    </div>

                    <p className="text-zinc-600 mt-1 truncate max-w-xl">
                      {order.items?.map((item: any) => `${item.quantity}x ${item.product?.name}`).join(', ')}
                    </p>

                    <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {new Date(order.createdAt).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {order.customer ? order.customer.name : 'Consumidor Final'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:text-right shrink-0">
                  <div>
                    <Badge variant="outline" className="text-[10px] font-bold uppercase mb-1 bg-zinc-50">
                      {paymentLabel(order.paymentMethod)}
                    </Badge>
                    <p className="text-base font-bold text-zinc-900 font-mono">
                      R$ {(order.totalCents / 100).toFixed(2)}
                    </p>
                  </div>
                  {canEditHistory && (
                    <button
                      type="button"
                      title={`Ajustar itens do pedido #${order.orderNumber}`}
                      aria-label={`Ajustar itens do pedido #${order.orderNumber}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrderId(order.id);
                        setEditingItems(true);
                      }}
                      className="h-9 w-9 rounded-xl border border-zinc-200 bg-white flex items-center justify-center hover:border-amber-400 hover:bg-amber-50 transition cursor-pointer"
                    >
                      <Pencil className="w-4 h-4 text-zinc-500" />
                    </button>
                  )}
                  <span className="text-[11px] font-bold text-zinc-400 flex items-center gap-1">
                    <Receipt className="w-4 h-4" />
                    Ver recibo
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Comprovante do pedido ────────────────────────────────────
          Mesma peça do fechamento da comanda: cabeçalho da empresa, mesa e
          pedido, abertura/fechamento, itens com valores e observações,
          pagamento e operador — com imprimir, compartilhar e baixar. */}
      {selectedOrder && (
        <ReceiptDialog
          open={Boolean(selectedOrder) && !editingItems}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedOrderId(null);
              setEditingItems(false);
            }
          }}
          title={`Comprovante — Pedido #${selectedOrder.orderNumber}`}
          storeName={(tenant as any)?.companyName || (tenant as any)?.tradeName}
          storeInfo={
            [
              (tenant as any)?.cnpj ? `CNPJ: ${(tenant as any).cnpj}` : '',
              (tenant as any)?.address || '',
            ].filter(Boolean) as string[]
          }
          reference={[
            `Pedido #${selectedOrder.orderNumber}`,
            selectedOrder.table?.label ||
              (selectedOrder.table?.number != null ? `Mesa ${selectedOrder.table.number}` : ''),
            selectedOrder.tableSession?.comandaName || '',
          ]
            .filter(Boolean)
            .join(' • ')}
          createdAt={selectedOrder.createdAt}
          items={(selectedOrder.items || []).map((it: any) => {
            const unitPriceCents = Number(it.unitPriceCents || it.unitPrice || 0);
            const quantity = Number(it.quantity ?? 0);
            return {
              name: it.product?.name ?? 'Item',
              quantity,
              unitPriceCents,
              subtotalCents: Number(it.totalPrice ?? 0) || Math.round(unitPriceCents * quantity),
              notes: it.notes ?? null,
              modifiers: (it.modifiers || []).map((m: any) => m.name),
            };
          })}
          subtotalCents={Number(selectedOrder.subtotalCents ?? selectedOrder.totalCents ?? 0)}
          discountCents={Number(selectedOrder.discountCents || 0)}
          totalCents={Number(selectedOrder.totalCents || 0)}
          paymentMethod={paymentLabel(selectedOrder.paymentMethod)}
          extraRows={[
            {
              label: 'Cliente',
              value:
                selectedOrder.customer?.name ||
                selectedOrder.tableSession?.comandaName ||
                'Consumidor Final',
            },
            { label: 'Canal', value: originLabel(selectedOrder.origin) },
            ...(selectedOrder.tableSession?.comandaName
              ? [{ label: 'Comanda', value: selectedOrder.tableSession.comandaName }]
              : []),
            {
              label: 'Operador',
              value: selectedOrder.waiterName || 'Não identificado',
            },
            {
              label: 'Aberto em',
              value: selectedOrder.tableSession?.openedAt
                ? new Date(selectedOrder.tableSession.openedAt).toLocaleString('pt-BR')
                : new Date(selectedOrder.createdAt).toLocaleString('pt-BR'),
            },
            {
              label: 'Finalizado em',
              value: selectedOrder.tableSession?.closedAt
                ? new Date(selectedOrder.tableSession.closedAt).toLocaleString('pt-BR')
                : new Date(selectedOrder.updatedAt || selectedOrder.createdAt).toLocaleString('pt-BR'),
            },
          ]}
          closeLabel="Voltar ao histórico"
        />
      )}

      {/* ─── Ajustar itens (gerente) ──────────────────────────────────────
          Correção auditável: quantidade e remoção recalculam o total no
          backend e o recibo acima atualiza sozinho (vem da mesma lista). */}
      <Dialog
        open={editingItems && Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open && !updateItemMutation.isPending && !removeItemMutation.isPending) {
            setEditingItems(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-amber-600" />
              Ajustar pedido #{selectedOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Correção de gerente: o total é recalculado e o recibo acompanha. Pagamento e
              datas não mudam por aqui.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[45vh] overflow-y-auto space-y-2">
            {(selectedOrder?.items || []).map((it: any) => {
              const qty = Math.round(Number(it.quantity) || 0);
              const unit = Number(it.unitPriceCents || it.unitPrice || 0);
              return (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-zinc-950 truncate">
                      {it.product?.name || 'Item'}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono">
                      {(unit / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} cada
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="Diminuir quantidade"
                      disabled={qty <= 1 || updateItemMutation.isPending}
                      onClick={() =>
                        updateItemMutation.mutate({
                          orderId: selectedOrder.id,
                          itemId: it.id,
                          quantity: qty - 1,
                        })
                      }
                      className="h-9 w-9 rounded-xl border border-zinc-200 bg-white flex items-center justify-center active:scale-95 transition cursor-pointer disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-black tabular-nums">{qty}x</span>
                    <button
                      type="button"
                      aria-label="Aumentar quantidade"
                      disabled={qty >= 99 || updateItemMutation.isPending}
                      onClick={() =>
                        updateItemMutation.mutate({
                          orderId: selectedOrder.id,
                          itemId: it.id,
                          quantity: qty + 1,
                        })
                      }
                      className="h-9 w-9 rounded-xl border border-zinc-200 bg-white flex items-center justify-center active:scale-95 transition cursor-pointer disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${it.product?.name || 'item'}`}
                      disabled={removeItemMutation.isPending}
                      onClick={() =>
                        setRemovingItem({
                          orderId: selectedOrder.id,
                          itemId: it.id,
                          name: it.product?.name || 'Item',
                        })
                      }
                      className="h-9 w-9 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                    </button>
                  </div>
                </div>
              );
            })}
            {(selectedOrder?.items || []).length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-6">Este pedido não tem mais itens.</p>
            )}
          </div>

          <div className="flex items-center justify-between px-1 pt-1 border-t border-zinc-100">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total atual</span>
            <span className="text-lg font-black text-zinc-950">
              {(Number(selectedOrder?.totalCents || 0) / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingItems(false)}
              className="w-full sm:w-auto h-11 rounded-2xl"
            >
              Concluir
            </Button>
            <Button
              onClick={() => {
                setEditingItems(false);
              }}
              className="w-full sm:flex-1 h-11 rounded-2xl bg-zinc-950 text-white font-bold text-xs"
            >
              <Receipt className="w-4 h-4 mr-1.5" />
              Ver recibo atualizado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmar remoção de item ─── */}
      <ConfirmDialog
        open={Boolean(removingItem)}
        onOpenChange={(open) => {
          if (!open && !removeItemMutation.isPending) setRemovingItem(null);
        }}
        title="Remover item do pedido?"
        description={
          removingItem ? (
            <span>
              <strong>{removingItem.name}</strong> sai do pedido #{selectedOrder?.orderNumber} e o total é
              recalculado. Para desfazer, será preciso lançar o item de novo.
            </span>
          ) : undefined
        }
        confirmLabel={removeItemMutation.isPending ? 'Removendo...' : 'Remover item'}
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          if (!removingItem) return;
          removeItemMutation.mutate({ orderId: removingItem.orderId, itemId: removingItem.itemId });
        }}
      />
    </div>
  );
};
