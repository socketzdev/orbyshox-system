import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles,
  UtensilsCrossed,
  QrCode,
  Tablet,
  BellRing,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Store,
  Phone,
  Layers,
  ChevronRight,
  HelpCircle,
  Hash,
  Info,
} from 'lucide-react';

interface OnboardingSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const OnboardingSetupWizard: React.FC<OnboardingSetupWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { tenant, refreshSession } = useTenant();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [tradeName, setTradeName] = useState<string>(
    tenant?.tradeName || tenant?.companyName || 'Meu Restaurante',
  );
  const [phone, setPhone] = useState<string>('');
  const [category, setCategory] = useState<string>('BURGER_HOUSE');
  const [tableCount, setTableCount] = useState<number>(10);

  // Feature Toggles
  const [enableQrCode, setEnableQrCode] = useState<boolean>(true);
  const [enableTablet, setEnableTablet] = useState<boolean>(true);
  const [enableWaiterCall, setEnableWaiterCall] = useState<boolean>(true);

  // Mutation to save setup and generate tables
  const completeSetupMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tradeName: tradeName.trim(),
        phone: phone.trim() || undefined,
        category,
        tableCount: Number(tableCount) || 0,
        tableCapacity: 4,
        enableQrCode,
        enableTablet,
        enableWaiterCall,
      };

      try {
        // Tenta endpoint universal primeiro
        return await apiPost('/tenant-app/auth/setup/complete', payload);
      } catch {
        // Fallback para rota com slug
        const slug = tenant?.slug || 'app';
        return await apiPost(`/tenant-app/${slug}/setup/complete`, payload);
      }
    },
    onSuccess: async () => {
      toast.success('Empresa configurada com sucesso!', {
        description: `Seu salão foi inicializado com ${tableCount} mesas prontas para operar!`,
        icon: <Sparkles className="w-5 h-5 text-amber-500" />,
      });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      await refreshSession();
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast.error('Não foi possível salvar as configurações', {
        description: err?.response?.data?.message || err?.message || 'Tente novamente.',
      });
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-300 select-none touch-manipulation">
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Gradient Header Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600" />

        {/* Modal Header */}
        <div className="p-5 sm:p-7 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase bg-amber-100/80 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Primeiro Acesso • Bem-vindo
            </span>
            <span className="text-xs font-mono font-bold text-zinc-400 dark:text-zinc-500">
              Etapa {step} de 4
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white tracking-tight font-sans">
            Vamos te ajudar a configurar a sua empresa
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
            Personalize seu salão e os canais de atendimento em menos de 2 minutos para começar a operar.
          </p>

          {/* Stepper Progress Indicator */}
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'bg-zinc-950 dark:bg-white shadow-xs'
                    : s < step
                    ? 'bg-amber-500'
                    : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Modal Body / Steps */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1 text-zinc-900 dark:text-zinc-100">
          {/* ────────────────────────────────────────────────────────── */}
          {/* PASSO 1: Identidade da Empresa                             */}
          {/* ────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Identidade do Estabelecimento
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Como o seu negócio será apresentado para os clientes e na comanda.
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Nome Comercial / Nome Fantasia *
                  </label>
                  <Input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ex: Steakhouse Prime & Bar"
                    className="h-11 rounded-2xl text-xs font-medium bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    WhatsApp Comercial / Atendimento
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                    <Input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ex: (11) 99999-8888"
                      className="h-11 pl-10 rounded-2xl text-xs font-medium bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700"
                    />
                  </div>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 block">
                    Usado para notificações automáticas e suporte ao cliente.
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Especialidade Gastronômica
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { key: 'BURGER_HOUSE', label: 'Hamburgueria', emoji: '🍔' },
                      { key: 'PIZZERIA', label: 'Pizzaria', emoji: '🍕' },
                      { key: 'RESTAURANT', label: 'Restaurante', emoji: '🍽️' },
                      { key: 'JAPANESE', label: 'Japonês & Sushi', emoji: '🍣' },
                      { key: 'PASTRY', label: 'Pastelaria & Caldo', emoji: '🥟' },
                      { key: 'BAR', label: 'Bar & Petiscaria', emoji: '🍺' },
                      { key: 'COFFEE_SHOP', label: 'Café & Doceria', emoji: '☕' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setCategory(item.key)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          category === item.key
                            ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white shadow-sm'
                            : 'bg-zinc-50/70 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                        }`}
                      >
                        <span className="text-xl mb-1">{item.emoji}</span>
                        <span className="text-xs font-bold truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────── */}
          {/* PASSO 2: Configuração das Mesas do Salão                   */}
          {/* ────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Configuração do Salão & Mesas
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Quantas mesas o seu estabelecimento possui atualmente para atendimento presencial?
                  </p>
                </div>
              </div>

              {/* Seletor de Quantidade de Mesas */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Selecione a Quantidade de Mesas do seu Salão:
                  </label>
                  <span className="text-xs font-mono font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                    {tableCount} {tableCount === 1 ? 'Mesa' : 'Mesas'}
                  </span>
                </div>

                {/* Chips rápidos */}
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {[4, 6, 8, 10, 12, 16, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTableCount(num)}
                      className={`py-2 text-xs font-bold rounded-2xl border transition-all cursor-pointer ${
                        tableCount === num
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white shadow-xs'
                          : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                {/* Campo para digitação livre */}
                <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium flex-1">
                    Ou digite uma quantidade personalizada:
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={tableCount}
                      onChange={(e) => setTableCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-20 h-9 text-center font-mono font-black text-xs rounded-xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
                    />
                    <span className="text-xs text-zinc-400 font-medium">mesas</span>
                  </div>
                </div>

                {/* Dica de Flexibilidade */}
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 text-[11px] text-amber-900 dark:text-amber-200 border border-amber-200/70 dark:border-amber-800/50">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Salão Livre e Flexível:</strong> As mesas não possuem limite rígido de cadeiras. Você e sua equipe têm total liberdade para acomodar mais pessoas ou juntar mesas no salão conforme a necessidade.
                  </span>
                </div>

                {/* Visualização Prévia do Salão */}
                <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-zinc-400" />
                      Prévia das Mesas que serão geradas:
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      Total: {tableCount} mesas
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-100/70 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Array.from({ length: Math.min(tableCount, 16) }).map((_, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs flex flex-col justify-between text-[11px]"
                      >
                        <div className="flex items-center justify-between font-bold text-zinc-900 dark:text-white">
                          <span>Mesa {String(idx + 1).padStart(2, '0')}</span>
                          <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Comanda Digital</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                      </div>
                    ))}
                    {tableCount > 16 && (
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-dashed border-amber-300 dark:border-amber-700/60 flex items-center justify-center text-center text-[10px] font-bold text-amber-800 dark:text-amber-300 col-span-2 sm:col-span-4">
                        + {tableCount - 16} mesas adicionais serão criadas automaticamente
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────── */}
          {/* PASSO 3: Experiência do Cliente & Autoatendimento          */}
          {/* ────────────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Tablet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Canais de Pedido & Autoatendimento
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Escolha como os clientes vão pedir e interagir com seu restaurante.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {/* Opção 1: QR Code */}
                <div
                  onClick={() => setEnableQrCode(!enableQrCode)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    enableQrCode
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 opacity-60'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    enableQrCode ? 'bg-emerald-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'
                  }`}>
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                        Cardápio Digital por QR Code
                      </h4>
                      <input
                        type="checkbox"
                        checked={enableQrCode}
                        onChange={() => {}}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      Clientes apontam a câmera do celular para a mesa e fazem pedidos sem precisar instalar aplicativo.
                    </p>
                  </div>
                </div>

                {/* Opção 2: Tablet Fixo */}
                <div
                  onClick={() => setEnableTablet(!enableTablet)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    enableTablet
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-800'
                      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 opacity-60'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    enableTablet ? 'bg-indigo-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'
                  }`}>
                    <Tablet className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                        Autoatendimento via Tablet Fixo na Mesa
                      </h4>
                      <input
                        type="checkbox"
                        checked={enableTablet}
                        onChange={() => {}}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      Interface imersiva para tablet com personalização de pratos (ponto da carne, molhos e adicionais).
                    </p>
                  </div>
                </div>

                {/* Opção 3: Chamado de Garçom */}
                <div
                  onClick={() => setEnableWaiterCall(!enableWaiterCall)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    enableWaiterCall
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 opacity-60'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    enableWaiterCall ? 'bg-rose-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'
                  }`}>
                    <BellRing className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                        Chamado de Garçom & Pedido de Conta
                      </h4>
                      <input
                        type="checkbox"
                        checked={enableWaiterCall}
                        onChange={() => {}}
                        className="w-4 h-4 accent-rose-600 rounded"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      Alerta visual e sonoro em tempo real para a equipe de garçons e gerência quando o cliente solicitar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────── */}
          {/* PASSO 4: Resumo & Conclusão                                */}
          {/* ────────────────────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Tudo Pronto para Começar!
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Revise as configurações antes de inicializar o seu sistema.
                  </p>
                </div>
              </div>

              {/* Cartão VIP de Resumo Executivo */}
              <div className="p-5 rounded-3xl bg-zinc-950 text-white dark:bg-zinc-800 border border-zinc-800 shadow-xl space-y-4">
                <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-wider uppercase text-zinc-400 block">
                      Estabelecimento
                    </span>
                    <h4 className="text-base font-black text-white">{tradeName}</h4>
                  </div>
                  <Badge className="bg-amber-500 text-zinc-950 font-black text-[10px] px-2.5 py-0.5">
                    {category}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Salão Configurado</span>
                    <strong className="text-amber-400 font-black text-sm">
                      {tableCount} {tableCount === 1 ? 'Mesa' : 'Mesas'}
                    </strong>
                    <span className="text-[9px] text-zinc-400 block">
                      Mesas ativas no salão
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Comandas & QR Codes</span>
                    <strong className="text-white font-bold text-[11px] truncate block">
                      Gerados automaticamente
                    </strong>
                    <span className="text-[9px] text-zinc-400 block">
                      1 QR Code criptografado por mesa
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Autoatendimento</span>
                    <strong className="text-emerald-400 font-bold">
                      {enableQrCode ? 'QR Code Ativo' : 'Desativado'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Tablet & Chamadas</span>
                    <strong className="text-indigo-400 font-bold">
                      {enableTablet ? 'Tablet Pareado' : enableWaiterCall ? 'Chamado Garçom' : 'Padrão'}
                    </strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Todos os QR Codes criptografados e comandas serão criados instantaneamente.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Navigation Buttons */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="h-11 px-4 text-xs font-bold rounded-2xl border-zinc-200 dark:border-zinc-700"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Voltar
            </Button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-2 py-1"
            >
              Configurar depois
            </button>
          )}

          {step < 4 ? (
            <Button
              type="button"
              onClick={() => {
                if (step === 1 && !tradeName.trim()) {
                  toast.error('Informe o nome comercial da empresa');
                  return;
                }
                setStep((s) => (s + 1) as any);
              }}
              className="h-11 px-6 text-xs font-black text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-2xl shadow-md transition-all cursor-pointer"
            >
              Próximo Passo
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={completeSetupMutation.isPending}
              onClick={() => completeSetupMutation.mutate()}
              className="h-11 px-6 text-xs font-black text-white bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:opacity-95 rounded-2xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
            >
              {completeSetupMutation.isPending ? (
                <span>Inicializando salão...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Concluir Configuração e Entrar no Painel 🚀</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
