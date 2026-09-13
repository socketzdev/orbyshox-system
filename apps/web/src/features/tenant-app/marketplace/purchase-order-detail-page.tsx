import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Truck,
  Package,
  Send,
  XCircle,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CossPanel,
  CossBadge,
  CossInput,
  CossLabel,
  CossEmpty,
} from '@/components/coss-ui';
import { PageLoader } from '@/components/ui/page-loader';
import { useTenant } from '../context/tenant-context';
import { apiGet, apiPost } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface PurchaseOrderDetail {
  id: string;
  status: string;
  totalCents: number;
  expectedDate: string | null;
  notes: string | null;
  createdAt: string;
  supplier: { id: string; tradeName: string | null; legalName: string; leadTimeDays: number };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    receivedQty: number;
    unitCostCents: number;
    totalCents: number;
    product: { id: string; name: string; unit: string; stockQuantity: number };
  }>;
  batches: Array<{ id: string; lotNumber: string; expiryDate: string | null }>;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Rascunho', className: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  SENT: { label: 'Enviado', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  RECEIVING: { label: 'Recebendo', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  RECEIVED: { label: 'Recebido', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELED: { label: 'Cancelado', className: 'bg-zinc-50 text-zinc-400 border-zinc-200' },
};

export const PurchaseOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const { data: order, isLoading } = useQuery<PurchaseOrderDetail>({
    queryKey: ['purchase-order', slug, orderId],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-orders/${orderId}`),
    enabled: !!orderId,
  });

  const send = useMutation({
    mutationFn: () => apiPost(`/tenant-app/${slug}/purchase-orders/${orderId}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', slug, orderId] });
      toast.success('Pedido enviado!');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Falha ao enviar'),
  });

  const cancel = useMutation({
    mutationFn: () => apiPost(`/tenant-app/${slug}/purchase-orders/${orderId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', slug, orderId] });
      toast.success('Pedido cancelado');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Falha ao cancelar'),
  });

  if (isLoading) return <PageLoader label="Carregando pedido..." />;
  if (!order) {
    return (
      <CossPanel>
        <CossEmpty
          icon={<Package className="w-5 h-5" />}
          title="Pedido não encontrado"
          action={
            <Button size="sm" onClick={() => navigate(`${base}/marketplace/purchase-orders`)} className="rounded-xl">
              Voltar
            </Button>
          }
        />
      </CossPanel>
    );
  }

  const s = STATUS_LABEL[order.status] || STATUS_LABEL.DRAFT;
  const isEditable = order.status === 'DRAFT';
  const canReceive = ['SENT', 'CONFIRMED', 'RECEIVING'].includes(order.status);
  const totalReceived = order.items.reduce((acc, i) => acc + i.receivedQty, 0);
  const totalQty = order.items.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="space-y-5 font-sans pb-12">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`${base}/marketplace/purchase-orders`)}
          className="h-9 w-9 p-0 rounded-xl border-zinc-200"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Pedido de Compra</h1>
            <CossBadge className={s.className}>{s.label}</CossBadge>
          </div>
          <p className="text-xs text-zinc-500 font-mono">#{order.id.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2">
          {isEditable && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCancelConfirmOpen(true)}
                className="h-9 px-3.5 text-xs font-bold rounded-xl border-zinc-200 text-rose-600"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => send.mutate()}
                disabled={send.isPending}
                className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> {send.isPending ? 'Enviando...' : 'Enviar pedido'}
              </Button>
            </>
          )}
          {canReceive && (
            <Button
              size="sm"
              onClick={() => setReceiveOpen(true)}
              className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Receber mercadoria
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <CossPanel className="space-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Fornecedor</span>
          <p className="text-xs font-bold text-zinc-900">{order.supplier.tradeName || order.supplier.legalName}</p>
        </CossPanel>
        <CossPanel className="space-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total</span>
          <p className="text-base font-extrabold font-mono text-zinc-900">{formatCurrency(order.totalCents)}</p>
        </CossPanel>
        <CossPanel className="space-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Recebido</span>
          <p className="text-xs font-bold text-zinc-900">
            <span className="text-emerald-700 font-mono">{totalReceived}</span> / {totalQty}
          </p>
        </CossPanel>
        <CossPanel className="space-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Previsão</span>
          <p className="text-xs font-bold text-zinc-900 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-zinc-400" /> {formatDate(order.expectedDate)}
          </p>
        </CossPanel>
      </div>

      <CossPanel className="space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
          <Package className="w-4 h-4 text-zinc-500" />
          <h3 className="text-sm font-bold text-zinc-900">Itens</h3>
        </div>
        <div className="space-y-2">
          {order.items.map((it) => {
            const progress = it.quantity > 0 ? Math.min(100, (it.receivedQty / it.quantity) * 100) : 0;
            const isComplete = it.receivedQty >= it.quantity;
            return (
              <div key={it.id} className="p-3 rounded-xl border border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-900 truncate">{it.product.name}</p>
                    <p className="text-[10px] text-zinc-500">
                      {it.quantity} {it.product.unit} × {formatCurrency(it.unitCostCents)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-sm text-zinc-900">
                      {formatCurrency(it.totalCents)}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono">
                      Recebido: <strong className={isComplete ? 'text-emerald-700' : 'text-zinc-700'}>{it.receivedQty}</strong>/{it.quantity}
                    </p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CossPanel>

      {order.notes && (
        <CossPanel className="space-y-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Observações
          </span>
          <p className="text-xs text-zinc-700 leading-relaxed">{order.notes}</p>
        </CossPanel>
      )}

      {order.batches.length > 0 && (
        <CossPanel className="space-y-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="w-3 h-3" /> Lotes gerados ({order.batches.length})
          </span>
          <div className="space-y-1">
            {order.batches.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50">
                <span className="font-mono text-[11px] text-zinc-700">{b.lotNumber}</span>
                <span className="text-[11px] text-zinc-500">{formatDate(b.expiryDate)}</span>
              </div>
            ))}
          </div>
        </CossPanel>
      )}

      <ReceiveOrderDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        items={order.items}
        onSuccess={() => {
          setReceiveOpen(false);
          queryClient.invalidateQueries({ queryKey: ['purchase-order', slug, orderId] });
          queryClient.invalidateQueries({ queryKey: ['batches', slug] });
          queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
        }}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Cancelar pedido de compra?"
        description="O pedido será marcado como cancelado e não poderá mais ser enviado ao fornecedor. Esta ação não pode ser desfeita."
        confirmLabel="Cancelar pedido"
        cancelLabel="Manter pedido"
        tone="destructive"
        onConfirm={async () => {
          await cancel.mutateAsync();
        }}
      />
    </div>
  );
};

interface ReceiveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PurchaseOrderDetail['items'];
  onSuccess: () => void;
}

const ReceiveOrderDialog: React.FC<ReceiveOrderDialogProps> = ({ open, onOpenChange, items, onSuccess }) => {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const [receipts, setReceipts] = useState<Record<string, { qty: number; lot: string; expiry: string; cost: number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setFor = (itemId: string, patch: any) => {
    setReceipts((prev) => {
      const current = prev[itemId] || {};
      return { ...prev, [itemId]: { ...current, ...patch } };
    });
  };

  const submit = async () => {
    const payload = {
      receipts: items
        .filter((i) => Number(receipts[i.id]?.qty) > 0)
        .map((i) => ({
          itemId: i.id,
          receivedQty: receipts[i.id].qty,
          lotNumber: receipts[i.id].lot || undefined,
          expiryDate: receipts[i.id].expiry || undefined,
          costCents: receipts[i.id].cost || i.unitCostCents,
        })),
    };
    if (payload.receipts.length === 0) {
      toast.error('Informe a quantidade recebida em pelo menos 1 item');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiPost(`/tenant-app/${slug}/purchase-orders/${orderId}/receive`, payload);
      toast.success('Recebimento registrado!');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Falha ao registrar recebimento');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white rounded-3xl p-6 border-zinc-200 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-600" />
            Receber Mercadoria
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {items.map((it) => {
            const remaining = it.quantity - it.receivedQty;
            const current = receipts[it.id] || { qty: 0, lot: '', expiry: '', cost: 0 };
            return (
              <div key={it.id} className="p-3 rounded-xl border border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{it.product.name}</p>
                    <p className="text-[10px] text-zinc-500">
                      Pedido: {it.quantity} · Já recebido: {it.receivedQty} · Restante: <strong>{remaining}</strong>
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold block">Qtd agora</label>
                    <CossInput
                      type="number"
                      min={0}
                      max={remaining}
                      value={current.qty || ''}
                      onChange={(e) => setFor(it.id, { qty: Math.max(0, Math.min(remaining, Number(e.target.value) || 0)) })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold block">Lote</label>
                    <CossInput
                      value={current.lot}
                      onChange={(e) => setFor(it.id, { lot: e.target.value })}
                      placeholder="LOTE-001"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold block">Validade</label>
                    <CossInput
                      type="date"
                      value={current.expiry}
                      onChange={(e) => setFor(it.id, { expiry: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold block">Custo (R$)</label>
                    <CossInput
                      type="number"
                      value={(current.cost || it.unitCostCents / 100).toFixed(2)}
                      onChange={(e) => setFor(it.id, { cost: Math.round(Number(e.target.value) * 100) || 0 })}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs rounded-xl">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={isSubmitting}
            className="bg-emerald-600 text-white text-xs font-bold rounded-xl"
          >
            {isSubmitting ? 'Processando...' : 'Confirmar recebimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
