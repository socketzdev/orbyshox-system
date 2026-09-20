import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { JapaneseCartProvider, useJapaneseCart } from './context/japanese-cart-context';
import { JapaneseStatusBar } from './components/japanese-status-bar';
import { JapaneseHomeView } from './components/japanese-home-view';
import { JapaneseFavoritesView } from './components/japanese-favorites-view';
import { JapaneseProfileView } from './components/japanese-profile-view';
import { JapaneseBottomNav } from './components/japanese-bottom-nav';
import { JapaneseProductModal } from './components/japanese-product-modal';
import { JapaneseCartDrawer } from './components/japanese-cart-drawer';
import { JapaneseCheckoutModal } from './components/japanese-checkout-modal';
import { JapaneseTrackingModal } from './components/japanese-tracking-modal';
import { Smartphone, Monitor, Sparkles, ShoppingBag } from 'lucide-react';

const JapaneseDeliveryAppContent: React.FC = () => {
  const { activeTab, setActiveOrder, orderHistory } = useJapaneseCart();
  const [isPhoneFrame, setIsPhoneFrame] = useState(true);

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F0] flex flex-col items-center justify-center relative selection:bg-[#FA5D46] selection:text-white">
      {/* Desktop Top Bar: Mode Switcher & Quick Demo Helpers (only shown on desktop lg+) */}
      <div className="hidden lg:flex items-center justify-between w-full max-w-4xl px-6 py-3 text-xs text-[#8E8E93] border-b border-white/5 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FA5D46] animate-pulse" />
            <span className="font-bold text-white tracking-wider uppercase">
              Template Restaurante Japonês (MINAMI Sushi)
            </span>
          </div>
          <span className="text-zinc-600">|</span>
          <span className="text-[11px] text-zinc-400">App Próprio do Cliente (Customer Delivery App)</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Demo: Trigger live tracking with demo order */}
          <button
            type="button"
            onClick={() => orderHistory[0] && setActiveOrder(orderHistory[0])}
            className="px-3 py-1 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-zinc-300 hover:text-white text-[11px] font-semibold border border-white/5 flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-3 h-3 text-[#FA5D46]" />
            <span>Testar Rastreio ao Vivo</span>
          </button>

          {/* Switcher Phone Frame vs Full width */}
          <button
            type="button"
            onClick={() => setIsPhoneFrame(!isPhoneFrame)}
            className="px-3 py-1 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-zinc-300 hover:text-white text-[11px] font-semibold border border-white/5 flex items-center gap-1.5 transition"
          >
            {isPhoneFrame ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-blue-400" />
                <span>Modo Tela Cheia</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-[#FA5D46]" />
                <span>Simulador iPhone</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Container: Mobile Frame on Desktop or Full Responsive */}
      <div
        className={`w-full transition-all duration-300 ${
          isPhoneFrame
            ? 'max-w-[420px] my-0 lg:my-6 rounded-none sm:rounded-[44px] shadow-2xl shadow-black/90 border-0 sm:border-[8px] sm:border-[#1F1F22] overflow-hidden relative ring-1 ring-white/10'
            : 'max-w-2xl min-h-screen relative'
        } bg-[#0D0D0D]`}
      >
        {/* iOS Status Bar */}
        <JapaneseStatusBar />

        {/* Tab Content */}
        <main className="min-h-[85vh]">
          {activeTab === 'home' && <JapaneseHomeView />}
          {activeTab === 'favorites' && <JapaneseFavoritesView />}
          {activeTab === 'profile' && <JapaneseProfileView />}
        </main>

        {/* Floating Bottom Nav Bar */}
        <JapaneseBottomNav />

        {/* Modals & Drawers */}
        <JapaneseProductModal />
        <JapaneseCartDrawer />
        <JapaneseCheckoutModal />
        <JapaneseTrackingModal />
      </div>
    </div>
  );
};

export const JapaneseDeliveryApp: React.FC<{ restaurantName?: string }> = ({
  restaurantName,
}) => {
  const { slug } = useParams<{ slug?: string }>();
  const name =
    restaurantName ||
    (slug
      ? slug.replace(/-/g, ' ').toUpperCase()
      : 'MINAMI');

  return (
    <JapaneseCartProvider initialRestaurantName={name}>
      <JapaneseDeliveryAppContent />
    </JapaneseCartProvider>
  );
};
