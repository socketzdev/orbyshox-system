import React from 'react';
import { Heart, ShoppingBag, X, ArrowLeft } from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';
import { JAPANESE_PRODUCTS } from '../japanese-data';

export const JapaneseFavoritesView: React.FC = () => {
  const { favorites, toggleFavorite, addToCart, setSelectedProduct, setActiveTab } =
    useJapaneseCart();

  const favoriteProducts = JAPANESE_PRODUCTS.filter(p => favorites.includes(p.id));

  return (
    <div className="px-5 py-3 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-black text-[#F5F5F0]">Meus Favoritos</h2>
        </div>
        <span className="text-xs text-[#8E8E93]">
          {favoriteProducts.length} {favoriteProducts.length === 1 ? 'item' : 'itens'}
        </span>
      </div>

      {favoriteProducts.length === 0 ? (
        <div className="py-20 text-center text-[#8E8E93]">
          <div className="w-16 h-16 rounded-full bg-[#161616] border border-[#262626] flex items-center justify-center text-3xl mx-auto mb-3">
            ❤️
          </div>
          <p className="text-sm font-bold text-[#F5F5F0]">Nenhum favorito salvo ainda</p>
          <p className="text-xs mt-1 max-w-xs mx-auto">
            Toque no ícone de coração nos sushis para salvá-los e pedir com mais agilidade.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="mt-5 px-5 h-9 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white text-xs font-bold transition"
          >
            Ver Cardápio
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {favoriteProducts.map(product => (
            <div
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className="p-3.5 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between gap-3 cursor-pointer group hover:border-[#FA5D46]/40 transition"
            >
              {/* Image with pieces badge */}
              <div className="relative w-20 h-20 rounded-xl bg-black overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                />
                <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 text-[9px] font-semibold text-zinc-300">
                  {product.pieces}p
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black uppercase text-[#F5F5F0] truncate">
                  {product.name}
                </h4>
                <p className="text-[11px] text-[#8E8E93] mt-0.5">{product.weightGrams}g</p>
                <p className="text-xs font-bold text-[#FA5D46] mt-2">
                  R$ {(product.priceCents / 100).toFixed(2).replace('.', ',')}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    toggleFavorite(product.id);
                  }}
                  className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] hover:text-red-400 transition"
                  title="Remover dos favoritos"
                >
                  <X className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    addToCart(product, 1);
                  }}
                  className="w-9 h-9 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white flex items-center justify-center shadow-md shadow-[#FA5D46]/25 transition"
                  title="Adicionar à sacola"
                >
                  <ShoppingBag className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
