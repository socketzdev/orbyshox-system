import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Search,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
  History,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
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

export const StockOverviewPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'LOW' | 'OUT' | 'OK'>('ALL');

  // Quick adjustment modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newQuantity, setNewQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('Contagem de conferência / Balanço');

  // Kardex history modal
  const [kardexModalOpen, setKardexModalOpen] = useState(false);
  const [kardexProductId, setKardexProductId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-overview', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/stock/overview`),
    refetchInterval: 15000,
  });

  const { data: kardexMovements = [], isLoading: isLoadingKardex } = useQuery({
    queryKey: ['stock-movements', slug, kardexProductId],
    queryFn: () => apiGet(`/tenant-app/${slug}/stock/movements?productId=${kardexProductId}`),
    enabled: kardexModalOpen && !!kardexProductId,
    refetchInterval: 15000,
  });

  const products = data?.products || [];
  const summary = data?.summary || {
    totalProducts: 0,
    totalStockValueCents: 0,
    totalSaleValueCents: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };

  const adjustMutation = useMutation({
    mutationFn: ({ id, qty, reason }: { id: string; qty: number; reason: string }) =>
      apiPost(`/tenant-app/${slug}/products/${id}/adjust-stock`, {
        newQuantity: qty,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-overview', slug] });
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-dashboard', slug] });
      toast.success('Estoque atualizado e registrado no Kardex!');
      setAdjustModalOpen(false);
      setSelectedProduct(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao ajustar estoque');
    },
  });

  const handleOpenAdjust = (prod: any) => {
    setSelectedProduct(prod);
    setNewQuantity(String(prod.stockQuantity));
    setAdjustmentReason('Contagem de conferência / Balanço');
    setAdjustModalOpen(true);
  };

  const handleOpenKardex = (prod: any) => {
    setSelectedProduct(prod);
    setKardexProductId(prod.id);
    setKardexModalOpen(true);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const qty = parseFloat(newQuantity.replace(',', '.') || '0');
    if (isNaN(qty) || qty < 0) return toast.error('Quantidade inválida');
    adjustMutation.mutate({
      id: selectedProduct.id,
      qty,
      reason: adjustmentReason,
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchTerm)) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));

      const qty = Number(p.stockQuantity);
      const min = Number(p.minStockAlert);

      if (!matchesSearch) return false;

      if (filterTab === 'LOW') return qty > 0 && qty <= min;
      if (filterTab === 'OUT') return qty <= 0;
      if (filterTab === 'OK') return qty > min;
      return true;
    });
  }, [products, searchTerm, filterTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-emerald-600" />
            Estoque Geral & Kardex
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Monitoramento de saldo físico, alertas de reposição, valorização de patrimônio e histórico de movimentações.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['stock-overview', slug] })}
          className="rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar Dados</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Produtos em Linha
          </span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{summary.totalProducts}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Itens cadastrados</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Estoque em Custo
          </span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{brl(summary.totalStockValueCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Patrimônio imobilizado</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Potencial de Venda
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">{brl(summary.totalSaleValueCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Valor bruto estimado</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Alertas Críticos
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-amber-600 font-mono">{summary.lowStockCount}</span>
            <span className="text-xs text-zinc-400">baixos /</span>
            <span className="text-2xl font-bold text-rose-600 font-mono">{summary.outOfStockCount}</span>
            <span className="text-xs text-zinc-400">zerados</span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Necessitam reposição</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'Todos os Itens', count: products.length },
              { id: 'LOW', label: 'Estoque Baixo', count: summary.lowStockCount, alert: true },
              { id: 'OUT', label: 'Esgotados / Zerados', count: summary.outOfStockCount, danger: true },
              { id: 'OK', label: 'Estoque Normal', count: products.length - summary.lowStockCount - summary.outOfStockCount },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                  filterTab === tab.id
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    filterTab === tab.id
                      ? 'bg-zinc-800 text-zinc-200'
                      : tab.danger
                      ? 'bg-rose-100 text-rose-700 font-bold'
                      : tab.alert
                      ? 'bg-amber-100 text-amber-700 font-bold'
                      : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, SKU, código de barras..."
              className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Produto</th>
                <th className="py-3 px-4">Cód. Barras / SKU</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4 text-right">Preço Custo</th>
                <th className="py-3 px-4 text-right">Preço Venda</th>
                <th className="py-3 px-4 text-center">Saldo Atual</th>
                <th className="py-3 px-4 text-center">Mínimo</th>
                <th className="py-3 px-4 text-center">Situação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={9} />)
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <ErpEmptyState
                      icon={Boxes}
                      title="Nenhum produto correspondente"
                      description="Ajuste os filtros de busca para visualizar outros itens do estoque."
                    />
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p: any) => {
                  const qty = Number(p.stockQuantity);
                  const min = Number(p.minStockAlert);
                  const isOut = qty <= 0;
                  const isLow = qty > 0 && qty <= min;

                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-zinc-900 block">{p.name}</span>
                        {p.brand && <span className="text-[10px] text-zinc-400 block">{p.brand}</span>}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-500 whitespace-nowrap">
                        {p.barcode || p.sku || '-'}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                        {p.category?.name || 'Geral'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-600 whitespace-nowrap">
                        {brl(p.costPriceCents || 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 whitespace-nowrap">
                        {brl(p.salePriceCents || 0)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap font-mono font-bold">
                        <span className={isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-zinc-900'}>
                          {qty} {p.unit || 'UN'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-zinc-400 whitespace-nowrap">
                        {min} {p.unit || 'UN'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isOut ? (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold">
                            Esgotado
                          </Badge>
                        ) : isLow ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                            Estoque Baixo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                            Em Dia
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAdjust(p)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition"
                            title="Ajuste Rápido de Saldo"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenKardex(p)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Ver Histórico Kardex"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Ajuste de Saldo */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
              Ajustar Saldo de Estoque
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              {selectedProduct?.name} ({selectedProduct?.unit || 'UN'})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAdjustment} className="space-y-4 py-2 text-xs">
            <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-zinc-400 uppercase font-semibold block">Saldo Atual no Sistema</span>
                <span className="text-lg font-bold font-mono text-zinc-800">
                  {selectedProduct?.stockQuantity} {selectedProduct?.unit || 'UN'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-zinc-400 uppercase font-semibold block">Mínimo Configurado</span>
                <span className="text-sm font-bold font-mono text-zinc-600">
                  {selectedProduct?.minStockAlert} {selectedProduct?.unit || 'UN'}
                </span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Novo Saldo Físico *</label>
              <Input
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                placeholder="Ex: 50"
                className="h-10 text-sm font-mono rounded-xl"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Motivo do Ajuste *</label>
              <Input
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="Ex: Contagem física, acerto de inventário, etc."
                className="h-9 text-xs rounded-xl"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustModalOpen(false)}
                className="rounded-xl h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={adjustMutation.isPending}
                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-9 text-xs font-semibold"
              >
                {adjustMutation.isPending ? 'Salvando...' : 'Confirmar Ajuste'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Histórico Kardex */}
      <Dialog open={kardexModalOpen} onOpenChange={setKardexModalOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              Histórico de Movimentações (Kardex)
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Extrato detalhado de entradas, vendas e ajustes para: {selectedProduct?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto py-2">
            {isLoadingKardex ? (
              <div className="py-8 text-center text-xs text-zinc-400">Carregando movimentações...</div>
            ) : kardexMovements.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                Nenhuma movimentação registrada para este produto ainda.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3 text-right">Qtd</th>
                    <th className="py-2 px-3 text-right">Saldo Resultante</th>
                    <th className="py-2 px-3">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {kardexMovements.map((m: any) => {
                    const isPositive = m.quantity > 0;
                    return (
                      <tr key={m.id} className="hover:bg-zinc-50/50">
                        <td className="py-2.5 px-3 font-mono text-zinc-500 whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-bold ${
                              m.type === 'SALE_POS'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : m.type === 'LOSS_AVARIA'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : m.type === 'ENTRY_NFE' || m.type === 'ENTRY_MANUAL'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                            }`}
                          >
                            {m.type === 'SALE_POS'
                              ? 'Venda PDV'
                              : m.type === 'LOSS_AVARIA'
                              ? 'Perda / Avaria'
                              : m.type === 'ADJUSTMENT'
                              ? 'Ajuste Manual'
                              : m.type === 'RETURN'
                              ? 'Devolução'
                              : 'Entrada'}
                          </Badge>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          isPositive ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 whitespace-nowrap">
                          {m.balanceAfter}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 max-w-xs truncate" title={m.notes || '-'}>
                          {m.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setKardexModalOpen(false)}
              className="w-full bg-zinc-900 text-white rounded-xl text-xs font-bold"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
