import React, { useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  Clock,
  QrCode,
  CreditCard,
  Banknote,
  Check,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useJapaneseCart } from '../context/japanese-cart-context';

export const JapaneseCheckoutModal: React.FC = () => {
  const {
    isCheckoutOpen,
    setIsCheckoutOpen,
    deliveryAddress,
    needCutlery,
    setNeedCutlery,
    scheduleType,
    setScheduleType,
    scheduledTime,
    setScheduledTime,
    paymentMethod,
    setPaymentMethod,
    totalCents,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    placeOrder,
  } = useJapaneseCart();

  const [deliveryNote, setDeliveryNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCheckoutOpen) return null;

  const handleSubmitOrder = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      placeOrder();
      setIsSubmitting(false);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] bg-[#0D0D0D] border border-[#262626] rounded-t-3xl sm:rounded-3xl flex flex-col text-white shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsCheckoutOpen(false)}
            className="flex items-center gap-1.5 text-xs text-[#8E8E93] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <h3 className="text-base font-bold text-[#F5F5F0]">Finalizar Pedido</h3>
          <div className="w-8" />
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-5">
          {/* Delivery Address */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E93]">
                Endereço de Entrega
              </span>
              <span className="text-[11px] text-[#FA5D46] font-semibold cursor-pointer">
                Alterar
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#161616] border border-[#262626] flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FA5D46]/10 flex items-center justify-center text-[#FA5D46] shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#F5F5F0]">
                  {deliveryAddress.label} • {deliveryAddress.street}, {deliveryAddress.number}
                </p>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  {deliveryAddress.complement ? `${deliveryAddress.complement} · ` : ''}
                  {deliveryAddress.neighborhood}, {deliveryAddress.city}
                </p>
              </div>
            </div>
          </div>

          {/* Cutlery Toggle */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] block mb-2">
              Precisa de Hashis / Talheres?
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNeedCutlery(true)}
                className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                  needCutlery
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    needCutlery ? 'border-[#FA5D46]' : 'border-zinc-600'
                  }`}
                >
                  {needCutlery && <div className="w-1.5 h-1.5 rounded-full bg-[#FA5D46]" />}
                </div>
                <span>Sim, por favor 🥢</span>
              </button>

              <button
                type="button"
                onClick={() => setNeedCutlery(false)}
                className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                  !needCutlery
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    !needCutlery ? 'border-[#FA5D46]' : 'border-zinc-600'
                  }`}
                >
                  {!needCutlery && <div className="w-1.5 h-1.5 rounded-full bg-[#FA5D46]" />}
                </div>
                <span>Não preciso 🌱</span>
              </button>
            </div>
          </div>

          {/* Delivery Time */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] block mb-2">
              Horário de Entrega
            </span>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setScheduleType('asap')}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition ${
                  scheduleType === 'asap'
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      scheduleType === 'asap' ? 'border-[#FA5D46]' : 'border-zinc-600'
                    }`}
                  >
                    {scheduleType === 'asap' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FA5D46]" />
                    )}
                  </div>
                  <span>O mais rápido possível (30 - 45 min)</span>
                </div>
                <Clock className="w-4 h-4 text-zinc-500" />
              </button>

              <div
                className={`p-3.5 rounded-xl border transition ${
                  scheduleType === 'scheduled'
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setScheduleType('scheduled')}
                  className="w-full flex items-center justify-between text-xs font-medium"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        scheduleType === 'scheduled' ? 'border-[#FA5D46]' : 'border-zinc-600'
                      }`}
                    >
                      {scheduleType === 'scheduled' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#FA5D46]" />
                      )}
                    </div>
                    <span>Agendar para mais tarde</span>
                  </div>

                  {scheduleType === 'scheduled' && (
                    <select
                      value={scheduledTime}
                      onChange={e => setScheduledTime(e.target.value)}
                      className="bg-[#2C2C2E] text-white text-xs px-2 py-1 rounded-lg border border-white/10"
                    >
                      <option value="19:30">Hoje às 19:30</option>
                      <option value="20:00">Hoje às 20:00</option>
                      <option value="20:30">Hoje às 20:30</option>
                      <option value="21:00">Hoje às 21:00</option>
                      <option value="21:30">Hoje às 21:30</option>
                    </select>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] block mb-2">
              Forma de Pagamento
            </span>
            <div className="space-y-2">
              {/* Pix */}
              <button
                type="button"
                onClick={() => setPaymentMethod('pix')}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between transition ${
                  paymentMethod === 'pix'
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">PIX Instantâneo</p>
                    <p className="text-[10px] text-[#8E8E93]">Aprovação imediata do pedido</p>
                  </div>
                </div>

                <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10">
                  Mais Rápido
                </span>
              </button>

              {/* Credit Card */}
              <button
                type="button"
                onClick={() => setPaymentMethod('credit_card')}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between transition ${
                  paymentMethod === 'credit_card'
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">Cartão de Crédito / Débito</p>
                    <p className="text-[10px] text-[#8E8E93]">Visa, Mastercard, Elo</p>
                  </div>
                </div>

                <span className="text-[10px] text-[#8E8E93]">1 salvo</span>
              </button>

              {/* Cash on Delivery */}
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between transition ${
                  paymentMethod === 'cash'
                    ? 'bg-[#1C1C1E] border-[#FA5D46] text-white'
                    : 'bg-[#141414] border-[#222222] text-[#8E8E93]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">Pagar na Entrega</p>
                    <p className="text-[10px] text-[#8E8E93]">Dinheiro ou maquininha portátil</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Delivery Note */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] block mb-2">
              Observações para a Entrega
            </span>
            <textarea
              value={deliveryNote}
              onChange={e => setDeliveryNote(e.target.value)}
              placeholder="Ex: Interfone quebrado, deixar na portaria do bloco B..."
              className="w-full h-20 p-3 rounded-xl bg-[#161616] border border-[#262626] text-xs text-white placeholder-[#8E8E93] focus:outline-none focus:border-[#FA5D46]"
            />
          </div>

          {/* Security badge */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#8E8E93] pt-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Pagamento seguro e criptografado de ponta a ponta</span>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="p-4 bg-[#141414] border-t border-[#262626] flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#8E8E93]">Total do Pedido</p>
            <p className="text-lg font-black text-[#FA5D46]">
              R$ {(totalCents / 100).toFixed(2).replace('.', ',')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={isSubmitting}
            className="flex-1 max-w-[220px] h-12 rounded-full bg-[#FA5D46] hover:bg-[#CF4B3A] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FA5D46]/25 active:scale-98 transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Confirmar Pedido</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
