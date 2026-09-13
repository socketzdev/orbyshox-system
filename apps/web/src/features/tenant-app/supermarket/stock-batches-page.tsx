import React, { useState, useMemo } from 'react';
import { useTenant } from '../context/tenant-context';
import {
  Package,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  Filter,
  Flame,
  Trash2,
  Tag,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingDown,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

export type ExpiryStatus = 'CRITICAL' | 'WARNING' | 'ATTENTION' | 'HEALTHY' | 'EXPIRED';

export interface StockBatch {
  id: string;
  productName: string;
  category: string;
  batchNumber: string;
  manufactureDate: string;
  expirationDate: string; // YYYY-MM-DD
  quantity: number;
  unit: string;
  unitCost: number;
  salePrice: number;
  clearanceDiscountPercent?: number; // E.g. 30% discount applied to sell fast
}

const INITIAL_BATCHES: StockBatch[] = [
  {
    id: 'b-1',
    productName: 'Iogurte Natural Integral 170g',
    category: 'Laticínios',
    batchNumber: 'LOT-2026-09A',
    manufactureDate: '2026-08-20',
    expirationDate: '2026-09-12', // Critical: 3 days remaining!
    quantity: 48,
    unit: 'un',
    unitCost: 2.1,
    salePrice: 4.5,
    clearanceDiscountPercent: 40,
  },
  {
    id: 'b-2',
    productName: 'Queijo Muçarela Peça 4kg',
    category: 'Frios & Queijos',
    batchNumber: 'LOT-5542',
    manufactureDate: '2026-08-10',
    expirationDate: '2026-09-15', // Critical: 6 days remaining
    quantity: 6,
    unit: 'peça',
    unitCost: 110.0,
    salePrice: 160.0,
    clearanceDiscountPercent: 25,
  },
  {
    id: 'b-3',
    productName: 'Presunto Fatiado Sadia 200g',
    category: 'Frios & Queijos',
    batchNumber: 'LOT-8812',
    manufactureDate: '2026-08-25',
    expirationDate: '2026-09-21', // Warning: 12 days remaining
    quantity: 35,
    unit: 'un',
    unitCost: 6.2,
    salePrice: 11.9,
  },
  {
    id: 'b-4',
    productName: 'Leite Condensado Moça 395g',
    category: 'Mercearia Doce',
    batchNumber: 'LOT-9011',
    manufactureDate: '2026-06-15',
    expirationDate: '2026-09-30', // Attention: 21 days remaining
    quantity: 120,
    unit: 'un',
    unitCost: 5.5,
    salePrice: 8.9,
  },
  {
    id: 'b-5',
    productName: 'Arroz Branco Tipo 1 5kg',
    category: 'Grãos & Cereais',
    batchNumber: 'LOT-3341',
    manufactureDate: '2026-08-01',
    expirationDate: '2027-02-28', // Healthy: > 100 days
    quantity: 250,
    unit: 'pct',
    unitCost: 21.0,
    salePrice: 29.9,
  },
  {
    id: 'b-6',
    productName: 'Café Torrado e Moído 500g',
    category: 'Mercearia',
    batchNumber: 'LOT-1102',
    manufactureDate: '2026-07-10',
    expirationDate: '2027-01-15', // Healthy
    quantity: 90,
    unit: 'un',
    unitCost: 11.5,
    salePrice: 16.9,
  },
];

export const StockBatchesPage: React.FC = () => {
  const { slug } = useTenant();

  const [batches, setBatches] = useState<StockBatch[]>(() => {
    const saved = localStorage.getItem(`stock_batches_${slug}`);
    return saved ? JSON.parse(saved) : INITIAL_BATCHES;
  });

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // New Batch Modal
  const [isNewBatchOpen, setIsNewBatchOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newCategory, setNewCategory] = useState('Laticínios');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newExpDate, setNewExpDate] = useState('');
  const [newQuantity, setNewQuantity] = useState(10);
  const [newUnit, setNewUnit] = useState('un');
  const [newUnitCost, setNewUnitCost] = useState(10.0);
  const [newSalePrice, setNewSalePrice] = useState(15.0);

  // Clearance Modal
  const [clearanceBatch, setClearanceBatch] = useState<StockBatch | null>(null);
  const [clearanceDiscount, setClearanceDiscount] = useState<number>(30);

  // Discard confirmation state
  const [batchToDiscard, setBatchToDiscard] = useState<string | null>(null);

  const saveBatches = (newBatches: StockBatch[]) => {
    setBatches(newBatches);
    localStorage.setItem(`stock_batches_${slug}`, JSON.stringify(newBatches));
  };

  // Helper: compute days left until expiration
  const getDaysUntilExpiration = (expDateString: string) => {
    if (!expDateString) return Number.POSITIVE_INFINITY;
    const target = new Date(expDateString);
    if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Helper: get status
  const getBatchExpiryStatus = (daysLeft: number): ExpiryStatus => {
    if (daysLeft < 0) return 'EXPIRED';
    if (daysLeft <= 7) return 'CRITICAL';
    if (daysLeft <= 15) return 'WARNING';
    if (daysLeft <= 30) return 'ATTENTION';
    return 'HEALTHY';
  };

  // KPIs
  const kpis = useMemo(() => {
    let criticalCount = 0;
    let warningCount = 0;
    let totalRiskAmount = 0;
    let clearanceCount = 0;

    batches.forEach((b) => {
      const days = getDaysUntilExpiration(b.expirationDate);
      const status = getBatchExpiryStatus(days);

      if (status === 'CRITICAL' || status === 'EXPIRED') {
        criticalCount++;
        totalRiskAmount += b.quantity * b.unitCost;
      } else if (status === 'WARNING') {
        warningCount++;
        totalRiskAmount += b.quantity * b.unitCost * 0.5;
      }

      if (b.clearanceDiscountPercent && b.clearanceDiscountPercent > 0) {
        clearanceCount++;
      }
    });

    return {
      criticalCount,
      warningCount,
      totalRiskAmount,
      clearanceCount,
      totalBatches: batches.length,
    };
  }, [batches]);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const days = getDaysUntilExpiration(b.expirationDate);
      const status = getBatchExpiryStatus(days);

      const matchFilter =
        filterStatus === 'ALL' ||
        (filterStatus === 'CRITICAL' && (status === 'CRITICAL' || status === 'EXPIRED')) ||
        (filterStatus === 'WARNING' && status === 'WARNING') ||
        (filterStatus === 'ATTENTION' && status === 'ATTENTION') ||
        (filterStatus === 'HEALTHY' && status === 'HEALTHY') ||
        (filterStatus === 'CLEARANCE' && Boolean(b.clearanceDiscountPercent));

      const matchQuery =
        b.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.category.toLowerCase().includes(searchQuery.toLowerCase());

      return matchFilter && matchQuery;
    });
  }, [batches, filterStatus, searchQuery]);

  // Handle Apply Clearance Discount
  const handleApplyClearance = () => {
    if (!clearanceBatch) return;
    const updated = batches.map((b) =>
      b.id === clearanceBatch.id ? { ...b, clearanceDiscountPercent: clearanceDiscount } : b
    );
    saveBatches(updated);
    setClearanceBatch(null);
  };

  // Handle Write-off / Discard batch (Avaria ou Vencido)
  const handleDiscardBatch = (id: string) => {
    setBatchToDiscard(id);
  };

  const confirmDiscardBatch = () => {
    if (batchToDiscard) {
      saveBatches(batches.filter((b) => b.id !== batchToDiscard));
      setBatchToDiscard(null);
    }
  };

  // Handle Create New Batch
  const handleCreateBatch = () => {
    if (!newProductName.trim() || !newBatchNumber.trim() || !newExpDate) return;

    const newB: StockBatch = {
      id: `b-${Date.now()}`,
      productName: newProductName.trim(),
      category: newCategory,
      batchNumber: newBatchNumber.trim(),
      manufactureDate: new Date().toISOString().split('T')[0],
      expirationDate: newExpDate,
      quantity: Number(newQuantity),
      unit: newUnit,
      unitCost: Number(newUnitCost),
      salePrice: Number(newSalePrice),
    };

    saveBatches([newB, ...batches]);
    setIsNewBatchOpen(false);
    setNewProductName('');
    setNewBatchNumber('');
    setNewExpDate('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Top KPIs ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-rose-50/60 rounded-3xl p-5 border border-rose-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800">Crítico (&lt; 7 dias)</span>
            <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
          </div>
          <p className="text-3xl font-extrabold font-mono text-rose-900 mt-2">
            {kpis.criticalCount} lotes
          </p>
          <span className="text-[11px] text-rose-700">Ação imediata de queima ou descarte</span>
        </div>

        <div className="bg-amber-50/60 rounded-3xl p-5 border border-amber-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">Alerta (8 a 15 dias)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-3xl font-extrabold font-mono text-amber-900 mt-2">
            {kpis.warningCount} lotes
          </p>
          <span className="text-[11px] text-amber-700">Queima promocional recomendada</span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Valor em Risco (Custo)</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-bold font-mono text-zinc-900 mt-2">
            R$ {kpis.totalRiskAmount.toFixed(2).replace('.', ',')}
          </p>
          <span className="text-[11px] text-zinc-400">Produtos próximos da validade</span>
        </div>

        <div className="bg-zinc-900 text-white rounded-3xl p-5 border border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total de Lotes Ativos</span>
            <Package className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-3xl font-bold font-mono text-white">{kpis.totalBatches}</p>
            <Button
              size="sm"
              onClick={() => setIsNewBatchOpen(true)}
              className="bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs rounded-xl h-8 px-3 gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Lote
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Filters & Search ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={filterStatus === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('ALL')}
            className={`rounded-xl text-xs font-semibold h-8 ${filterStatus === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'}`}
          >
            Todos ({batches.length})
          </Button>
          <Button
            variant={filterStatus === 'CRITICAL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('CRITICAL')}
            className={`rounded-xl text-xs font-semibold h-8 ${filterStatus === 'CRITICAL' ? 'bg-rose-700 text-white' : 'bg-white text-rose-700 border-rose-200'}`}
          >
            Críticos ({kpis.criticalCount})
          </Button>
          <Button
            variant={filterStatus === 'WARNING' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('WARNING')}
            className={`rounded-xl text-xs font-semibold h-8 ${filterStatus === 'WARNING' ? 'bg-amber-700 text-white' : 'bg-white text-amber-700 border-amber-200'}`}
          >
            Alerta ({kpis.warningCount})
          </Button>
          <Button
            variant={filterStatus === 'CLEARANCE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('CLEARANCE')}
            className={`rounded-xl text-xs font-semibold h-8 ${filterStatus === 'CLEARANCE' ? 'bg-orange-600 text-white' : 'bg-white text-orange-600 border-orange-200'}`}
          >
            Em Queima ({kpis.clearanceCount})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar lote ou produto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs rounded-xl bg-white border-zinc-200"
          />
        </div>
      </div>

      {/* ─── Batches Table ─── */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200/70 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Produto / Categoria</th>
                <th className="py-3 px-4">Lote Nº</th>
                <th className="py-3 px-4">Validade</th>
                <th className="py-3 px-4">Dias Restantes</th>
                <th className="py-3 px-4 text-center">Qtd em Estoque</th>
                <th className="py-3 px-4 text-right">Preço PDV</th>
                <th className="py-3 px-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400 text-xs">
                    Nenhum lote encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const daysLeft = getDaysUntilExpiration(batch.expirationDate);
                  const status = getBatchExpiryStatus(daysLeft);

                  const statusConfig = {
                    CRITICAL: {
                      badge: 'bg-rose-100 text-rose-800 border-rose-300',
                      text: `${daysLeft} dias (Crítico)`,
                    },
                    WARNING: {
                      badge: 'bg-amber-100 text-amber-800 border-amber-300',
                      text: `${daysLeft} dias (Alerta)`,
                    },
                    ATTENTION: {
                      badge: 'bg-yellow-50 text-yellow-800 border-yellow-300',
                      text: `${daysLeft} dias`,
                    },
                    HEALTHY: {
                      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                      text: `${daysLeft} dias (Saudável)`,
                    },
                    EXPIRED: {
                      badge: 'bg-rose-200 text-rose-900 border-rose-400 font-bold',
                      text: 'VENCIDO!',
                    },
                  }[status];

                  const effectiveSalePrice = batch.clearanceDiscountPercent
                    ? batch.salePrice * (1 - batch.clearanceDiscountPercent / 100)
                    : batch.salePrice;

                  return (
                    <tr key={batch.id} className="hover:bg-zinc-50/70 transition">
                      <td className="py-3 px-4">
                        <span className="font-bold text-zinc-900 block">{batch.productName}</span>
                        <span className="text-[10px] text-zinc-400">{batch.category}</span>
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-zinc-600">
                        {batch.batchNumber}
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-700">
                        {batch.expirationDate.split('-').reverse().join('/')}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${statusConfig.badge}`}
                        >
                          {statusConfig.text}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-zinc-900">
                        {batch.quantity} {batch.unit}
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        {batch.clearanceDiscountPercent ? (
                          <div>
                            <span className="text-zinc-400 line-through text-[11px] block">
                              R$ {batch.salePrice.toFixed(2).replace('.', ',')}
                            </span>
                            <span className="font-bold text-rose-600">
                              R$ {effectiveSalePrice.toFixed(2).replace('.', ',')}{' '}
                              <span className="text-[10px] bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                -{batch.clearanceDiscountPercent}%
                              </span>
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-zinc-900">
                            R$ {batch.salePrice.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setClearanceBatch(batch);
                              setClearanceDiscount(batch.clearanceDiscountPercent || 30);
                            }}
                            className="h-7 text-[11px] font-bold text-orange-700 bg-orange-50/50 border-orange-200 hover:bg-orange-100 rounded-xl gap-1"
                          >
                            <Flame className="w-3 h-3 text-orange-600" />
                            Queima
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDiscardBatch(batch.id)}
                            className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl"
                            title="Descartar lote vencido / avaria"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

      {/* ─── Modal: Aplicar Desconto de Queima ─── */}
      <Dialog open={Boolean(clearanceBatch)} onOpenChange={() => setClearanceBatch(null)}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-600" />
              Aplicar Desconto de Queima
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Reduza o preço de venda no PDV para acelerar o giro antes do vencimento
            </DialogDescription>
          </DialogHeader>

          {clearanceBatch && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-1">
                <span className="font-bold text-zinc-900 block">{clearanceBatch.productName}</span>
                <span className="text-zinc-500 font-mono">
                  Lote: {clearanceBatch.batchNumber} • Vence em: {clearanceBatch.expirationDate}
                </span>
                <div className="flex justify-between pt-1 text-zinc-700 font-mono">
                  <span>Preço Normal: R$ {clearanceBatch.salePrice.toFixed(2).replace('.', ',')}</span>
                  <span>Custo: R$ {clearanceBatch.unitCost.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Percentual de Desconto de Queima:</Label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[20, 30, 40, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setClearanceDiscount(pct)}
                      className={`py-1.5 rounded-xl border text-xs font-bold transition ${
                        clearanceDiscount === pct
                          ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      -{pct}%
                    </button>
                  ))}
                </div>

                <div className="p-3 bg-orange-50 rounded-2xl border border-orange-200 text-orange-900 font-mono font-bold flex justify-between items-center">
                  <span>Novo Preço no PDV:</span>
                  <span className="text-base">
                    R${' '}
                    {(clearanceBatch.salePrice * (1 - clearanceDiscount / 100))
                      .toFixed(2)
                      .replace('.', ',')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearanceBatch(null)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleApplyClearance}
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl"
            >
              Confirmar Queima Promocional
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Novo Lote Recebido ─── */}
      <Dialog open={isNewBatchOpen} onOpenChange={setIsNewBatchOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-zinc-600" />
              Cadastrar Novo Lote Recebido
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-zinc-600 mb-1 block">Nome do Produto</Label>
              <Input
                placeholder="Ex: Iogurte Grego Tradicional 100g"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Categoria</Label>
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Número do Lote</Label>
                <Input
                  placeholder="Ex: LOT-2026-X"
                  value={newBatchNumber}
                  onChange={(e) => setNewBatchNumber(e.target.value)}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Data de Validade</Label>
                <Input
                  type="date"
                  value={newExpDate}
                  onChange={(e) => setNewExpDate(e.target.value)}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Quantidade</Label>
                <Input
                  type="number"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(Number(e.target.value))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Unidade</Label>
                <Input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Custo Unitário (R$)</Label>
                <Input
                  type="number"
                  step="0.50"
                  value={newUnitCost}
                  onChange={(e) => setNewUnitCost(Number(e.target.value))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Preço de Venda (R$)</Label>
                <Input
                  type="number"
                  step="0.50"
                  value={newSalePrice}
                  onChange={(e) => setNewSalePrice(Number(e.target.value))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNewBatchOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateBatch}
              className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
            >
              Cadastrar Lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={batchToDiscard !== null}
        onOpenChange={(open) => {
          if (!open) setBatchToDiscard(null);
        }}
        title="Dar baixa no lote"
        description="Confirma a baixa por avaria/vencimento deste lote? O estoque será zerado."
        confirmLabel="Confirmar baixa"
        cancelLabel="Cancelar"
        onConfirm={confirmDiscardBatch}
      />
    </div>
  );
};
