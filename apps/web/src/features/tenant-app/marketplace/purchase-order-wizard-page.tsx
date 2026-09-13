import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Truck,
  Package,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  ShoppingCart,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CossPanel,
  CossBadge,
  CossInput,
  CossLabel,
  CossEmpty,
  CossInputGroup,
} from '@/components/coss-ui';
import { PageLoader } from '@/components/ui/page-loader';
import { useTenant } from '../context/tenant-context';
import { apiGet, apiPost } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface Product {
  id: string;
  name: string;
  salePriceCents: number;
  stockQuantity: number;
  unit: string;
  barcode: string | null;
  suppliers?: Array<{ id: string; supplierId: string; costCents: number; isPreferred: boolean; supplier: { tradeName: string; legalName: string } }>;
}

interface Supplier {
  id: string;
  tradeName: string | null;
  legalName: string;
  leadTimeDays: number;
}

interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCostCents: number;
}

export const PurchaseOrderWizardPage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [supplierId, setSupplierId] = useState<string>(params.get('supplierId') || '');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/suppliers`, { active: 'true' }),
  });

  const { data: suggestions = [] } = useQuery<
    Array<{ productId: string; productName: string; currentStock: number; minStock: number; suggestedQty: number; preferredSupplier?: { id: string; name: string; costCents: number } }>
  >({
    queryKey: ['purchase-suggestions', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-orders/suggestions`),
  });

  const { data: rawProductsData } = useQuery<any>({
    queryKey: ['products-list', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
  });

  const products: Product[] = useMemo(() => {
    if (Array.isArray(rawProductsData)) return rawProductsData;
    if (rawProductsData && Array.isArray(rawProductsData.products)) return rawProductsData.products;
    return [];
  }, [rawProductsData]);

  const supplier = suppliers.find((s) => s.id === supplierId);

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 30);
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q),
    ).slice(0, 50);
  }, [products, search]);

  const addItem = (p: Product, qty: number, cost: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id ? { ...i, quantity: i.quantity + qty } : i,
        );
      }
      return [
        ...prev,
        { productId: p.id, productName: p.name, quantity: qty, unitCostCents: cost },
      ];
    });
  };

  const updateItem = (productId: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const totalCents = items.reduce((acc, it) => acc + it.unitCostCents * it.quantity, 0);

  const submit = async () => {
    if (!supplierId) {
      toast.error('Selecione um fornecedor');
      return;
    }
    if (items.length === 0) {
      toast.error('Adicione pelo menos 1 item');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        supplierId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCostCents: i.unitCostCents,
        })),
      };
      const result = await apiPost(`/tenant-app/${slug}/purchase-orders`, payload);
      toast.success('Pedido criado!');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
      navigate(`${base}/marketplace/purchase-orders/${result.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Falha ao criar pedido');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Novo Pedido de Compra</h1>
          <p className="text-xs text-zinc-500">3 etapas: fornecedor → itens → revisão</p>
        </div>
      </div>

      <CossPanel>
        <div className="grid grid-cols-3 gap-2">
          {[
            { step: 1, label: 'Fornecedor', desc: 'Quem vai receber' },
            { step: 2, label: 'Itens', desc: `${items.length} selecionado(s)` },
            { step: 3, label: 'Revisão', desc: 'Total: ' + formatCurrency(totalCents) },
          ].map((s) => {
            const isDone = step > (s.step as any);
            const isCurrent = step === (s.step as any);
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => isDone && setStep(s.step as any)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl text-left transition ${
                  isDone ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : isDone
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-zinc-100 text-zinc-400'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.step}
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] font-bold leading-tight truncate ${isCurrent ? 'text-zinc-900' : 'text-zinc-500'}`}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-zinc-400 truncate">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </CossPanel>

      {step === 1 && (
        <CossPanel className="space-y-3">
          <CossLabel>Selecione o fornecedor</CossLabel>
          {suppliers.length === 0 ? (
            <CossEmpty
              icon={<Truck className="w-5 h-5" />}
              title="Nenhum fornecedor ativo"
              description="Cadastre fornecedores antes de criar pedidos de compra."
              action={
                <Button
                  size="sm"
                  onClick={() => navigate(`${base}/marketplace/suppliers`)}
                  className="h-9 px-3.5 text-xs font-bold bg-zinc-900 text-white rounded-xl"
                >
                  Ir para Fornecedores
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suppliers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSupplierId(s.id);
                    setStep(2);
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    supplierId === s.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${supplierId === s.id ? 'bg-white/10' : 'bg-zinc-100'}`}>
                    <Truck className={`w-4 h-4 ${supplierId === s.id ? 'text-white' : 'text-zinc-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{s.tradeName || s.legalName}</p>
                    <p className={`text-[10px] ${supplierId === s.id ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      Lead time: {s.leadTimeDays}d
                    </p>
                  </div>
                  <ArrowRight className={`w-4 h-4 ${supplierId === s.id ? 'text-white' : 'text-zinc-400'}`} />
                </button>
              ))}
            </div>
          )}
        </CossPanel>
      )}

      {step === 2 && supplier && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 space-y-3">
            {suggestions.filter((s) => s.preferredSupplier?.id === supplierId).length > 0 && (
              <CossPanel className="bg-amber-50/50 border-amber-200/80 space-y-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-amber-900">Sugestões para este fornecedor</span>
                </div>
                <div className="space-y-1">
                  {suggestions
                    .filter((s) => s.preferredSupplier?.id === supplierId)
                    .slice(0, 5)
                    .map((s) => (
                      <button
                        key={s.productId}
                        type="button"
                        onClick={() => {
                          const product = products.find((p) => p.id === s.productId);
                          if (product && s.preferredSupplier) {
                            addItem(product, s.suggestedQty, s.preferredSupplier.costCents || product.salePriceCents * 0.6);
                            toast.success(`${s.productName} adicionado ao pedido`);
                          }
                        }}
                        className="w-full text-left p-2 rounded-lg bg-white border border-amber-200/80 hover:border-amber-400 transition flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-bold text-zinc-900">{s.productName}</p>
                          <p className="text-[10px] text-zinc-500">
                            Estoque: {s.currentStock} / Mín: {s.minStock}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-amber-800">+{s.suggestedQty} un.</p>
                          <p className="text-[10px] text-zinc-500">{formatCurrency(s.preferredSupplier?.costCents || 0)}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </CossPanel>
            )}
            <CossPanel className="space-y-3">
              <CossInputGroup prefixAddon={<Search className="w-3.5 h-3.5 text-zinc-500" />}>
                <input
                  type="text"
                  placeholder="Buscar produto por nome ou código de barras..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 h-full px-2 bg-transparent text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </CossInputGroup>
              <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
                {filteredProducts.map((p) => {
                  const supplierLink = p.suppliers?.find((ps) => ps.supplierId === supplierId);
                  const cost = supplierLink?.costCents || Math.round(p.salePriceCents * 0.6);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200/80 hover:border-zinc-400 transition"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{p.name}</p>
                        <p className="text-[10px] text-zinc-500">
                          Custo: <strong className="font-mono text-zinc-800">{formatCurrency(cost)}</strong>
                          {' · '}
                          Estoque: <strong className="font-mono text-zinc-800">{p.stockQuantity}</strong> {p.unit}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(p, 1, cost)}
                        className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    </div>
                  );
                })}
              </div>
            </CossPanel>
          </div>
          <div className="lg:col-span-2 space-y-3">
            <CossPanel className="space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">Itens do pedido</span>
                <CossBadge variant="neutral">{items.length}</CossBadge>
              </div>
              {items.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400">
                  Nenhum item adicionado ainda
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {items.map((it) => (
                    <div key={it.productId} className="p-2.5 rounded-xl border border-zinc-200/80 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-zinc-900 flex-1 truncate">{it.productName}</p>
                        <button
                          type="button"
                          onClick={() => removeItem(it.productId)}
                          className="text-rose-500 hover:bg-rose-50 p-1 rounded-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-zinc-400 uppercase font-bold block">Qtd</label>
                          <CossInput
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              updateItem(it.productId, { quantity: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 uppercase font-bold block">Custo un.</label>
                          <CossInput
                            type="number"
                            min={0}
                            value={(it.unitCostCents / 100).toFixed(2)}
                            onChange={(e) =>
                              updateItem(it.productId, { unitCostCents: Math.round(Number(e.target.value) * 100) || 0 })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-700 text-right font-mono font-bold">
                        Subtotal: {formatCurrency(it.quantity * it.unitCostCents)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Total</span>
                <span className="text-base font-extrabold text-zinc-900 font-mono">{formatCurrency(totalCents)}</span>
              </div>
            </CossPanel>
          </div>
        </div>
      )}

      {step === 3 && supplier && (
        <div className="space-y-3">
          <CossPanel className="space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
                <Truck className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-zinc-900">{supplier.tradeName || supplier.legalName}</p>
                <p className="text-[11px] text-zinc-500">Lead time: {supplier.leadTimeDays} dias</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <CossLabel>Previsão de entrega</CossLabel>
                <CossInput type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
              <div>
                <CossLabel>Observações</CossLabel>
                <CossInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pedido urgente, entregar pela manhã..." />
              </div>
            </div>
            <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
              {items.map((it) => (
                <div key={it.productId} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/80">
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{it.productName}</p>
                    <p className="text-[10px] text-zinc-500">
                      {it.quantity} × {formatCurrency(it.unitCostCents)}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-xs text-zinc-900">
                    {formatCurrency(it.quantity * it.unitCostCents)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Total do pedido</span>
              <span className="text-2xl font-extrabold text-zinc-900 font-mono">{formatCurrency(totalCents)}</span>
            </div>
          </CossPanel>
        </div>
      )}

      <div className="flex items-center justify-between sticky bottom-0 bg-white/80 backdrop-blur p-3 -mx-3 rounded-2xl border border-zinc-200/80">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStep((s) => Math.max(1, s - 1) as any)}
          disabled={step === 1}
          className="h-10 px-5 text-xs font-bold rounded-xl border-zinc-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
        </Button>
        {step < 3 ? (
          <Button
            size="sm"
            onClick={() => setStep((s) => Math.min(3, s + 1) as any)}
            disabled={(step === 1 && !supplierId) || (step === 2 && items.length === 0)}
            className="h-10 px-6 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs"
          >
            Continuar <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={submit}
            disabled={isSubmitting}
            className="h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isSubmitting ? 'Salvando...' : 'Criar pedido'}
          </Button>
        )}
      </div>
    </div>
  );
};
