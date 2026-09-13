import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw,
  Search,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
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
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const ReturnsPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [reason, setReason] = useState('Produto avariado ou com defeito');
  const [refundMethod, setRefundMethod] = useState<'CREDIT' | 'CASH' | 'PIX' | 'REPLACEMENT'>('CREDIT');
  const [refundAmount, setRefundAmount] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');

  // Fetch returns
  const { data: returns = [], isLoading: isLoadingReturns } = useQuery({
    queryKey: ['order-returns', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/pos/returns`),
  });

  // Fetch recent orders to pick from
  const { data: orders = [] } = useQuery({
    queryKey: ['tenant-orders', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/orders?limit=40`),
    enabled: modalOpen,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/pos/returns`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-returns', slug] });
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-orders', slug] });
      toast.success('Devolução registrada com sucesso! Itens e saldos atualizados.');
      setModalOpen(false);
      setSelectedOrderId('');
      setRefundAmount('');
      setItemsSummary('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao registrar devolução');
    },
  });

  const selectedOrder = useMemo(() => {
    return orders.find((o: any) => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    const order = orders.find((o: any) => o.id === orderId);
    if (order) {
      setRefundAmount((order.totalCents / 100).toFixed(2));
      const summary = (order.items || [])
        .map((i: any) => `${i.quantity}x ${i.product?.name || 'Item'}`)
        .join(', ');
      setItemsSummary(summary);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return toast.error('Informe o motivo da devolução');
    const amountCents = Math.round(parseFloat(refundAmount.replace(',', '.') || '0') * 100);

    const itemsToRestock = selectedOrder?.items?.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity,
    })) || [];

    createMutation.mutate({
      orderId: selectedOrderId || null,
      customerId: selectedOrder?.customerId || null,
      reason,
      refundMethod,
      totalRefundCents: amountCents,
      itemsSummary,
      items: itemsToRestock,
    });
  };

  const filteredReturns = useMemo(() => {
    return returns.filter((r: any) => {
      const matchSearch =
        (r.reason && r.reason.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.itemsSummary && r.itemsSummary.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.order?.orderNumber && String(r.order.orderNumber).includes(searchTerm)) ||
        (r.customer?.name && r.customer.name.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchSearch;
    });
  }, [returns, searchTerm]);

  const totalRefundedCents = returns.reduce((sum: number, r: any) => sum + (r.totalRefundCents || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-600" />
            Devoluções & Trocas
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Gerencie devoluções de mercadorias, retorno ao estoque e emissão de créditos ou estornos.
          </p>
        </div>

        <Button
          onClick={() => setModalOpen(true)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Devolução</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total Devoluções
          </span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{returns.length}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Registradas no período</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Volume Estornado
          </span>
          <p className="text-2xl font-bold text-rose-600 mt-1 font-mono">{brl(totalRefundedCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Em vales, dinheiro ou substituição</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Retorno ao Estoque
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">100%</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Sincronizado automaticamente</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cupom, produto, cliente..."
              className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
            />
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {filteredReturns.length} {filteredReturns.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Cupom / Venda</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Itens Devolvidos</th>
                <th className="py-3 px-4">Motivo</th>
                <th className="py-3 px-4">Forma de Estorno</th>
                <th className="py-3 px-4 text-right">Valor Estornado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {isLoadingReturns ? (
                Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} columns={7} />)
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <ErpEmptyState
                      icon={RotateCcw}
                      title="Nenhuma devolução encontrada"
                      description="Quando houver trocas ou devoluções no caixa, elas aparecerão aqui."
                    />
                  </td>
                </tr>
              ) : (
                filteredReturns.map((r: any) => (
                  <tr key={r.id} className="hover:bg-zinc-50/50 transition">
                    <td className="py-3 px-4 text-zinc-500 font-mono whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900 whitespace-nowrap">
                      {r.order?.orderNumber ? `#${r.order.orderNumber}` : 'Balcão Avulso'}
                    </td>
                    <td className="py-3 px-4 text-zinc-700 whitespace-nowrap">
                      {r.customer?.name || 'Cliente Balcão'}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 max-w-xs truncate" title={r.itemsSummary || '-'}>
                      {r.itemsSummary || 'Mercadoria geral'}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 max-w-xs truncate" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${
                          r.refundMethod === 'CREDIT'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : r.refundMethod === 'CASH'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.refundMethod === 'PIX'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        {r.refundMethod === 'CREDIT'
                          ? 'Vale-Crédito'
                          : r.refundMethod === 'CASH'
                          ? 'Dinheiro'
                          : r.refundMethod === 'PIX'
                          ? 'Pix'
                          : 'Substituição'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 whitespace-nowrap">
                      {brl(r.totalRefundCents || 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nova Devolução */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-blue-600" />
              Registrar Devolução / Troca
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Selecione o cupom de origem ou informe os dados da devolução para repor o estoque e gerar crédito.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Venda de Origem (Opcional)</label>
              <select
                value={selectedOrderId}
                onChange={(e) => handleOrderChange(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
              >
                <option value="">-- Devolução Avulsa / Sem Cupom --</option>
                {orders.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    Cupom #{o.orderNumber} — {brl(o.totalCents)} ({new Date(o.createdAt).toLocaleDateString('pt-BR')})
                    {o.customer?.name ? ` - ${o.customer.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Itens a Devolver *</label>
              <Input
                value={itemsSummary}
                onChange={(e) => setItemsSummary(e.target.value)}
                placeholder="Ex: 2x Refrigerante Lata 350ml, 1x Biscoito"
                className="h-9 text-xs rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Valor do Estorno (R$) *</label>
                <Input
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0,00"
                  className="h-9 text-xs font-mono rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Forma de Estorno *</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="CREDIT">Vale-Crédito (Loja)</option>
                  <option value="CASH">Dinheiro em Espécie</option>
                  <option value="PIX">Pix / Transferência</option>
                  <option value="REPLACEMENT">Troca por outro produto</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Motivo da Devolução *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
              >
                <option value="Produto avariado ou com defeito">Produto avariado ou com defeito</option>
                <option value="Produto vencido">Produto vencido</option>
                <option value="Arrependimento / Troca de sabor ou tamanho">Arrependimento / Troca</option>
                <option value="Cobrança incorreta no caixa">Cobrança incorreta no caixa</option>
                <option value="Embalagem violada">Embalagem violada</option>
                <option value="Outro">Outro motivo</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-xl h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-9 text-xs font-semibold"
              >
                {createMutation.isPending ? 'Gravando...' : 'Confirmar Devolução'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
