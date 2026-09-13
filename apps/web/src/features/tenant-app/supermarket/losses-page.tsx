import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Search,
  Plus,
  TrendingDown,
  Calendar,
  DollarSign,
  Package,
  Trash2,
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

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  EXPIRED: { label: 'Vencido', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  DAMAGED: { label: 'Avariado / Danificado', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  BREAKAGE: { label: 'Quebra Operacional', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  THEFT: { label: 'Furto / Desvio', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  DISCARD: { label: 'Descarte Sanitário', color: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  OTHER: { label: 'Outro', color: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

export const LossesPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('EXPIRED');
  const [notes, setNotes] = useState('');

  const { data: losses = [], isLoading } = useQuery({
    queryKey: ['stock-losses', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/stock/losses`),
  });

  const { data: productsData } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
    enabled: modalOpen,
  });

  const products = productsData?.products || [];

  const selectedProduct = useMemo(() => {
    return products.find((p: any) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const estimatedCostCents = useMemo(() => {
    if (!selectedProduct) return 0;
    const qty = parseFloat(quantity.replace(',', '.') || '0');
    return Math.round((Number(selectedProduct.costPriceCents) || 0) * qty);
  }, [selectedProduct, quantity]);

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/stock/losses`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-losses', slug] });
      queryClient.invalidateQueries({ queryKey: ['stock-overview', slug] });
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-dashboard', slug] });
      toast.success('Perda registrada e estoque baixado automaticamente!');
      setModalOpen(false);
      setSelectedProductId('');
      setQuantity('1');
      setNotes('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao registrar perda'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return toast.error('Selecione o produto');
    const qty = parseFloat(quantity.replace(',', '.') || '0');
    if (isNaN(qty) || qty <= 0) return toast.error('Informe uma quantidade válida');

    createMutation.mutate({
      productId: selectedProductId,
      quantity: qty,
      reason,
      costCents: estimatedCostCents,
      notes,
    });
  };

  const filteredLosses = useMemo(() => {
    return losses.filter((l: any) => {
      const matchSearch =
        (l.product?.name && l.product.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchSearch;
    });
  }, [losses, searchTerm]);

  const totalCostCents = losses.reduce((sum: number, l: any) => sum + (l.costCents || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            Perdas & Avarias
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Registro de produtos vencidos, avariados, quebras e furtos com baixa automática de estoque.
          </p>
        </div>

        <Button
          onClick={() => setModalOpen(true)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Perda</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Custo Total de Perdas
          </span>
          <p className="text-2xl font-bold text-rose-600 mt-1 font-mono">{brl(totalCostCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Prejuízo acumulado registrado</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Ocorrências
          </span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{losses.length}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Descartes e quebras</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Baixa de Estoque
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">Automática</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Kardex sincronizado</span>
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
              placeholder="Buscar por produto, observação..."
              className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
            />
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {filteredLosses.length} {filteredLosses.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Produto</th>
                <th className="py-3 px-4">Motivo</th>
                <th className="py-3 px-4 text-center">Quantidade</th>
                <th className="py-3 px-4 text-right">Custo da Perda</th>
                <th className="py-3 px-4">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} columns={6} />)
              ) : filteredLosses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <ErpEmptyState
                      icon={AlertTriangle}
                      title="Nenhuma perda registrada"
                      description="Excelente! Não há registros de descarte ou quebra no momento."
                    />
                  </td>
                </tr>
              ) : (
                filteredLosses.map((l: any) => {
                  const meta = REASON_LABELS[l.reason] || REASON_LABELS.OTHER;
                  return (
                    <tr key={l.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-3 px-4 text-zinc-500 font-mono whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-zinc-900 block">{l.product?.name}</span>
                        {l.product?.brand && <span className="text-[10px] text-zinc-400 block">{l.product.brand}</span>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] font-semibold ${meta.color}`}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-zinc-800 whitespace-nowrap">
                        {l.quantity} {l.product?.unit || 'UN'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                        {brl(l.costCents || 0)}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 max-w-xs truncate" title={l.notes || '-'}>
                        {l.notes || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Registrar Perda */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Registrar Perda / Avaria
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              A quantidade informada será baixada do estoque imediatamente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Produto *</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                required
              >
                <option value="">Selecione um produto...</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Estoque: {p.stockQuantity} {p.unit}) — Custo: {brl(p.costPriceCents || 0)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Quantidade *</label>
                <Input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  className="h-9 text-xs font-mono rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Motivo da Baixa *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="EXPIRED">Vencido</option>
                  <option value="DAMAGED">Avariado / Danificado</option>
                  <option value="BREAKAGE">Quebra Operacional</option>
                  <option value="THEFT">Furto / Desvio</option>
                  <option value="DISCARD">Descarte Sanitário</option>
                  <option value="OTHER">Outro</option>
                </select>
              </div>
            </div>

            {selectedProduct && (
              <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200 flex justify-between items-center text-xs">
                <span className="text-zinc-500">Custo Estimado do Prejuízo:</span>
                <span className="font-mono font-bold text-rose-600">{brl(estimatedCostCents)}</span>
              </div>
            )}

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Observações / Detalhes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Caiu no chão durante reposição do corredor 3"
                className="h-9 text-xs rounded-xl"
              />
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
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-9 text-xs font-semibold"
              >
                {createMutation.isPending ? 'Gravando...' : 'Confirmar Baixa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
