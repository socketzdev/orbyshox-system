import React from 'react';
import { Home, Heart, ShoppingBag, User } from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseBottomNav: React.FC = () => {
  const { activeTab, setActiveTab, cartCount, favorites, setIsCartOpen, subtotalCents } =
    useJapaneseCart();

  return (
    <div className="fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
      <nav className="pointer-events-auto flex items-center justify-between gap-1 sm:gap-2 px-3 py-2 rounded-full bg-[#161618]/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/80 max-w-[360px] w-full">
        {/* Início */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 active:scale-95 ${
            activeTab === 'home'
              ? 'bg-[#FA5D46] text-white shadow-lg shadow-[#FA5D46]/30'
              : 'text-[#8E8E93] hover:text-[#F5F5F0]'
          }`}
          aria-label="Início"
        >
          <Home className="w-5 h-5" />
        </button>

        {/* Favoritos */}
        <button
          type="button"
          onClick={() => setActiveTab('favorites')}
          className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 active:scale-95 ${
            activeTab === 'favorites'
              ? 'bg-[#FA5D46] text-white shadow-lg shadow-[#FA5D46]/30'
              : 'text-[#8E8E93] hover:text-[#F5F5F0]'
          }`}
          aria-label="Favoritos"
        >
          <Heart className="w-5 h-5" />
          {favorites.length > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FA5D46] ring-2 ring-[#161618]" />
          )}
        </button>

        {/* Sacola / Carrinho */}
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className={`relative flex items-center justify-center h-12 px-4 rounded-full transition-all duration-200 active:scale-95 ${
            cartCount > 0
              ? 'bg-[#1F1F22] border border-[#FA5D46]/40 text-[#FA5D46]'
              : 'text-[#8E8E93] hover:text-[#F5F5F0]'
          }`}
          aria-label="Sacola"
        >
          <ShoppingBag className="w-5 h-5 shrink-0" />
          {cartCount > 0 && (
            <div className="ml-2 flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded-full bg-[#FA5D46] text-white text-[10px] font-black">
                {cartCount}
              </span>
              <span className="hidden sm:inline text-xs font-bold text-white">
                R$ {(subtotalCents / 100).toFixed(2).replace('.', ',')}
              </span>
            </div>
          )}
        </button>

        {/* Perfil */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 active:scale-95 ${
            activeTab === 'profile'
              ? 'bg-[#FA5D46] text-white shadow-lg shadow-[#FA5D46]/30'
              : 'text-[#8E8E93] hover:text-[#F5F5F0]'
          }`}
          aria-label="Perfil"
        >
          <User className="w-5 h-5" />
        </button>
      </nav>
    </div>
  );
};
