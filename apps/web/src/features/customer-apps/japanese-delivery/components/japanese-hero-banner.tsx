import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';
import { JAPANESE_PRODUCTS } from '../japanese-data';

export const JapaneseHeroBanner: React.FC = () => {
  const { setSelectedProduct } = useJapaneseCart();
  const sakuraProduct = JAPANESE_PRODUCTS.find(p => p.id === 'prod-sakura-wave') || JAPANESE_PRODUCTS[0];

  return (
    <div className="px-5 py-2">
      <div
        onClick={() => setSelectedProduct(sakuraProduct)}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#18181A] via-[#141416] to-[#0E0E10] border border-white/5 p-5 cursor-pointer group shadow-xl hover:border-white/10 transition-all duration-300"
      >
        {/* Subtle coral ambient glow */}
        <div className="absolute -left-12 -top-12 w-36 h-36 rounded-full bg-[#FA5D46]/10 blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between gap-3 relative z-10">
          {/* Left info column */}
          <div className="flex-1 max-w-[58%]">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FA5D46]/15 border border-[#FA5D46]/30 mb-2">
              <Sparkles className="w-2.5 h-2.5 text-[#FA5D46]" />
              <span className="text-[9px] font-bold tracking-widest text-[#FA5D46] uppercase">
                Edição Limitada
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-black tracking-tight text-[#F5F5F0] uppercase leading-tight font-sans">
              Sakura Wave Set
            </h2>

            <p className="text-[11px] text-[#8E8E93] mt-1.5 leading-snug line-clamp-2">
              Atum bluefin fresco, arroz com infusão de flor de sakura e vieiras de Hokkaido.
            </p>

            <div className="mt-3.5 flex items-center gap-2">
              <button
                type="button"
                className="h-8 px-4 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#FA5D46]/25 group-hover:scale-105 active:scale-95 transition"
              >
                <span>Pedir Agora</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
              </button>

              <span className="text-xs font-black text-[#F5F5F0]">
                R$ 98,00
              </span>
            </div>
          </div>

          {/* Right sushi image */}
          <div className="w-[42%] flex items-center justify-end relative">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
              <img
                src="/templates/japanese/assets/hero-sushi-platter.jpg"
                alt="Sakura Wave Set"
                className="w-full h-full object-cover rounded-2xl group-hover:scale-105 transition duration-300 drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
              />
              <span className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-md bg-black/80 border border-white/10 text-[9px] font-bold text-zinc-300">
                18 peças
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
