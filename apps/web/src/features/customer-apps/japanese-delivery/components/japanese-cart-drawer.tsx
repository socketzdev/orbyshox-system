import React, { useState } from 'react';
import { X, Plus, Minus, ShoppingBag, ArrowRight, Tag, Trash2 } from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseCartDrawer: React.FC = () => {
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    setIsCheckoutOpen,
  } = useJapaneseCart();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState(false);

  if (!isCartOpen) return null;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = applyCoupon(couponInput);
    if (!ok) {
      setCouponError(true);
      setTimeout(() => setCouponError(false), 3000);
    } else {
      setCouponInput('');
    }
  };

  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-black/80 backdrop-blur-md">
      <div className="w-full sm:max-w-md h-[90vh] sm:h-full bg-[#0D0D0D] border-l border-[#262626] flex flex-col text-white shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#FA5D46]/15 flex items-center justify-center text-[#FA5D46]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-[#F5F5F0]">
                Minha Sacola
              </h3>
              <p className="text-[11px] text-[#8E8E93]">
                {cart.length} {cart.length === 1 ? 'item' : 'itens'} adicionados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-zinc-500 hover:text-red-400 p-1.5 transition"
                title="Esvaziar sacola"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-[#161616] border border-[#262626] flex items-center justify-center text-4xl mb-4">
              🍣
            </div>
            <h4 className="text-base font-bold text-[#F5F5F0]">Sua sacola está vazia</h4>
            <p className="text-xs text-[#8E8E93] mt-1.5 max-w-xs leading-relaxed">
              Explore o menu da Minami e selecione seus sushis e combinados artesanais favoritos.
            </p>
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className="mt-6 px-6 h-10 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white text-xs font-bold transition shadow-md shadow-[#FA5D46]/20"
            >
              Explorar Cardápio
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4">
            {/* Items list */}
            {cart.map(item => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#161616] border border-[#262626] flex gap-3 relative group"
              >
                {/* Thumbnail */}
                <div className="relative w-20 h-20 rounded-xl bg-black overflow-hidden shrink-0 flex items-center justify-center">
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/70 text-[9px] font-semibold text-zinc-300">
                    {item.product.pieces}p
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h5 className="text-xs font-black uppercase text-[#F5F5F0] truncate">
                        {item.product.name}
                      </h5>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="text-[#8E8E93] hover:text-red-400 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[10px] text-[#8E8E93]">
                      {item.product.weightGrams}g
                    </p>

                    {item.sauces.length > 0 && (
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                        {item.sauces.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-[#FA5D46]">
                      R$ {(item.totalPriceCents / 100).toFixed(2).replace('.', ',')}
                    </span>

                    {/* Stepper */}
                    <div className="flex items-center rounded-full bg-[#1C1C1E] border border-white/5 px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Coupon input */}
            <div className="pt-2">
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 absolute left-3 top-3.5 text-[#8E8E93]" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value)}
                    placeholder="Cupom (ex: MINAMI20)"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#161616] border border-[#262626] text-xs text-white placeholder-[#8E8E93] uppercase focus:outline-none focus:border-[#FA5D46]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 h-10 rounded-xl bg-[#262626] hover:bg-[#333333] text-xs font-bold text-white transition"
                >
                  Aplicar
                </button>
              </form>

              {appliedCoupon && (
                <div className="mt-2 flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                  <span>Cupom <strong>{appliedCoupon}</strong> ativo (-20%)</span>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-[11px] underline hover:text-emerald-300"
                  >
                    Remover
                  </button>
                </div>
              )}

              {couponError && (
                <p className="mt-1.5 text-[11px] text-red-400">
                  Cupom inválido. Tente usar <strong>MINAMI20</strong>.
                </p>
              )}
            </div>

            {/* Summary calculations */}
            <div className="pt-3 border-t border-[#262626] space-y-2 text-xs">
              <div className="flex justify-between text-[#8E8E93]">
                <span>Subtotal</span>
                <span>R$ {(subtotalCents / 100).toFixed(2).replace('.', ',')}</span>
              </div>

              <div className="flex justify-between text-[#8E8E93]">
                <span>Taxa de Entrega</span>
                <span>
                  {deliveryFeeCents === 0 ? (
                    <span className="text-emerald-400 font-semibold">Grátis</span>
                  ) : (
                    `R$ ${(deliveryFeeCents / 100).toFixed(2).replace('.', ',')}`
                  )}
                </span>
              </div>

              {discountCents > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Desconto (MINAMI20)</span>
                  <span>- R$ {(discountCents / 100).toFixed(2).replace('.', ',')}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[#262626] flex justify-between text-sm font-black text-[#F5F5F0]">
                <span>Total</span>
                <span className="text-base text-[#FA5D46]">
                  R$ {(totalCents / 100).toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        {cart.length > 0 && (
          <div className="p-4 bg-[#141414] border-t border-[#262626]">
            <button
              type="button"
              onClick={handleProceedToCheckout}
              className="w-full h-12 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FA5D46]/25 active:scale-98 transition"
            >
              <span>Avançar para Pagamento</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
