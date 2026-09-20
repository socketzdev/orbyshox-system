import React from 'react';
import { Heart, ShoppingBag, Plus } from 'lucide-react';
import { JapaneseProduct } from '../japanese-data';
import { useJapaneseCart } from '../context/japanese-cart-context';

interface JapaneseProductGridProps {
  products: JapaneseProduct[];
}

export const JapaneseProductGrid: React.FC<JapaneseProductGridProps> = ({ products }) => {
  const { toggleFavorite, isFavorite, setSelectedProduct, addToCart } = useJapaneseCart();

  const handleQuickAdd = (e: React.MouseEvent, product: JapaneseProduct) => {
    e.stopPropagation();
    addToCart(product, 1);
  };

  return (
    <div className="px-5 py-3">
      {/* Title */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight text-[#F5F5F0]">
          Seleção do Chef
        </h3>
        <span className="text-[11px] text-[#8E8E93]">
          {products.length} {products.length === 1 ? 'opção' : 'opções'}
        </span>
      </div>

      {products.length === 0 ? (
        <div className="py-12 text-center text-[#8E8E93]">
          <p className="text-sm">Nenhum prato encontrado com esses termos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {products.map(product => {
            const fav = isFavorite(product.id);

            return (
              <div
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="rounded-2xl bg-[#161616] border border-[#262626] p-3 flex flex-col justify-between cursor-pointer group hover:border-[#FA5D46]/40 transition duration-200 shadow-md relative"
              >
                {/* Top Row: Heart + Pieces badge */}
                <div className="flex items-center justify-between z-10">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      toggleFavorite(product.id);
                    }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                      fav
                        ? 'bg-[#FA5D46] text-white shadow-sm'
                        : 'bg-black/40 text-zinc-400 hover:text-white backdrop-blur-sm'
                    }`}
                    aria-label="Favoritar"
                  >
                    <Heart className={`w-3.5 h-3.5 ${fav ? 'fill-current' : ''}`} />
                  </button>

                  <span className="px-2 py-0.5 rounded-full bg-black/50 border border-white/10 text-[10px] font-semibold text-zinc-300 backdrop-blur-sm">
                    {product.pieces} {product.pieces === 1 ? 'peça' : 'peças'}
                  </span>
                </div>

                {/* Product Dish Image */}
                <div className="relative my-2 w-full h-28 sm:h-32 flex items-center justify-center overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition duration-300 drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
                    loading="lazy"
                  />
                </div>

                {/* Product Info */}
                <div className="mt-1">
                  <h4 className="text-[12px] sm:text-[13px] font-black uppercase tracking-tight text-[#F5F5F0] truncate">
                    {product.name}
                  </h4>

                  <p className="text-[11px] text-[#8E8E93] mt-0.5">
                    {product.weightGrams}g
                  </p>

                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <span className="text-xs sm:text-sm font-black text-[#F5F5F0]">
                        R$ {(product.priceCents / 100).toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={e => handleQuickAdd(e, product)}
                      className="w-8 h-8 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white flex items-center justify-center shadow-md shadow-[#FA5D46]/20 active:scale-95 transition"
                      aria-label="Adicionar à sacola"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
