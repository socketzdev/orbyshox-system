import React, { useState } from 'react';
import {
  User,
  ShoppingBag,
  MapPin,
  CreditCard,
  Phone,
  HelpCircle,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseProfileView: React.FC = () => {
  const { orderHistory, setActiveTab, setActiveOrder, addToCart, setIsCartOpen } =
    useJapaneseCart();
  const [selectedSubview, setSelectedSubview] = useState<'main' | 'orders' | 'addresses'>('main');

  const handleRepeatOrder = (order: (typeof orderHistory)[0]) => {
    order.items.forEach(it => {
      addToCart(it.product, it.quantity, {
        sauces: it.sauces,
        cutlery: it.cutlery,
        extras: it.extras,
        notes: it.notes,
      });
    });
    setIsCartOpen(true);
  };

  if (selectedSubview === 'orders') {
    return (
      <div className="px-5 py-3 pb-24 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#262626]">
          <button
            type="button"
            onClick={() => setSelectedSubview('main')}
            className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-black text-[#F5F5F0]">Histórico de Pedidos</h2>
        </div>

        {orderHistory.length === 0 ? (
          <p className="text-xs text-[#8E8E93] text-center py-12">Nenhum pedido realizado ainda.</p>
        ) : (
          <div className="space-y-3">
            {orderHistory.map(ord => (
              <div
                key={ord.id}
                className="p-4 rounded-2xl bg-[#161616] border border-[#262626] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#FA5D46]">
                      {ord.orderNumber}
                    </span>
                    <p className="text-[11px] text-[#8E8E93]">{ord.createdAt}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                    {ord.status === 'delivered' ? 'Concluído' : 'Em Andamento'}
                  </span>
                </div>

                <div className="text-xs text-zinc-300 space-y-1 py-1 border-y border-[#222222]">
                  {ord.items.map(it => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.quantity}x {it.product.name}</span>
                      <span className="text-zinc-400">R$ {(it.totalPriceCents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-[#8E8E93]">Total Pago</span>
                    <p className="text-xs font-bold text-white">
                      R$ {(ord.totalCents / 100).toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveOrder(ord)}
                      className="px-3 h-8 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-[11px] font-bold text-white transition"
                    >
                      Acompanhar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRepeatOrder(ord)}
                      className="px-3 h-8 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-[11px] font-bold text-white transition flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Repetir</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-3 pb-24 space-y-6">
      {/* User Card */}
      <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-[#161616] border border-[#262626] relative text-center">
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-[#FA5D46] to-amber-500 p-[2px] shadow-xl">
          <div className="w-full h-full rounded-full bg-[#1C1C1E] flex items-center justify-center overflow-hidden">
            <img
              src="/templates/japanese/assets/mascot.jpg"
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <h3 className="text-base font-black text-[#F5F5F0] mt-3">Mariana Takahashi</h3>
        <p className="text-xs text-[#8E8E93]">+55 (11) 98214-5589</p>
        <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FA5D46]/10 text-[#FA5D46] text-[10px] font-bold">
          ⭐ Cliente Minami Gold
        </span>
      </div>

      {/* Menu Options */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setSelectedSubview('orders')}
          className="w-full p-4 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between hover:border-[#FA5D46]/40 transition group text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-[#FA5D46]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F5F5F0]">Meus Pedidos</p>
              <p className="text-[10px] text-[#8E8E93]">{orderHistory.length} pedidos realizados</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#8E8E93] group-hover:translate-x-0.5 transition" />
        </button>

        <button
          type="button"
          className="w-full p-4 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between hover:border-[#FA5D46]/40 transition group text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F5F5F0]">Endereços Salvos</p>
              <p className="text-[10px] text-[#8E8E93]">Casa (Oscar Freire, 1420)</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#8E8E93] group-hover:translate-x-0.5 transition" />
        </button>

        <button
          type="button"
          className="w-full p-4 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between hover:border-[#FA5D46]/40 transition group text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F5F5F0]">Formas de Pagamento</p>
              <p className="text-[10px] text-[#8E8E93]">Pix e Cartão cadastrados</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#8E8E93] group-hover:translate-x-0.5 transition" />
        </button>

        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noreferrer"
          className="w-full p-4 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between hover:border-[#FA5D46]/40 transition group text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-green-400">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F5F5F0]">Falar com o Restaurante</p>
              <p className="text-[10px] text-[#8E8E93]">Dúvidas e suporte via WhatsApp</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#8E8E93] group-hover:translate-x-0.5 transition" />
        </a>
      </div>
    </div>
  );
};
