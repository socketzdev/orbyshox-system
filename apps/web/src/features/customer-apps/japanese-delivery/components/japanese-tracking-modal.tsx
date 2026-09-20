import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  ChefHat,
  Bike,
  PackageCheck,
  Phone,
  MessageCircle,
  MapPin,
  Clock,
  Map,
  ListOrdered,
  ArrowRight,
} from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseTrackingModal: React.FC = () => {
  const { activeOrder, setActiveOrder } = useJapaneseCart();
  const [viewMode, setViewMode] = useState<'timeline' | 'map'>('timeline');
  const [currentStep, setCurrentStep] = useState<number>(1); // 0: received, 1: preparing, 2: on_way, 3: delivered

  // Simulate progress
  useEffect(() => {
    if (!activeOrder) return;
    const timer = setInterval(() => {
      setCurrentStep(step => (step < 2 ? step + 1 : step));
    }, 12000);
    return () => clearInterval(timer);
  }, [activeOrder]);

  if (!activeOrder) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="w-full max-w-lg max-h-[94vh] sm:max-h-[88vh] bg-[#0D0D0D] border border-[#262626] rounded-t-3xl sm:rounded-3xl flex flex-col text-white shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#FA5D46]">
                {activeOrder.orderNumber}
              </span>
              <span className="text-zinc-600">•</span>
              <span className="text-xs text-[#8E8E93]">{activeOrder.createdAt}</span>
            </div>
            <h3 className="text-base font-black text-[#F5F5F0]">Rastreio do Pedido</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle View Mode */}
            <div className="flex items-center rounded-full bg-[#1C1C1E] p-1 border border-white/5">
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`p-1.5 rounded-full text-xs transition ${
                  viewMode === 'timeline'
                    ? 'bg-[#FA5D46] text-white shadow-sm'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
                title="Linha do Tempo"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`p-1.5 rounded-full text-xs transition ${
                  viewMode === 'map'
                    ? 'bg-[#FA5D46] text-white shadow-sm'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
                title="Mapa ao Vivo"
              >
                <Map className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setActiveOrder(null)}
              className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {viewMode === 'timeline' ? (
            <div className="p-6 space-y-6">
              {/* Cute 3D Sushi Mascot Banner */}
              <div className="p-5 rounded-3xl bg-gradient-to-b from-[#18181B] to-[#121214] border border-white/5 flex items-center gap-4">
                <div className="w-20 h-20 shrink-0 relative flex items-center justify-center">
                  <img
                    src="/templates/japanese/assets/mascot.jpg"
                    alt="Mascote Minami"
                    className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(250,93,70,0.3)] animate-bounce"
                    style={{ animationDuration: '3s' }}
                  />
                </div>
                <div>
                  <h4 className="text-base font-black text-[#F5F5F0]">
                    Pedido <span className="text-[#FA5D46]">Confirmado!</span>
                  </h4>
                  <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
                    Sua seleção está sendo preparada com maestria pelos nossos chefs sushiman.
                  </p>
                </div>
              </div>

              {/* Items Summary */}
              <div className="p-4 rounded-2xl bg-[#161616] border border-[#262626] space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E8E93] mb-1">
                  Resumo dos Itens
                </p>
                {activeOrder.items.map(it => (
                  <div key={it.id} className="flex items-center justify-between text-xs">
                    <span className="text-[#F5F5F0]">
                      <strong className="text-[#FA5D46] mr-1.5">x{it.quantity}</strong>
                      {it.product.name}
                      <span className="text-zinc-500 ml-1.5 font-normal">({it.product.weightGrams}g)</span>
                    </span>
                    <span className="text-zinc-400 font-semibold">
                      R$ {(it.totalPriceCents / 100).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Real-time Status Timeline */}
              <div className="space-y-4 pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#8E8E93]">
                  Status do Pedido
                </p>

                <div className="relative pl-6 space-y-6">
                  {/* Vertical connecting line */}
                  <div className="absolute left-2.5 top-3 bottom-3 w-[2px] bg-[#222222]" />

                  {/* Step 1: Received */}
                  <div className="relative flex items-start gap-3.5">
                    <div
                      className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-white ${
                        currentStep >= 0
                          ? 'bg-[#FA5D46] shadow-md shadow-[#FA5D46]/40'
                          : 'bg-[#222222] text-zinc-600'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${currentStep >= 0 ? 'text-white' : 'text-zinc-500'}`}>
                        Pedido Recebido
                      </p>
                      <p className="text-[11px] text-[#8E8E93]">Confirmado pela cozinha às {activeOrder.createdAt}</p>
                    </div>
                  </div>

                  {/* Step 2: Preparing */}
                  <div className="relative flex items-start gap-3.5">
                    <div
                      className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-white ${
                        currentStep >= 1
                          ? 'bg-[#FA5D46] shadow-md shadow-[#FA5D46]/40'
                          : 'bg-[#222222] text-zinc-600'
                      }`}
                    >
                      <ChefHat className="w-3 h-3" />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${currentStep >= 1 ? 'text-white' : 'text-zinc-500'}`}>
                        Em Preparação na Cozinha
                      </p>
                      <p className="text-[11px] text-[#8E8E93]">
                        Sushiman finalizando os cortes e montagem artesanal
                      </p>
                    </div>
                  </div>

                  {/* Step 3: On the way */}
                  <div className="relative flex items-start gap-3.5">
                    <div
                      className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-white ${
                        currentStep >= 2
                          ? 'bg-[#FA5D46] shadow-md shadow-[#FA5D46]/40'
                          : 'bg-[#222222] text-zinc-600'
                      }`}
                    >
                      <Bike className="w-3 h-3" />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${currentStep >= 2 ? 'text-white' : 'text-zinc-500'}`}>
                        Saiu para Entrega
                      </p>
                      <p className="text-[11px] text-[#8E8E93]">
                        Entregador parceiro a caminho do seu endereço
                      </p>
                    </div>
                  </div>

                  {/* Step 4: Delivered */}
                  <div className="relative flex items-start gap-3.5">
                    <div
                      className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-white ${
                        currentStep >= 3
                          ? 'bg-emerald-500 shadow-md shadow-emerald-500/40'
                          : 'bg-[#222222] text-zinc-600'
                      }`}
                    >
                      <PackageCheck className="w-3 h-3" />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${currentStep >= 3 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        Entregue
                      </p>
                      <p className="text-[11px] text-[#8E8E93]">Bom apetite!</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Live Simulated Map Mode */
            <div className="relative w-full h-[400px] bg-[#111215] overflow-hidden flex flex-col justify-between">
              {/* Dark Styled Map Canvas */}
              <div className="absolute inset-0 opacity-40">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#262830" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  {/* Road paths */}
                  <path d="M 40 80 Q 180 120 220 220 T 360 300" fill="none" stroke="#333842" strokeWidth="12" />
                  <path d="M 40 80 Q 180 120 220 220 T 360 300" fill="none" stroke="#FA5D46" strokeWidth="3" strokeDasharray="6 4" />
                </svg>
              </div>

              {/* Pin 1: Minami Sushi */}
              <div className="absolute top-16 left-10 flex flex-col items-center z-10">
                <div className="w-8 h-8 rounded-full bg-[#1A1A1A] border-2 border-[#FA5D46] flex items-center justify-center text-white shadow-lg">
                  🍣
                </div>
                <span className="mt-1 px-2 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white border border-white/10">
                  Minami Sushi
                </span>
              </div>

              {/* Moving Courier Pin */}
              <div className="absolute top-44 left-44 flex flex-col items-center z-10 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-[#FA5D46] text-white flex items-center justify-center shadow-xl shadow-[#FA5D46]/50">
                  <Bike className="w-5 h-5" />
                </div>
                <span className="mt-1 px-2 py-0.5 rounded bg-[#FA5D46] text-[9px] font-bold text-white shadow">
                  A caminho
                </span>
              </div>

              {/* Destination Pin */}
              <div className="absolute bottom-28 right-12 flex flex-col items-center z-10">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg">
                  <MapPin className="w-4 h-4" />
                </div>
                <span className="mt-1 px-2 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white border border-white/10">
                  Seu Endereço
                </span>
              </div>

              {/* Estimated Arrival Banner */}
              <div className="relative z-20 m-4 p-3 rounded-2xl bg-[#161616]/90 backdrop-blur-md border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#FA5D46]" />
                  <div>
                    <p className="text-[10px] text-[#8E8E93] uppercase tracking-wider">Previsão de Chegada</p>
                    <p className="text-xs font-bold text-white">20:15 - 20:25 (15-20 min)</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
                  No Horário
                </span>
              </div>
            </div>
          )}

          {/* Courier Card (Present on both views) */}
          <div className="p-4 mx-6 mb-6 rounded-2xl bg-[#161616] border border-[#262626] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#1C1C1E] border border-white/10 overflow-hidden flex items-center justify-center text-lg font-black text-[#FA5D46]">
                CS
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-bold text-white">{activeOrder.courier.name}</h5>
                  <span className="text-[10px] font-bold text-amber-400">★ {activeOrder.courier.rating}</span>
                </div>
                <p className="text-[10px] text-[#8E8E93]">
                  {activeOrder.courier.vehicle} • {activeOrder.courier.plate}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`tel:${activeOrder.courier.phone}`}
                className="w-9 h-9 rounded-full bg-[#1C1C1E] border border-white/10 flex items-center justify-center text-[#8E8E93] hover:text-white transition"
                title="Ligar para o entregador"
              >
                <Phone className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => alert(`Iniciando chat com ${activeOrder.courier.name}...`)}
                className="w-9 h-9 rounded-full bg-[#FA5D46] text-white flex items-center justify-center shadow-md shadow-[#FA5D46]/30 hover:bg-[#CF4B3A] transition"
                title="Enviar mensagem"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 bg-[#141414] border-t border-[#262626] flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMode(v => (v === 'timeline' ? 'map' : 'timeline'))}
            className="h-11 px-5 rounded-full bg-[#262626] hover:bg-[#333333] text-xs font-bold text-white transition flex items-center gap-2"
          >
            {viewMode === 'timeline' ? (
              <>
                <Map className="w-4 h-4 text-[#FA5D46]" />
                <span>Acompanhar no Mapa</span>
              </>
            ) : (
              <>
                <ListOrdered className="w-4 h-4 text-[#FA5D46]" />
                <span>Ver Linha do Tempo</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveOrder(null)}
            className="h-11 px-6 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-xs font-bold text-white transition shadow-md shadow-[#FA5D46]/20"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    </div>
  );
};
