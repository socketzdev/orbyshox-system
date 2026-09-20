import React, { useState, useRef } from 'react';
import { SPECIAL_OFFERS, SpecialOffer, JAPANESE_PRODUCTS } from '../japanese-data';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseSpecialOffers: React.FC = () => {
  const { setSelectedProduct } = useJapaneseCart();
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const index = Math.round(scrollLeft / (clientWidth * 0.8));
      setActiveOfferIndex(Math.min(SPECIAL_OFFERS.length - 1, Math.max(0, index)));
    }
  };

  const handleSelectOffer = (offer: SpecialOffer) => {
    const product = JAPANESE_PRODUCTS.find(p => p.id === offer.productId) || JAPANESE_PRODUCTS[0];
    setSelectedProduct(product);
  };

  return (
    <div className="py-3">
      {/* Title */}
      <div className="px-5 mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight text-[#F5F5F0]">
          Ofertas Especiais
        </h3>
        <span className="text-[11px] font-semibold text-[#FA5D46]">
          Ver todas
        </span>
      </div>

      {/* Horizontal Carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3.5 overflow-x-auto no-scrollbar px-5 scroll-smooth snap-x snap-mandatory"
      >
        {SPECIAL_OFFERS.map((offer, idx) => (
          <div
            key={offer.id}
            onClick={() => handleSelectOffer(offer)}
            className="snap-center shrink-0 w-[240px] sm:w-[270px] rounded-2xl bg-[#161616] border border-[#262626] overflow-hidden cursor-pointer group hover:border-[#FA5D46]/40 transition relative shadow-lg"
          >
            {/* Image Header with Discount Badge */}
            <div className="relative h-32 w-full overflow-hidden bg-black">
              <img
                src={offer.image}
                alt={offer.title}
                className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-transparent to-black/30" />

              {/* Discount Badge */}
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-[#FA5D46] text-white text-[11px] font-black tracking-wider shadow-md">
                {offer.badgeText}
              </div>
            </div>

            {/* Content info */}
            <div className="p-3.5">
              <h4 className="text-xs font-black tracking-wide text-[#F5F5F0] uppercase">
                {offer.title}
              </h4>
              <p className="text-[11px] text-[#8E8E93] mt-1 line-clamp-2 leading-relaxed">
                {offer.subtitle}
              </p>

              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-bold text-[#FA5D46]">
                    R$ {(offer.priceCents / 100).toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-[10px] text-[#8E8E93] line-through">
                    R$ {(offer.oldPriceCents / 100).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <span className="text-[10px] font-semibold text-white px-2 py-0.5 rounded-full bg-[#262626] group-hover:bg-[#FA5D46] transition">
                  Aproveitar
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Dots */}
      <div className="flex items-center justify-center gap-1.5 mt-2.5">
        {SPECIAL_OFFERS.map((_, idx) => (
          <span
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === activeOfferIndex ? 'w-4 bg-[#FA5D46]' : 'w-1.5 bg-[#2C2C2E]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
