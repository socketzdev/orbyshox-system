import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  QrCode,
  DollarSign,
  CreditCard,
  Zap,
  RotateCcw,
  Sparkles,
  Barcode,
  Printer,
  X,
  Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import type { PaymentMethod } from './domain/payment-methods';
import { computeChange, computeTotals, discountToCents } from './domain/pricing';
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
import { ProductCardSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

type CartItem = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  stockQuantity: number;
};

export const PosTerminalPage: React.FC = () => {
  const { slug, tenant } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountCents, setDiscountCents] = useState(0);
  const [discountInput, setDiscountInput] = useState('');
  const [showDiscountField, setShowDiscountField] = useState(false);

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [cashGiven, setCashGiven] = useState<string>('');

  // Success Modal State
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<any | null>(null);

  // Load products & categories
  const { data, isLoading } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
  });

  const categories = data?.categories || [];
  const products = data?.products || [];

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchTerm));
      const matchesCategory = selectedCategory ? p.categoryId === selectedCategory : true;
      return matchesSearch && matchesCategory && p.isActive;
    });
  }, [products, searchTerm, selectedCategory]);

  // Cart operations
  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          unitPriceCents: product.salePriceCents,
          stockQuantity: Number(product.stockQuantity),
        },
      ];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountCents(0);
    setDiscountInput('');
    setShowDiscountField(false);
    setCashGiven('');
  };

  // Cálculos — delegados à camada de domínio para que "total = subtotal −
  // desconto, nunca negativo" seja a mesma regra dos outros PDVs.
  const { subtotalCents, discountCents: appliedDiscountCents, totalCents } = useMemo(
    () => computeTotals(cart, { type: 'ABSOLUTE', valueCents: discountCents }),
    [cart, discountCents],
  );

  // Cash change calculation (usa a decomposição em cédulas do smart-change)
  const cashGivenCents = Math.round(parseFloat(cashGiven.replace(',', '.') || '0') * 100);
  const { changeCents, isShort, shortCents } = useMemo(
    () => computeChange(totalCents, cashGivenCents),
    [totalCents, cashGivenCents],
  );

  // Apply discount (valor absoluto em centavos, limitado ao subtotal)
  const handleApplyDiscount = (valStr: string) => {
    setDiscountInput(valStr);
    const parsed = Math.round(parseFloat(valStr.replace(',', '.') || '0') * 100);
    setDiscountCents(discountToCents(subtotalCents, { type: 'ABSOLUTE', valueCents: parsed }));
  };

  // Order Mutation
  const orderMutation = useMutation({
    mutationFn: (orderPayload: any) => apiPost(`/tenant-app/${slug}/orders`, orderPayload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-automations', slug] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', slug] });

      setLastOrder({
        ...res,
        paymentMethod,
        totalCents,
        changeCents,
        cashGivenCents,
        itemCount: cart.reduce((sum, i) => sum + i.quantity, 0),
      });

      setPaymentModalOpen(false);
      setSuccessModalOpen(true);
      clearCart();
      toast.success(`Venda #${res.orderNumber} concluída!`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Falha ao registrar venda');
    },
  });

  const handleFinishOrder = () => {
    if (cart.length === 0) {
      toast.error('Adicione pelo menos um item à venda');
      return;
    }
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = () => {
    orderMutation.mutate({
      paymentMethod,
      discountCents,
      items: cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPriceCents,
      })),
    });
  };

  // Keyboard shortcut listener (F2 = Cobrar, Escape = Fechar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0 && !paymentModalOpen && !successModalOpen) {
          setPaymentModalOpen(true);
        }
      }
      if (e.key === 'Escape') {
        if (paymentModalOpen) setPaymentModalOpen(false);
        if (successModalOpen) setSuccessModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, paymentModalOpen, successModalOpen]);

  // Quick cash buttons helper
  const setQuickCash = (cents: number) => {
    setCashGiven((cents / 100).toFixed(2).replace('.', ','));
  };

  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col md:flex-row gap-5 font-sans">
      {/* ─── Coluna Esquerda: Catálogo e Busca Rápida ────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-5 overflow-hidden">
        {/* Search Bar & Scanner Input */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar por nome ou bipar código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 text-xs rounded-xl border-zinc-200 focus-visible:border-zinc-900 bg-zinc-50/50"
            />
          </div>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm('')}
              className="h-10 text-xs text-zinc-500 rounded-xl"
            >
              Limpar
            </Button>
          )}
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
              selectedCategory === null
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
            }`}
          >
            Todos os Itens
          </button>
          {categories.map((cat: any) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                selectedCategory === cat.id
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <ErpEmptyState
              icon={Barcode}
              title="Nenhum produto encontrado"
              description="Nenhum item corresponde ao termo de busca ou categoria selecionada."
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product: any) => {
                const isLowStock = Number(product.stockQuantity) <= Number(product.minStockAlert);
                const cartItem = cart.find((i) => i.productId === product.id);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className={`relative p-3.5 rounded-xl border transition-all text-left group flex flex-col justify-between ${
                      cartItem
                        ? 'border-zinc-900 bg-zinc-50/70 shadow-sm'
                        : 'border-zinc-200/80 hover:border-zinc-400 bg-white hover:bg-zinc-50/50 shadow-soft hover:shadow'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                          {product.unit}
                        </span>
                        <div className="flex items-center gap-1">
                          {cartItem && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-zinc-900 text-white">
                              {cartItem.quantity}x
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                              isLowStock
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            {Number(product.stockQuantity)} {product.unit}
                          </span>
                        </div>
                      </div>
                      <h4 className="text-xs font-bold text-zinc-900 line-clamp-2 leading-snug group-hover:text-zinc-950">
                        {product.name}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900">
                        R$ {(product.salePriceCents / 100).toFixed(2)}
                      </span>
                      <div className="w-6 h-6 rounded-lg bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white flex items-center justify-center transition-colors text-zinc-600">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Coluna Direita: Carrinho / Cupom de Venda ───────────────── */}
      <div className="w-full md:w-96 bg-white rounded-2xl border border-zinc-200/80 shadow-soft flex flex-col shrink-0 overflow-hidden">
        {/* Cart Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <ShoppingCart className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-900">Cupom de Venda</h3>
              {cart.length > 0 && (
                <span className="text-[10px] text-zinc-400">
                  {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'} no pedido
                </span>
              )}
            </div>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 p-1 rounded-lg hover:bg-rose-50 transition"
            >
              <RotateCcw className="w-3 h-3" />
              Limpar
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 text-xs py-16 gap-2">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 mb-1">
                <ShoppingCart className="w-6 h-6 stroke-[1.5]" />
              </div>
              <span className="font-semibold text-zinc-700">Venda vazia</span>
              <span className="text-[11px] text-zinc-400 max-w-[200px]">
                Toque nos produtos ao lado para iniciar o atendimento.
              </span>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.productId}
                className="p-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 flex items-center justify-between text-xs hover:border-zinc-200 transition"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-zinc-900 truncate">{item.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    R$ {(item.unitPriceCents / 100).toFixed(2)} / {item.unit}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex items-center border border-zinc-200 rounded-lg bg-white overflow-hidden shadow-xs">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, -1)}
                      className="px-2 py-1 text-zinc-600 hover:bg-zinc-100 transition"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-2 text-xs font-bold text-zinc-800">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, 1)}
                      className="px-2 py-1 text-zinc-600 hover:bg-zinc-100 transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="font-bold text-zinc-900 w-16 text-right font-mono">
                    R$ {((item.quantity * item.unitPriceCents) / 100).toFixed(2)}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId)}
                    className="text-zinc-400 hover:text-rose-600 p-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Checkout Button */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50/70 space-y-3">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span className="font-mono">R$ {(subtotalCents / 100).toFixed(2)}</span>
            </div>

            {/* Discount Section */}
            {showDiscountField ? (
              <div className="flex items-center gap-2 py-1">
                <Input
                  type="text"
                  placeholder="Desconto (R$)"
                  value={discountInput}
                  onChange={(e) => handleApplyDiscount(e.target.value)}
                  className="h-8 text-xs bg-white"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowDiscountField(false);
                    setDiscountCents(0);
                    setDiscountInput('');
                  }}
                  className="h-8 px-2 text-zinc-400 hover:text-rose-600"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-between items-center text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowDiscountField(true)}
                  className="text-zinc-500 hover:text-zinc-800 underline flex items-center gap-1"
                >
                  <Percent className="w-3 h-3" /> Aplicar desconto
                </button>
                {discountCents > 0 && (
                  <span className="text-emerald-600 font-bold font-mono">
                    - R$ {(discountCents / 100).toFixed(2)}
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-between text-base font-bold text-zinc-900 pt-2 border-t border-zinc-200/80">
              <span>Total a Receber</span>
              <span className="font-mono text-lg">R$ {(totalCents / 100).toFixed(2)}</span>
            </div>
          </div>

          <Button
            type="button"
            disabled={cart.length === 0}
            onClick={handleFinishOrder}
            className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2 active:scale-98 transition"
          >
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>Cobrar Venda (F2)</span>
          </Button>
        </div>
      </div>

      {/* ─── Modal de Pagamento Rápido ───────────────────────────────── */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-zinc-200 p-6 rounded-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Forma de Pagamento
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Total a receber:{' '}
              <span className="font-bold text-zinc-900 text-sm font-mono">
                R$ {(totalCents / 100).toFixed(2)}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-2 gap-2 my-4">
            {([
              { id: 'PIX', label: 'Pix Instantâneo', icon: QrCode },
              { id: 'DINHEIRO', label: 'Dinheiro', icon: DollarSign },
              { id: 'CARTAO_CREDITO', label: 'Cartão de Crédito', icon: CreditCard },
              { id: 'CARTAO_DEBITO', label: 'Cartão de Débito', icon: CreditCard },
            ] as const).map((method) => {
              const Icon = method.icon;
              const selected = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setPaymentMethod(method.id as any)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                      : 'border-zinc-200 hover:border-zinc-300 text-zinc-700 bg-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{method.label}</span>
                </button>
              );
            })}
          </div>

          {/* Dinheiro: Troco e atalhos rápidos */}
          {paymentMethod === 'DINHEIRO' && (
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                  Valor recebido do cliente (R$)
                </label>
                <Input
                  type="text"
                  placeholder="0,00"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  className="h-10 text-base font-bold bg-white font-mono"
                  autoFocus
                />
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickCash(totalCents)}
                  className="h-7 text-[10px] rounded-lg bg-white"
                >
                  Valor Exato
                </Button>
                {[1000, 2000, 5000, 10000].map((val) => (
                  <Button
                    key={val}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickCash(val)}
                    className="h-7 text-[10px] rounded-lg bg-white"
                  >
                    R$ {(val / 100).toFixed(0)}
                  </Button>
                ))}
              </div>

              {cashGivenCents > 0 && (
                <div
                  className={`p-3 rounded-xl border flex justify-between font-bold text-xs ${
                    !isShort
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <span>
                    {isShort ? 'Valor Insuficiente:' : 'Troco a Devolver:'}
                  </span>
                  <span className="font-mono text-sm">
                    {/* Antes exibia Math.abs(changeCents), que era 0 quando o
                        valor era insuficiente — o operador via "R$ 0,00" em
                        vez de quanto faltava. */}
                    R$ {((isShort ? shortCents : changeCents) / 100).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Pix QR Code Mockup */}
          {paymentMethod === 'PIX' && (
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/60 text-center space-y-2">
              <div className="w-24 h-24 bg-white border border-emerald-200 rounded-xl mx-auto flex items-center justify-center shadow-xs">
                <QrCode className="w-16 h-16 text-emerald-700" />
              </div>
              <p className="text-xs font-semibold text-emerald-800">
                Aguardando Pix de R$ {(totalCents / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-emerald-600">
                Conciliação bancária automática ativa no sistema.
              </p>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaymentModalOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar (Esc)
            </Button>
            <Button
              size="sm"
              disabled={orderMutation.isPending}
              onClick={handleConfirmPayment}
              className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-5 rounded-xl shadow-sm"
            >
              {orderMutation.isPending ? 'Concluindo...' : 'Confirmar e Concluir Venda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal de Sucesso Pós-Venda ─────────────────────────────── */}
      <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-zinc-200 p-6 rounded-2xl text-center font-sans">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-200/60 shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <DialogTitle className="text-xl font-bold text-zinc-900">
            Venda Concluída!
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 mt-1">
            Pedido <span className="font-mono font-bold text-zinc-900">#{lastOrder?.orderNumber}</span> registrado no caixa com sucesso.
          </DialogDescription>

          <div className="my-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 text-left text-xs space-y-2">
            <div className="flex justify-between text-zinc-600">
              <span>Forma de Pagamento:</span>
              <span className="font-bold text-zinc-900 uppercase">{lastOrder?.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Total Pago:</span>
              <span className="font-bold text-zinc-900 font-mono">
                R$ {((lastOrder?.totalCents || 0) / 100).toFixed(2)}
              </span>
            </div>
            {lastOrder?.paymentMethod === 'DINHEIRO' && lastOrder?.changeCents > 0 && (
              <div className="flex justify-between text-emerald-800 font-bold pt-2 border-t border-zinc-200">
                <span>Troco Devolvido:</span>
                <span className="font-mono">
                  R$ {(lastOrder.changeCents / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Button
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs h-10 rounded-xl flex items-center justify-center gap-2 shadow-sm"
              onClick={() => setSuccessModalOpen(false)}
            >
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>Nova Venda (F2 / Esc)</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
