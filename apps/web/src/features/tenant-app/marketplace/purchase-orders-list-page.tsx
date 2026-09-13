import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  ShoppingCart,
  Truck,
  Calendar,
  ChevronRight,
  Send,
  XCircle,
  Package,
  Sparkles,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CossPanel,
  CossBadge,
  CossTable,
  CossTableHeader,
  CossTableBody,
  CossTableRow,
  CossTableHead,
  CossTableCell,
  CossEmpty,
} from '@/components/coss-ui';
import { PageLoader } from '@/components/ui/page-loader';
import { useTenant } from '../context/tenant-context';
import { apiGet, apiPost } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

interface PurchaseOrder {
  id: string;
  status: string;
  totalCents: number;
  expectedDate: string | null;
  createdAt: string;
  supplier: { id: string; tradeName: string | null; legalName: string };
  _count: { items: number };
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Rascunho', className: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  SENT: { label: 'Enviado', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  RECEIVING: { label: 'Recebendo', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  RECEIVED: { label: 'Recebido', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELED: { label: 'Cancelado', className: 'bg-zinc-50 text-zinc-400 border-zinc-200' },
};

export const PurchaseOrdersListPage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: orders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', slug, statusFilter],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-orders`, statusFilter === 'all' ? {} : { status: statusFilter }),
  });

  const { data: suggestions = [] } = useQuery<
    Array<{ productId: string; productName: string; currentStock: number; minStock: number; suggestedQty: number; preferredSupplier?: { id: string; name: string } }>
  >({
    queryKey: ['purchase-suggestions', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-orders/suggestions`),
  });

  return (
    <div className="space-y-5 font-sans pb-12">
      {suggestions.length > 0 && (
        <CossPanel className="bg-gradient-to-r from-amber-50 to-zinc-50 border-amber-200/80 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Sugestão de compra automatizada</h3>
              <p className="text-[11px] text-zinc-600">
                {suggestions.length} produto(s) abaixo do estoque mínimo. Considere gerar um pedido.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate(`${base}/marketplace/purchase-orders/new`)}
              className="ml-auto h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Gerar pedido sugerido
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {suggestions.slice(0, 4).map((s) => (
              <div key={s.productId} className="p-2.5 rounded-xl bg-white border border-amber-200/80">
                <p className="text-xs font-bold text-zinc-900 truncate">{s.productName}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Estoque: <strong className="text-rose-700">{s.currentStock}</strong> / Mín: {s.minStock}
                </p>
                <p className="text-[10px] text-amber-700 font-bold mt-1">Sugestão: {s.suggestedQty} un.</p>
              </div>
            ))}
          </div>
        </CossPanel>
      )}

      <CossPanel className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">Pedidos de Compra</h2>
              <p className="text-xs text-zinc-500">Cotações, envios e recebimentos para fornecedores.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-0.5">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'DRAFT', label: 'Rascunhos' },
                { id: 'SENT', label: 'Enviados' },
                { id: 'RECEIVING', label: 'Recebendo' },
                { id: 'RECEIVED', label: 'Recebidos' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                    statusFilter === opt.id ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => navigate(`${base}/marketplace/purchase-orders/new${params.get('supplierId') ? `?supplierId=${params.get('supplierId')}` : ''}`)}
              className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo pedido
            </Button>
          </div>
        </div>
      </CossPanel>

      {isLoading ? (
        <PageLoader label="Carregando pedidos..." />
      ) : orders.length === 0 ? (
        <CossPanel>
          <CossEmpty
            icon={<ShoppingCart className="w-5 h-5" />}
            title="Nenhum pedido de compra"
            description="Crie pedidos para seus fornecedores e gerencie o ciclo completo: cotação → envio → recebimento → estoque."
            action={
              <Button
                size="sm"
                onClick={() => navigate(`${base}/marketplace/purchase-orders/new`)}
                className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar primeiro pedido
              </Button>
            }
          />
        </CossPanel>
      ) : (
        <CossPanel className="p-0 overflow-hidden">
          <CossTable>
            <CossTableHeader>
              <tr>
                <CossTableHead>Fornecedor</CossTableHead>
                <CossTableHead>Criado em</CossTableHead>
                <CossTableHead className="text-center">Itens</CossTableHead>
                <CossTableHead className="text-right">Total</CossTableHead>
                <CossTableHead>Previsão</CossTableHead>
                <CossTableHead className="text-center">Status</CossTableHead>
                <CossTableHead className="text-right"></CossTableHead>
              </tr>
            </CossTableHeader>
            <CossTableBody>
              {orders.map((o) => {
                const s = STATUS_LABEL[o.status] || STATUS_LABEL.DRAFT;
                return (
                  <CossTableRow key={o.id}>
                    <CossTableCell>
                      <button
                        type="button"
                        onClick={() => navigate(`${base}/marketplace/purchase-orders/${o.id}`)}
                        className="flex items-center gap-2 group text-left"
                      >
                        <div className="w-8 h-8 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center group-hover:bg-zinc-900 group-hover:text-white transition">
                          <Truck className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-zinc-900 text-sm group-hover:text-zinc-700">
                          {o.supplier.tradeName || o.supplier.legalName}
                        </span>
                      </button>
                    </CossTableCell>
                    <CossTableCell className="text-xs text-zinc-700">{formatDate(o.createdAt)}</CossTableCell>
                    <CossTableCell className="text-center font-mono font-bold">{o._count.items}</CossTableCell>
                    <CossTableCell className="text-right font-mono font-bold text-zinc-900">
                      {formatCurrency(o.totalCents)}
                    </CossTableCell>
                    <CossTableCell>
                      <span className="text-xs text-zinc-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-400" /> {formatDate(o.expectedDate)}
                      </span>
                    </CossTableCell>
                    <CossTableCell className="text-center">
                      <CossBadge className={s.className}>{s.label}</CossBadge>
                    </CossTableCell>
                    <CossTableCell className="text-right">
                      <ChevronRight className="w-4 h-4 text-zinc-400 inline" />
                    </CossTableCell>
                  </CossTableRow>
                );
              })}
            </CossTableBody>
          </CossTable>
        </CossPanel>
      )}
    </div>
  );
};
