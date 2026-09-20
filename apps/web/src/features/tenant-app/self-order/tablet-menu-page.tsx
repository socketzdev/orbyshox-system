import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UtensilsCrossed,
  ShoppingBag,
  BellRing,
  Receipt,
  Plus,
  Minus,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Flame,
  ChefHat,
  X,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface CartItem {
  id: string; // unique cart line id
  product: any;
  quantity: number;
  notes: string;
  selectedModifiers: {
    modifierItemId: string;
    name: string;
    priceCents: number;
  }[];
  totalPriceCents: number;
}

export const TabletMenuPage: React.FC<{ mode: 'qr' | 'tablet' }> = ({ mode }) => {
  const { tableToken, deviceToken } = useParams<{ tableToken?: string; deviceToken?: string }>();
  const token = mode === 'qr' ? tableToken : deviceToken;

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [orderSuccessModal, setOrderSuccessModal] = useState<any | null>(null);
  const [tableBillModalOpen, setTableBillModalOpen] = useState(false);

  // Selected item modal for customization
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState('');

  // Selected Category tab
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Fetch menu and table data
  const endpoint = mode === 'qr' ? `/restaurant/public/qr/${token}` : `/restaurant/device/${token}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['self-order-menu', mode, token],
    queryFn: () => apiGet(endpoint),
    enabled: !!token,
    retry: 1,
    // Cardápio do cliente acompanha preço/disponibilidade sem F5.
    refetchInterval: 30000,
  });

  // Mutações
  const createOrderMutation = useMutation({
    mutationFn: (orderPayload: any) =>
      apiPost(
        mode === 'qr'
          ? `/restaurant/public/qr/${token}/order`
          : `/restaurant/device/${token}/order`,
        orderPayload,
      ),
    onSuccess: (res: any) => {
      setCart([]);
      setCartModalOpen(false);
      setOrderSuccessModal(res);
      refetch();
      toast.success('Pedido enviado com sucesso para a cozinha!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao enviar pedido'),
  });

  const callWaiterMutation = useMutation({
    mutationFn: (type: 'ASSISTANCE' | 'BILL') =>
      apiPost(
        mode === 'qr'
          ? `/restaurant/public/qr/${token}/call-waiter`
          : `/restaurant/device/${token}/call-waiter`,
        { type },
      ),
    onSuccess: (_, type) => {
      toast.success(
        type === 'BILL'
          ? '🧾 Pedido de conta enviado ao garçom!'
          : '🔔 Garçom chamado! Um atendente virá à sua mesa.',
      );
    },
    onError: () => toast.error('Erro ao chamar o garçom. Tente novamente.'),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 font-sans">
        <ChefHat className="w-12 h-12 text-amber-500 animate-bounce mb-3" />
        <h2 className="text-base font-bold text-zinc-200">Carregando cardápio...</h2>
        <p className="text-xs text-zinc-500 mt-1">Conectando à sua mesa em tempo real</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <X className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-zinc-100">Mesa ou QR Code não encontrado</h2>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
          Este link pode ter expirado ou o dispositivo não está mais autorizado. Solicite um novo QR code ao garçom.
        </p>
      </div>
    );
  }

  const { table, company, menu = [], activeSession } = data;
  const primaryColor = company?.branding?.primaryColor || '#E63946';
  const categories = menu;
  const activeCategory =
    categories.find((c: any) => c.id === selectedCategoryId) || categories[0] || null;

  // Total cart calculation
  const totalCartCents = cart.reduce((sum, item) => sum + item.totalPriceCents, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Table active session calculation (extrato da mesa em tempo real)
  const sessionOrders = activeSession?.orders || [];
  const sessionTotalCents = sessionOrders.reduce(
    (sum: number, o: any) => sum + (o.totalCents || 0),
    0
  );
  const sessionItemsCount = sessionOrders.reduce(
    (sum: number, o: any) => sum + (o.items?.length || 0),
    0
  );

  const getCategoryEmoji = (catName: string) => {
    const n = String(catName || '').toLowerCase();
    if (n.includes('carne') || n.includes('corte') || n.includes('angus') || n.includes('grelhado') || n.includes('chorizo') || n.includes('prime')) return '🥩';
    if (n.includes('entrada') || n.includes('petisco') || n.includes('peixe') || n.includes('salmão') || n.includes('sushi') || n.includes('japon')) return '🍣';
    if (n.includes('bebida') || n.includes('suco') || n.includes('cerveja') || n.includes('drink') || n.includes('água')) return '🍹';
    if (n.includes('sobremesa') || n.includes('doce') || n.includes('sorvete')) return '🍨';
    if (n.includes('burger') || n.includes('lanche')) return '🍔';
    if (n.includes('pizza')) return '🍕';
    if (n.includes('massa') || n.includes('pasta')) return '🍝';
    return '🍽️';
  };

  // Open customization modal
  const handleOpenCustomize = (product: any) => {
    setCustomizingProduct(product);
    setItemQuantity(1);
    setItemNotes('');

    // Pre-select defaults for required groups
    const defaults: Record<string, string[]> = {};
    (product.modifierGroups || []).forEach((group: any) => {
      if (group.isRequired && group.items?.length > 0) {
        defaults[group.id] = [group.items[0].id];
      } else {
        defaults[group.id] = [];
      }
    });
    setSelectedModifiers(defaults);
  };

  // Toggle modifier option
  const handleToggleModifier = (groupId: string, itemId: string, maxSelectable: number) => {
    setSelectedModifiers((prev) => {
      const current = prev[groupId] || [];
      if (maxSelectable === 1) {
        return { ...prev, [groupId]: [itemId] };
      }
      if (current.includes(itemId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== itemId) };
      }
      if (current.length < maxSelectable) {
        return { ...prev, [groupId]: [...current, itemId] };
      }
      return prev;
    });
  };

  // Add customized item to cart
  const handleAddToCart = () => {
    if (!customizingProduct) return;

    // Validate required groups
    for (const group of customizingProduct.modifierGroups || []) {
      const selected = selectedModifiers[group.id] || [];
      if (group.isRequired && selected.length < group.minSelectable) {
        return toast.error(`Selecione uma opção para "${group.name}".`);
      }
    }

    let unitCost = customizingProduct.salePriceCents || 0;
    const flatSelectedMods: any[] = [];

    (customizingProduct.modifierGroups || []).forEach((group: any) => {
      const selectedIds = selectedModifiers[group.id] || [];
      (group.items || []).forEach((item: any) => {
        if (selectedIds.includes(item.id)) {
          unitCost += item.priceCents;
          flatSelectedMods.push({
            modifierItemId: item.id,
            name: item.name,
            priceCents: item.priceCents,
          });
        }
      });
    });

    const newCartItem: CartItem = {
      id: `${customizingProduct.id}-${Date.now()}`,
      product: customizingProduct,
      quantity: itemQuantity,
      notes: itemNotes.trim(),
      selectedModifiers: flatSelectedMods,
      totalPriceCents: unitCost * itemQuantity,
    };

    setCart((prev) => [...prev, newCartItem]);
    setCustomizingProduct(null);
    toast.success(`${customizingProduct.name} adicionado ao pedido!`);
  };

  const handleSendOrder = () => {
    if (cart.length === 0) return;

    const payload = {
      notes: 'Pedido realizado via autoatendimento da mesa',
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        notes: item.notes || undefined,
        modifiers: item.selectedModifiers.map((m) => ({
          modifierItemId: m.modifierItemId,
        })),
      })),
    };

    createOrderMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-28 select-none">
      {/* ─── Top Bar: Branding do Restaurante & Mesa ─── */}
      <header className="sticky top-0 z-30 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white text-sm shadow-md"
              style={{ backgroundColor: primaryColor }}
            >
              {company.name?.slice(0, 2).toUpperCase() || 'RT'}
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-white leading-tight">{company.name}</h1>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="font-bold text-amber-400">{table.label}</span>
                <span>•</span>
                <span>Autoatendimento Digital</span>
              </div>
            </div>
          </div>

          {/* Ações de Mesa */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTableBillModalOpen(true)}
              className="h-8 px-2.5 sm:px-3 text-xs font-bold text-zinc-200 border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer touch-manipulation"
            >
              <Receipt className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Comanda</span>
              {sessionOrders.length > 0 && (
                <Badge className="h-4 px-1 text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {(sessionTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </Badge>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={callWaiterMutation.isPending}
              onClick={() => callWaiterMutation.mutate('ASSISTANCE')}
              className="h-8 px-2.5 sm:px-3 text-xs font-bold text-zinc-200 border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer touch-manipulation"
            >
              <BellRing className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Chamar</span> Garçom
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={callWaiterMutation.isPending}
              onClick={() => callWaiterMutation.mutate('BILL')}
              className="h-8 px-2.5 sm:px-3 text-xs font-bold text-zinc-200 border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer touch-manipulation"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              Pedir Conta
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Abas Horizontais (Mobile/Portrait) ─── */}
      <nav className="md:hidden sticky top-[57px] z-20 bg-zinc-900/95 border-b border-zinc-800 px-4 py-2.5 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          {categories.map((cat: any) => {
            const isSelected = (activeCategory && activeCategory.id === cat.id) || false;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 touch-manipulation ${
                  isSelected
                    ? 'text-white shadow-sm'
                    : 'text-zinc-400 bg-zinc-800/60 hover:text-white hover:bg-zinc-800'
                }`}
                style={isSelected ? { backgroundColor: primaryColor } : {}}
              >
                <span>{getCategoryEmoji(cat.name)}</span>
                {cat.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ─── Layout Tablet Landscape / Desktop ─── */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 flex gap-6">
        {/* Sidebar Lateral Fixa de Categorias (Estilo Tablet de Mesa / Goomer) */}
        <aside className="hidden md:flex flex-col w-64 shrink-0 space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-zinc-400 px-3 py-1">
            Categorias
          </div>
          {categories.map((cat: any) => {
            const isSelected = (activeCategory && activeCategory.id === cat.id) || false;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full px-4 py-3 rounded-2xl text-xs font-bold text-left transition flex items-center justify-between cursor-pointer touch-manipulation ${
                  isSelected
                    ? 'text-white shadow-md'
                    : 'text-zinc-400 bg-zinc-900/80 border border-zinc-800/80 hover:bg-zinc-800/80 hover:text-zinc-200'
                }`}
                style={isSelected ? { backgroundColor: primaryColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{getCategoryEmoji(cat.name)}</span>
                  <span>{cat.name}</span>
                </div>
                <span className="text-[10px] opacity-80 bg-black/20 px-2 py-0.5 rounded-full font-bold">
                  {cat.products?.length || 0}
                </span>
              </button>
            );
          })}

          {/* Quick Card: Mesa e Consumo */}
          <div className="mt-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs space-y-2">
            <div className="flex items-center justify-between text-zinc-400 font-medium">
              <span>Mesa Ativa</span>
              <strong className="text-white font-black">{table.label}</strong>
            </div>
            <div className="flex items-center justify-between text-zinc-400 font-medium">
              <span>Itens Pedidos</span>
              <strong className="text-amber-400 font-bold">{sessionItemsCount}</strong>
            </div>
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400 font-bold">Consumo da Mesa:</span>
              <span className="text-sm font-black text-emerald-400">
                {(sessionTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTableBillModalOpen(true)}
              className="w-full mt-1 h-8 text-[11px] font-bold border-zinc-700 bg-zinc-800/80 text-zinc-200 rounded-xl cursor-pointer"
            >
              Ver Comanda Completa
            </Button>
          </div>
        </aside>

        {/* ─── Grid de Produtos ─── */}
        <main className="flex-1 min-w-0">
          {activeCategory ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getCategoryEmoji(activeCategory.name)}</span>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">{activeCategory.name}</h2>
                  <p className="text-xs text-zinc-500">
                    Toque no prato para selecionar ponto, acompanhamentos e enviar à cozinha.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {(activeCategory.products || []).map((product: any) => {
                  const hasModifiers = (product.modifierGroups || []).length > 0;
                  const formattedPrice = ((product.salePriceCents || 0) / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  });

                  return (
                    <div
                      key={product.id}
                      onClick={() => handleOpenCustomize(product)}
                      className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer flex flex-col justify-between group active:scale-98 shadow-sm touch-manipulation"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-black text-white group-hover:text-amber-400 transition">
                            {product.name}
                          </h3>
                          <span className="text-xs font-black text-emerald-400 shrink-0">
                            {formattedPrice}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                          {product.description || 'Delicioso item preparado com ingredientes nobres e selecionados.'}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                        {hasModifiers ? (
                          <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Personalizável
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500 font-medium">Item pronto</span>
                        )}

                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs font-bold text-white rounded-xl shadow-xs pointer-events-none"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Pedir
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-zinc-500 text-xs">Nenhum produto cadastrado nesta categoria.</div>
          )}
        </main>
      </div>

      {/* ─── Barra Fixa de Carrinho no Rodapé (Estilo App de Pedido) ─── */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-xl mx-auto">
          <div
            onClick={() => setCartModalOpen(true)}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border border-zinc-700 shadow-2xl flex items-center justify-between cursor-pointer active:scale-98 transition"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-zinc-300">
                  {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'} no carrinho
                </div>
                <div className="text-sm font-black text-white">
                  {(totalCartCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>

            <Button
              size="sm"
              className="h-9 px-4 text-xs font-black text-white rounded-xl shadow-md flex items-center gap-1.5 pointer-events-none"
              style={{ backgroundColor: primaryColor }}
            >
              Ver Pedido
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Modal de Customização do Produto (Opcionais / Adicionais) ─── */}
      <Dialog open={!!customizingProduct} onOpenChange={(open) => !open && setCustomizingProduct(null)}>
        <DialogContent className="sm:max-w-lg bg-zinc-900 text-white rounded-3xl p-6 border border-zinc-800 max-h-[85vh] overflow-y-auto">
          {customizingProduct && (
            <div className="space-y-5">
              <DialogHeader>
                <DialogTitle className="text-base font-black text-white flex items-center justify-between">
                  <span>{customizingProduct.name}</span>
                  <span className="text-emerald-400 font-black text-sm">
                    {((customizingProduct.salePriceCents || 0) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {customizingProduct.description || 'Personalize do seu jeito com nossos adicionais.'}
                </DialogDescription>
              </DialogHeader>

              {/* Grupos de Modificadores */}
              {(customizingProduct.modifierGroups || []).map((group: any) => {
                const isSingleChoice = group.maxSelectable === 1;
                const selected = selectedModifiers[group.id] || [];
                const isMeatDoneness =
                  group.name.toLowerCase().includes('ponto') ||
                  group.name.toLowerCase().includes('cocção') ||
                  group.name.toLowerCase().includes('doneness');

                return (
                  <div key={group.id} className="p-4 rounded-2xl bg-zinc-800/60 border border-zinc-700/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isMeatDoneness && <Flame className="w-4 h-4 text-amber-500" />}
                        <span className="text-xs font-black text-white">{group.name}</span>
                      </div>
                      <Badge className="bg-zinc-700 text-zinc-300 text-[10px] font-bold">
                        {group.isRequired ? 'Seleção Obrigatória' : `Opcional (até ${group.maxSelectable})`}
                      </Badge>
                    </div>

                    {isMeatDoneness ? (
                      /* Layout Gourmet de Ponto da Carne (Benchmark Tablet Mesa Alta Gastronomia) */
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {(group.items || []).map((modItem: any) => {
                          const isChecked = selected.includes(modItem.id);
                          const nameLower = modItem.name.toLowerCase();
                          const isRare = nameLower.includes('mal');
                          const isMedium = nameLower.includes('ponto');
                          const isWell = nameLower.includes('bem');

                          return (
                            <div
                              key={modItem.id}
                              onClick={() => handleToggleModifier(group.id, modItem.id, group.maxSelectable)}
                              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center text-center relative touch-manipulation min-h-[96px] justify-center ${
                                isChecked
                                  ? 'bg-rose-950/40 border-rose-500 text-white shadow-lg shadow-rose-950/40 scale-[1.02]'
                                  : 'bg-zinc-800/40 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-full mb-2 flex items-center justify-center border text-xs ${
                                  isRare
                                    ? 'bg-red-600/20 border-red-500 text-red-400'
                                    : isMedium
                                    ? 'bg-amber-600/20 border-amber-500 text-amber-400'
                                    : 'bg-stone-700/40 border-stone-500 text-stone-300'
                                }`}
                              >
                                <Flame className="w-4 h-4" />
                              </div>
                              <span className="font-black text-xs text-white">{modItem.name}</span>
                              <span className="text-[10px] text-zinc-400 mt-1 leading-tight">
                                {isRare
                                  ? 'Centro avermelhado e muito suculento'
                                  : isMedium
                                  ? 'Centro rosado com maciez ideal'
                                  : isWell
                                  ? 'Cocção completa e crosta firme'
                                  : 'Ponto selecionado do corte'}
                              </span>
                              {isChecked && (
                                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-black">
                                  ✓
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Layout Padrão de Adicionais e Opcionais */
                      <div className="space-y-2">
                        {(group.items || []).map((modItem: any) => {
                          const isChecked = selected.includes(modItem.id);
                          return (
                            <div
                              key={modItem.id}
                              onClick={() => handleToggleModifier(group.id, modItem.id, group.maxSelectable)}
                              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition text-xs touch-manipulation min-h-[48px] ${
                                isChecked
                                  ? 'bg-indigo-950/40 border-indigo-500 text-white font-bold'
                                  : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-300 hover:bg-zinc-800'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-5 h-5 rounded-${isSingleChoice ? 'full' : 'md'} border flex items-center justify-center shrink-0 ${
                                    isChecked ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-600'
                                  }`}
                                >
                                  {isChecked && <Check className="w-3.5 h-3.5" />}
                                </div>
                                <span>{modItem.name}</span>
                              </div>

                              {modItem.priceCents > 0 && (
                                <span className="text-emerald-400 font-bold text-xs">
                                  +{(modItem.priceCents / 100).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Observações */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Observações para a cozinha
                </label>
                <Input
                  placeholder="Ex: Ponto menos tostado, sem salpicado de cebolinha..."
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="h-11 text-xs bg-zinc-800 border-zinc-700 text-white rounded-xl placeholder:text-zinc-500"
                />
              </div>

              {/* Quantidade e Botão de Adicionar */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded-xl border border-zinc-700">
                  <button
                    onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center font-bold"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-black text-sm">{itemQuantity}</span>
                  <button
                    onClick={() => setItemQuantity((q) => q + 1)}
                    className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Button
                  onClick={handleAddToCart}
                  className="flex-1 h-10 text-xs font-black text-white rounded-xl shadow-md"
                  style={{ backgroundColor: primaryColor }}
                >
                  Adicionar ao Pedido
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Modal do Carrinho & Envio para a Cozinha ─── */}
      <Dialog open={cartModalOpen} onOpenChange={setCartModalOpen}>
        <DialogContent className="sm:max-w-md bg-zinc-900 text-white rounded-3xl p-6 border border-zinc-800 font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
              Seu Pedido — {table.label}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Revise os itens antes de enviar diretamente para os cozinheiros.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 max-h-[50vh] overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={item.id} className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="font-black text-white">
                    {item.quantity}x {item.product.name}
                  </div>
                  {item.selectedModifiers.length > 0 && (
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {item.selectedModifiers.map((m) => m.name).join(', ')}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-[11px] text-amber-400 italic mt-0.5">
                      Obs: {item.notes}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-emerald-400">
                    {((item.totalPriceCents || 0) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                  <button
                    onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-zinc-500 hover:text-rose-400 text-xs p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-sm">
            <span className="text-zinc-400 font-bold">Total do Pedido:</span>
            <span className="text-lg font-black text-emerald-400">
              {(totalCartCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>

          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              onClick={() => setCartModalOpen(false)}
              className="h-10 text-xs rounded-xl border-zinc-700 text-zinc-300"
            >
              Continuar Escolhendo
            </Button>
            <Button
              disabled={createOrderMutation.isPending || cart.length === 0}
              onClick={handleSendOrder}
              className="h-10 text-xs font-black text-white rounded-xl shadow-lg flex items-center gap-2"
              style={{ backgroundColor: primaryColor }}
            >
              {createOrderMutation.isPending ? 'Enviando...' : 'ENVIAR PARA A COZINHA'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal de Confirmação de Pedido Enviado ─── */}
      <Dialog open={!!orderSuccessModal} onOpenChange={(open) => !open && setOrderSuccessModal(null)}>
        <DialogContent className="sm:max-w-md bg-zinc-900 text-white rounded-3xl p-6 border border-zinc-800 text-center font-sans">
          <div className="py-4 flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <DialogTitle className="text-lg font-black text-white">
              Pedido #{orderSuccessModal?.orderNumber} Enviado!
            </DialogTitle>

            <DialogDescription className="text-xs text-zinc-400 max-w-xs mx-auto">
              Seu pedido já apareceu na tela da nossa cozinha e os cozinheiros já estão preparando.
            </DialogDescription>

            <div className="p-3 bg-zinc-800/80 rounded-2xl border border-zinc-700 w-full text-xs text-zinc-300 flex items-center justify-around">
              <div className="text-center">
                <span className="text-[11px] text-zinc-500 block">Mesa</span>
                <strong className="text-white font-black">{table.label}</strong>
              </div>
              <div className="h-6 w-px bg-zinc-700" />
              <div className="text-center">
                <span className="text-[11px] text-zinc-500 block">Preparo Estimado</span>
                <strong className="text-amber-400 font-black">15 a 20 min</strong>
              </div>
            </div>

            <Button
              onClick={() => setOrderSuccessModal(null)}
              className="w-full h-10 text-xs font-black text-white rounded-xl shadow-md mt-2"
              style={{ backgroundColor: primaryColor }}
            >
              Voltar ao Cardápio
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal do Extrato / Comanda da Mesa em Tempo Real ─── */}
      <Dialog open={tableBillModalOpen} onOpenChange={setTableBillModalOpen}>
        <DialogContent className="sm:max-w-lg bg-zinc-900 text-white rounded-3xl p-6 border border-zinc-800 font-sans max-h-[85vh] overflow-y-auto select-none">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" />
                <DialogTitle className="text-base font-black text-white">
                  Comanda da Mesa — {table.label}
                </DialogTitle>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                Mesa Ativa
              </Badge>
            </div>
            <DialogDescription className="text-xs text-zinc-400">
              Acompanhe todos os pedidos já enviados e o total acumulado da sua mesa.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4">
            {sessionOrders.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-xs space-y-2">
                <UtensilsCrossed className="w-8 h-8 mx-auto text-zinc-600 mb-1" />
                <p>Nenhum pedido realizado nesta mesa ainda.</p>
                <p className="text-[11px] text-zinc-600">Escolha seus pratos no cardápio e envie para a cozinha!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessionOrders.map((order: any) => (
                  <div
                    key={order.id}
                    className="p-3.5 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-xs">Pedido #{order.orderNumber}</span>
                        <Badge
                          className={`text-[10px] font-bold ${
                            order.status === 'READY'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : order.status === 'PREPARING'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-zinc-700 text-zinc-300'
                          }`}
                        >
                          {order.status === 'READY'
                            ? 'Pronto'
                            : order.status === 'PREPARING'
                            ? 'Em Preparo'
                            : 'Na Cozinha'}
                        </Badge>
                      </div>
                      <span className="text-emerald-400 font-black">
                        {((order.totalCents || 0) / 100).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </div>

                    {/* Itens do Pedido */}
                    <div className="space-y-1.5 pt-1 border-t border-zinc-700/60">
                      {(order.items || []).map((item: any, i: number) => (
                        <div key={i} className="flex items-start justify-between text-[11px] text-zinc-300">
                          <div>
                            <span className="font-bold text-white">{item.quantity}x</span> {item.product?.name || item.name}
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="text-[10px] text-zinc-400 pl-3">
                                {item.modifiers.map((m: any) => m.modifierItem?.name || m.name).join(', ')}
                              </div>
                            )}
                          </div>
                          <span className="text-zinc-400 shrink-0 font-medium">
                            {(((item.totalPriceCents || item.priceCents * item.quantity) || 0) / 100).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subtotal da Comanda */}
          <div className="pt-3 border-t border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Total de Itens:</span>
              <span className="text-white font-bold">{sessionItemsCount} itens</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300 font-bold">Total Acumulado da Mesa:</span>
              <span className="text-lg font-black text-emerald-400">
                {(sessionTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

          <DialogFooter className="pt-3 flex sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setTableBillModalOpen(false)}
              className="flex-1 h-10 text-xs rounded-xl border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Continuar Pedindo
            </Button>
            <Button
              disabled={callWaiterMutation.isPending}
              onClick={() => {
                callWaiterMutation.mutate('BILL');
                setTableBillModalOpen(false);
              }}
              className="flex-1 h-10 text-xs font-black text-white rounded-xl shadow-md bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-1.5"
            >
              <Receipt className="w-4 h-4" />
              Pedir Encerramento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default TabletMenuPage;
