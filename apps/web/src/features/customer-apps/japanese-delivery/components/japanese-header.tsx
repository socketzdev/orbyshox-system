import React, { useState } from 'react';
import { Bell, MapPin, ChevronDown, Check, Clock } from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseHeader: React.FC = () => {
  const { restaurantName, deliveryAddress, setDeliveryAddress } = useJapaneseCart();
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [tempStreet, setTempStreet] = useState(deliveryAddress.street);
  const [tempNumber, setTempNumber] = useState(deliveryAddress.number);
  const [tempComplement, setTempComplement] = useState(deliveryAddress.complement || '');
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    setDeliveryAddress(prev => ({
      ...prev,
      street: tempStreet,
      number: tempNumber,
      complement: tempComplement,
    }));
    setAddressModalOpen(false);
  };

  return (
    <>
      <header className="px-5 pt-2 pb-3">
        {/* Top brand row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-[0.18em] text-[#F5F5F0] uppercase font-sans">
              {restaurantName || 'MINAMI'}
            </h1>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FA5D46]" />
          </div>

          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className="relative w-10 h-10 rounded-full bg-[#1C1C1E] border border-white/5 flex items-center justify-center text-[#F5F5F0] hover:bg-[#252528] active:scale-95 transition"
            aria-label="Notificações"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FA5D46] ring-2 ring-[#0D0D0D]" />
          </button>
        </div>

        {/* Delivery address & store status row */}
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setAddressModalOpen(true)}
            className="flex items-center gap-1.5 text-[#8E8E93] hover:text-[#F5F5F0] transition group max-w-[70%]"
          >
            <MapPin className="w-3.5 h-3.5 text-[#FA5D46] shrink-0" />
            <span className="truncate font-medium text-[#F5F5F0]">
              {deliveryAddress.street}, {deliveryAddress.number}
            </span>
            <ChevronDown className="w-3 h-3 text-[#8E8E93] group-hover:translate-y-0.5 transition shrink-0" />
          </button>

          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8E8E93]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 font-semibold">Aberto</span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3 text-zinc-500" />
              30-45m
            </span>
          </div>
        </div>
      </header>

      {/* Address Switcher Modal */}
      {addressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#161616] border border-[#262626] rounded-t-3xl sm:rounded-3xl p-6 text-white shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <h3 className="text-base font-bold text-[#F5F5F0]">Endereço de Entrega</h3>
              <button
                type="button"
                onClick={() => setAddressModalOpen(false)}
                className="text-xs text-[#8E8E93] hover:text-white px-2 py-1"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider block mb-1">
                  Rua / Avenida
                </label>
                <input
                  type="text"
                  value={tempStreet}
                  onChange={e => setTempStreet(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#1C1C1E] border border-[#2A2A2A] text-sm text-white focus:outline-none focus:border-[#FA5D46]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider block mb-1">
                    Número
                  </label>
                  <input
                    type="text"
                    value={tempNumber}
                    onChange={e => setTempNumber(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#1C1C1E] border border-[#2A2A2A] text-sm text-white focus:outline-none focus:border-[#FA5D46]"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider block mb-1">
                    Complemento / Apto
                  </label>
                  <input
                    type="text"
                    value={tempComplement}
                    onChange={e => setTempComplement(e.target.value)}
                    placeholder="Ex: Apto 42"
                    className="w-full h-11 px-3 rounded-xl bg-[#1C1C1E] border border-[#2A2A2A] text-sm text-white focus:outline-none focus:border-[#FA5D46]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 mt-4 rounded-xl bg-[#FA5D46] hover:bg-[#CF4B3A] font-semibold text-sm text-white flex items-center justify-center gap-2 active:scale-98 transition shadow-lg shadow-[#FA5D46]/20"
              >
                <Check className="w-4 h-4" />
                Salvar Endereço
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Notifications Drawer */}
      {notificationsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#161616] border border-[#262626] rounded-t-3xl sm:rounded-3xl p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FA5D46]" />
                <h3 className="text-base font-bold text-[#F5F5F0]">Novidades & Cupons</h3>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="text-xs text-[#8E8E93] hover:text-white"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3.5 rounded-2xl bg-[#1C1C1E] border border-white/5 flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FA5D46]/10 flex items-center justify-center text-[#FA5D46] shrink-0">
                  🍣
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Cupom de Boas-Vindas: MINAMI20</p>
                  <p className="text-[11px] text-[#8E8E93] mt-0.5 leading-relaxed">
                    Ganhe 20% de desconto no seu primeiro pedido utilizando o cupom <span className="text-[#FA5D46] font-mono font-bold">MINAMI20</span> na sacola.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#1C1C1E] border border-white/5 flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                  ✨
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Novo: Sakura Wave Set</p>
                  <p className="text-[11px] text-[#8E8E93] mt-0.5 leading-relaxed">
                    O sushiman preparou uma edição limitada com Atum Bluefin fresco e vieiras seladas de Hokkaido.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
