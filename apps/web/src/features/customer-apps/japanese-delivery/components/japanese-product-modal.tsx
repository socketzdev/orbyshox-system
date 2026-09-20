import React, { useState } from 'react';
import { ArrowLeft, Heart, Star, Plus, Minus, Check, Flame } from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';
import { SAUCE_OPTIONS, CUTLERY_OPTIONS, EXTRAS_OPTIONS } from '../japanese-data';

export const JapaneseProductModal: React.FC = () => {
  const { selectedProduct, setSelectedProduct, addToCart, isFavorite, toggleFavorite, setIsCartOpen } =
    useJapaneseCart();

  const [quantity, setQuantity] = useState(1);
  const [selectedSauces, setSelectedSauces] = useState<string[]>(['shoyu-tradicional']);
  const [selectedCutlery, setSelectedCutlery] = useState<string>('hashi-bambu');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  if (!selectedProduct) return null;

  const fav = isFavorite(selectedProduct.id);

  // Calculate total price with extras
  const extrasCost = selectedExtras.reduce((acc, extraId) => {
    const item = EXTRAS_OPTIONS.find(e => e.id === extraId);
    return acc + (item ? item.priceCents : 0);
  }, 0);

  const saucesCost = selectedSauces.reduce((acc, sauceId) => {
    const item = SAUCE_OPTIONS.find(s => s.id === sauceId);
    return acc + (item ? item.priceCents : 0);
  }, 0);

  const unitTotalCents = selectedProduct.priceCents + extrasCost + saucesCost;
  const grandTotalCents = unitTotalCents * quantity;

  const toggleSauce = (id: string) => {
    setSelectedSauces(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(s => s !== id) : prev) : [...prev, id]
    );
  };

  const toggleExtra = (id: string) => {
    setSelectedExtras(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleAddToCart = () => {
    addToCart(selectedProduct, quantity, {
      sauces: selectedSauces.map(id => SAUCE_OPTIONS.find(s => s.id === id)?.name || id),
      cutlery: CUTLERY_OPTIONS.find(c => c.id === selectedCutlery)?.name || 'Hashi Padrão',
      extras: selectedExtras.map(id => EXTRAS_OPTIONS.find(e => e.id === id)?.name || id),
      notes,
      extraPriceCents: extrasCost + saucesCost,
    });
    setSelectedProduct(null);
    setIsCartOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md overflow-hidden">
      <div className="w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] bg-[#0D0D0D] border border-[#262626] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden text-white shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Top Floating Action Bar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          <button
            type="button"
            onClick={() => setSelectedProduct(null)}
            className="pointer-events-auto h-10 px-3.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white flex items-center gap-1.5 text-xs font-semibold hover:bg-black/80 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <button
            type="button"
            onClick={() => toggleFavorite(selectedProduct.id)}
            className={`pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition ${
              fav
                ? 'bg-[#FA5D46] text-white shadow-lg shadow-[#FA5D46]/30'
                : 'bg-black/60 border border-white/10 text-white hover:bg-black/80'
            }`}
          >
            <Heart className={`w-4 h-4 ${fav ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Hero Dish Image */}
          <div className="relative w-full h-64 sm:h-72 bg-gradient-to-b from-[#18181A] to-[#0D0D0D] flex items-center justify-center overflow-hidden">
            <img
              src={selectedProduct.heroImage || selectedProduct.image}
              alt={selectedProduct.name}
              className="w-full h-full object-cover sm:object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.8)]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-transparent to-black/30 pointer-events-none" />
          </div>

          {/* Details Section */}
          <div className="p-6 space-y-5">
            {/* Title, rating and price */}
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-[#F5F5F0]">
                    {selectedProduct.name}
                  </h2>

                  {/* Rating */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex items-center text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < Math.floor(selectedProduct.rating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-zinc-600'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-white">
                      {selectedProduct.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-[#8E8E93]">
                      ({selectedProduct.reviewsCount} avaliações)
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xl font-black text-[#FA5D46]">
                    R$ {(selectedProduct.priceCents / 100).toFixed(2).replace('.', ',')}
                  </span>
                  {selectedProduct.oldPriceCents && (
                    <p className="text-xs text-[#8E8E93] line-through">
                      R$ {(selectedProduct.oldPriceCents / 100).toFixed(2).replace('.', ',')}
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="mt-3 text-xs leading-relaxed text-[#8E8E93]">
                {selectedProduct.description}
              </p>

              {/* Portion Specs & Tags */}
              <div className="mt-4 p-3 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-semibold">
                  {selectedProduct.pieces} {selectedProduct.pieces === 1 ? 'peça' : 'peças'}
                </span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400">~{selectedProduct.weightGrams}g</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-[#FA5D46]" />
                  {selectedProduct.caloriesKcal} kcal
                </span>
              </div>

              {/* Badges list */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedProduct.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-white/5 text-[10px] font-semibold text-[#8E8E93]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Modifiers: Sauces */}
            <div className="pt-2 border-t border-[#262626]">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5F5F0]">
                  Escolha os Molhos
                </h4>
                <span className="text-[10px] text-[#8E8E93]">Até 3 inclusos</span>
              </div>

              <div className="space-y-2">
                {SAUCE_OPTIONS.map(sauce => {
                  const isChecked = selectedSauces.includes(sauce.id);
                  return (
                    <label
                      key={sauce.id}
                      onClick={() => toggleSauce(sauce.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        isChecked
                          ? 'bg-[#1C1C1E] border-[#FA5D46]/40 text-white'
                          : 'bg-[#141414] border-[#222222] text-[#8E8E93] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            isChecked
                              ? 'bg-[#FA5D46] border-[#FA5D46] text-white'
                              : 'border-zinc-600'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span className="text-xs font-medium">{sauce.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-zinc-400">
                        {sauce.priceCents === 0
                          ? 'Grátis'
                          : `+ R$ ${(sauce.priceCents / 100).toFixed(2).replace('.', ',')}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modifiers: Cutlery */}
            <div className="pt-2 border-t border-[#262626]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5F5F0] mb-2.5">
                Hashis & Talheres
              </h4>
              <div className="space-y-2">
                {CUTLERY_OPTIONS.map(c => {
                  const isSelected = selectedCutlery === c.id;
                  return (
                    <label
                      key={c.id}
                      onClick={() => setSelectedCutlery(c.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-[#1C1C1E] border-[#FA5D46]/40 text-white'
                          : 'bg-[#141414] border-[#222222] text-[#8E8E93] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-[#FA5D46] text-[#FA5D46]'
                              : 'border-zinc-600'
                          }`}
                        >
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-[#FA5D46]" />
                          )}
                        </div>
                        <span className="text-xs font-medium">{c.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-zinc-400">
                        {c.priceCents === 0 ? 'Incluso' : `+ R$ ${(c.priceCents / 100).toFixed(2)}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Extras */}
            <div className="pt-2 border-t border-[#262626]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5F5F0] mb-2.5">
                Adicionais Especiais
              </h4>
              <div className="space-y-2">
                {EXTRAS_OPTIONS.map(extra => {
                  const isChecked = selectedExtras.includes(extra.id);
                  return (
                    <label
                      key={extra.id}
                      onClick={() => toggleExtra(extra.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        isChecked
                          ? 'bg-[#1C1C1E] border-[#FA5D46]/40 text-white'
                          : 'bg-[#141414] border-[#222222] text-[#8E8E93] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            isChecked
                              ? 'bg-[#FA5D46] border-[#FA5D46] text-white'
                              : 'border-zinc-600'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span className="text-xs font-medium">{extra.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-zinc-400">
                        {extra.priceCents === 0
                          ? 'Grátis'
                          : `+ R$ ${(extra.priceCents / 100).toFixed(2).replace('.', ',')}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Observações */}
            <div className="pt-2 border-t border-[#262626]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5F5F0] mb-2">
                Alguma Observação?
              </h4>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: sem gergelim, enviar pouco arroz..."
                className="w-full h-11 px-3.5 rounded-xl bg-[#161616] border border-[#262626] text-xs text-white placeholder-[#8E8E93] focus:outline-none focus:border-[#FA5D46]"
              />
            </div>
          </div>
        </div>

        {/* Bottom Sticky Action Bar */}
        <div className="p-4 bg-[#141414] border-t border-[#262626] flex items-center gap-3">
          {/* Quantity stepper */}
          <div className="flex items-center rounded-full bg-[#1C1C1E] border border-white/5 p-1">
            <button
              type="button"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/10 transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center text-sm font-bold text-white">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(q => q + 1)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add to Cart CTA */}
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex-1 h-12 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FA5D46]/25 active:scale-98 transition"
          >
            <span>Adicionar à Sacola</span>
            <span>•</span>
            <span>R$ {(grandTotalCents / 100).toFixed(2).replace('.', ',')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
