import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Search,
  Barcode,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Plus,
  History,
  Boxes,
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

export const InventoryPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [confirmReconcileOpen, setConfirmReconcileOpen] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Fetch audits
  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['inventory-audits', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/stock/inventory`),
    refetchInterval: 30000,
  });

  const openAudit = useMemo(() => {
    return audits.find((a: any) => a.status === 'OPEN') || null;
  }, [audits]);

  // Create audit mutation
  const createAuditMutation = useMutation({
    mutationFn: () => apiPost(`/tenant-app/${slug}/stock/inventory`, { notes: 'Inventário Geral' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-audits', slug] });
      toast.success('Inventário aberto com sucesso! Inicie a contagem ou bipagem.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao abrir inventário'),
  });

  // Count item mutation
  const countMutation = useMutation({
    mutationFn: ({ auditId, productId, countedQty }: { auditId: string; productId: string; countedQty: number }) =>
      apiPost(`/tenant-app/${slug}/stock/inventory/${auditId}/count`, {
        productId,
        countedQty,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-audits', slug] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao registrar contagem'),
  });

  // Reconcile audit mutation
  const reconcileMutation = useMutation({
    mutationFn: (auditId: string) => apiPost(`/tenant-app/${slug}/stock/inventory/${auditId}/reconcile`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-audits', slug] });
      queryClient.invalidateQueries({ queryKey: ['stock-overview', slug] });
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      toast.success('Estoque conciliado e inventário concluído com sucesso!');
      setConfirmReconcileOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao conciliar inventário'),
  });

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openAudit) return;
    const term = barcodeInput.trim();
    if (!term) return;

    const matchedItem = (openAudit.items || []).find((it: any) => {
      const p = it.product;
      return (
        (p.barcode && p.barcode === term) ||
        (p.sku && p.sku.toLowerCase() === term.toLowerCase()) ||
        p.name.toLowerCase().includes(term.toLowerCase())
      );
    });

    if (!matchedItem) {
      toast.error(`Produto não encontrado para o código "${term}"`);
      setBarcodeInput('');
      return;
    }

    const nextCount = Number(matchedItem.countedQty || 0) + 1;
    countMutation.mutate({
      auditId: openAudit.id,
      productId: matchedItem.productId,
      countedQty: nextCount,
    });

    toast.success(`+1 contagem para: ${matchedItem.product.name} (Total: ${nextCount})`);
    setBarcodeInput('');
    barcodeRef.current?.focus();
  };

  const handleManualCountChange = (item: any, val: string) => {
    if (!openAudit) return;
    const num = parseFloat(val.replace(',', '.') || '0');
    if (isNaN(num) || num < 0) return;
    countMutation.mutate({
      auditId: openAudit.id,
      productId: item.productId,
      countedQty: num,
    });
  };

  const filteredItems = useMemo(() => {
    if (!openAudit?.items) return [];
    return openAudit.items.filter((item: any) => {
      const p = item.product;
      const matches =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchTerm)) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      return matches;
    });
  }, [openAudit, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    if (!openAudit?.items) return { total: 0, matched: 0, surplus: 0, deficit: 0 };
    let matched = 0;
    let surplus = 0;
    let deficit = 0;

    for (const it of openAudit.items) {
      if (it.diffQty === 0) matched++;
      else if (it.diffQty > 0) surplus++;
      else deficit++;
    }

    return { total: openAudit.items.length, matched, surplus, deficit };
  }, [openAudit]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            Inventário & Balanço de Estoque
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Realize contagens físicas na loja, bipe códigos de barras e reconcilie divergências de estoque em 1 clique.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!openAudit ? (
            <Button
              onClick={() => createAuditMutation.mutate()}
              disabled={createAuditMutation.isPending}
              className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Abrir Novo Inventário</span>
            </Button>
          ) : (
            <Button
              onClick={() => setConfirmReconcileOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finalizar & Conciliar Estoque</span>
            </Button>
          )}
        </div>
      </div>

      {!openAudit ? (
        /* Empty State when no open audit */
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-3 text-zinc-600">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-zinc-900">Nenhum inventário aberto no momento</h2>
          <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1 mb-5">
            Ao abrir um inventário, o sistema copia os saldos atuais de todos os produtos para você contar os itens físicos
            e calcular sobras ou faltas sem travar suas vendas.
          </p>
          <Button
            onClick={() => createAuditMutation.mutate()}
            disabled={createAuditMutation.isPending}
            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-10 px-5 text-xs font-semibold"
          >
            Iniciar Inventário Agora
          </Button>

          {/* Past audits history */}
          {audits.filter((a: any) => a.status === 'COMPLETED').length > 0 && (
            <div className="mt-12 text-left border-t border-zinc-100 pt-6">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Histórico de Inventários Concluídos
              </h3>
              <div className="space-y-2">
                {audits
                  .filter((a: any) => a.status === 'COMPLETED')
                  .slice(0, 5)
                  .map((a: any) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-zinc-900 block">{a.notes || 'Inventário Geral'}</span>
                        <span className="text-[11px] text-zinc-400">
                          Fechado em {new Date(a.closedAt).toLocaleString('pt-BR')} — {a.items?.length || 0} produtos auditados
                        </span>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                        CONCILIADO
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Active Audit UI */
        <div className="space-y-4">
          {/* Quick Scan & Stats Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Barcode scanner card */}
            <div className="lg:col-span-2 bg-zinc-900 text-white rounded-3xl p-5 border border-zinc-800 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Barcode className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Bipagem Rápida de Inventário
                  </span>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  INVENTÁRIO ABERTO
                </Badge>
              </div>

              <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    ref={barcodeRef}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Bipe o código de barras ou digite e dê Enter (+1 unidade)..."
                    className="h-11 rounded-2xl bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 text-xs font-mono pl-3"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="h-11 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs"
                >
                  Contar (+1)
                </Button>
              </form>
              <span className="text-[10px] text-zinc-400 mt-2 block">
                Dica: Cada bipe com o leitor adiciona 1 unidade na contagem física do produto automaticamente.
              </span>
            </div>

            {/* Metrics cards */}
            <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                  Balanço das Contagens
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-emerald-50 p-2.5 rounded-2xl border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 font-bold block">Corretos</span>
                    <span className="text-lg font-bold font-mono text-emerald-800">{stats.matched}</span>
                  </div>
                  <div className="bg-blue-50 p-2.5 rounded-2xl border border-blue-100">
                    <span className="text-[10px] text-blue-700 font-bold block">Sobra (+)</span>
                    <span className="text-lg font-bold font-mono text-blue-800">{stats.surplus}</span>
                  </div>
                  <div className="bg-rose-50 p-2.5 rounded-2xl border border-rose-100">
                    <span className="text-[10px] text-rose-700 font-bold block">Falta (-)</span>
                    <span className="text-lg font-bold font-mono text-rose-800">{stats.deficit}</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 mt-2 flex justify-between font-mono">
                <span>Total Auditado:</span>
                <span className="font-bold text-zinc-900">{stats.total} itens</span>
              </div>
            </div>
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar por produto, código de barras..."
                  className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
                />
              </div>
              <span className="text-xs text-zinc-500 font-mono">{filteredItems.length} itens listados</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4">Cód. Barras</th>
                    <th className="py-3 px-4 text-center">Saldo Sistema</th>
                    <th className="py-3 px-4 text-center">Contagem Física</th>
                    <th className="py-3 px-4 text-center">Divergência</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs">
                  {filteredItems.map((it: any) => {
                    const p = it.product;
                    const diff = Number(it.diffQty);
                    const isOk = diff === 0;
                    const isPositive = diff > 0;

                    return (
                      <tr key={it.id} className="hover:bg-zinc-50/50 transition">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-zinc-900 block">{p.name}</span>
                          {p.brand && <span className="text-[10px] text-zinc-400 block">{p.brand}</span>}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-500 whitespace-nowrap">
                          {p.barcode || p.sku || '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-zinc-700 whitespace-nowrap">
                          {it.systemQty} {p.unit || 'UN'}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <input
                            type="number"
                            step="any"
                            defaultValue={it.countedQty}
                            onBlur={(e) => handleManualCountChange(it, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleManualCountChange(it, (e.target as HTMLInputElement).value);
                              }
                            }}
                            className="w-20 text-center font-mono font-bold text-xs h-8 rounded-lg border border-zinc-300 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition bg-white"
                          />
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold whitespace-nowrap">
                          <span className={isOk ? 'text-zinc-400' : isPositive ? 'text-blue-600' : 'text-rose-600'}>
                            {diff > 0 ? `+${diff}` : diff} {p.unit || 'UN'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isOk ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                              Correto
                            </Badge>
                          ) : isPositive ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold">
                              Sobra Físico
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold">
                              Falta Físico
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Reconcile */}
      <Dialog open={confirmReconcileOpen} onOpenChange={setConfirmReconcileOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Finalizar e Conciliar Inventário?
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Esta ação atualizará o saldo real de estoque de todos os produtos para a quantidade física contada e criará
              os registros correspondentes de acerto no Kardex.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 text-xs space-y-2 my-2">
            <div className="flex justify-between">
              <span className="text-zinc-500">Total de itens:</span>
              <span className="font-mono font-bold text-zinc-900">{stats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Itens com divergência a corrigir:</span>
              <span className="font-mono font-bold text-amber-600">{stats.surplus + stats.deficit}</span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmReconcileOpen(false)}
              className="rounded-xl h-9 text-xs"
            >
              Continuar Contando
            </Button>
            <Button
              type="button"
              disabled={reconcileMutation.isPending}
              onClick={() => openAudit && reconcileMutation.mutate(openAudit.id)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-semibold"
            >
              {reconcileMutation.isPending ? 'Conciliando...' : 'Confirmar & Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
