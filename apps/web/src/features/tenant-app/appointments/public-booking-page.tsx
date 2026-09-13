import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Scissors,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Phone,
  MapPin,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Store,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ServiceItem {
  id: string;
  name: string;
  durationMin: number;
  priceFormatted: string;
  priceCents: number;
  description: string;
}

interface BarberItem {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

const DEFAULT_SERVICES: ServiceItem[] = [
  {
    id: 's1',
    name: 'Corte Tradicional / Fade Degradê',
    durationMin: 40,
    priceFormatted: 'R$ 45,00',
    priceCents: 4500,
    description: 'Corte moderno com finalização em pomada matte e alinhamento do pezinho.',
  },
  {
    id: 's2',
    name: 'Barboterapia Completa',
    durationMin: 35,
    priceFormatted: 'R$ 35,00',
    priceCents: 3500,
    description: 'Toalha quente aromatizada, massagem facial e navalha afiada.',
  },
  {
    id: 's3',
    name: 'Combo Master (Cabelo + Barba)',
    durationMin: 60,
    priceFormatted: 'R$ 70,00',
    priceCents: 7000,
    description: 'Experiência completa: corte refinado e barba alinhada com toalha quente.',
  },
  {
    id: 's4',
    name: 'Sobrancelha na Navalha',
    durationMin: 15,
    priceFormatted: 'R$ 20,00',
    priceCents: 2000,
    description: 'Alinhamento e limpeza precisa do contorno das sobrancelhas.',
  },
  {
    id: 's5',
    name: 'Platinado / Nevou Global',
    durationMin: 120,
    priceFormatted: 'R$ 130,00',
    priceCents: 13000,
    description: 'Descoloração global com tonalização cinza chumbo ou branco neve.',
  },
];

const DEFAULT_BARBERS: BarberItem[] = [
  {
    id: 'any',
    name: 'Qualquer Barbeiro Disponível',
    role: 'Menor tempo de espera · Recomendado',
    avatar: '',
  },
  {
    id: 'b1',
    name: 'Carlos Navalha',
    role: 'Master Barber · 8 anos de exp.',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'b2',
    name: 'Lucas Fade',
    role: 'Especialista em Degradê & FreeStyle',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'b3',
    name: 'André Barboterapia',
    role: 'Especialista em Barba & Visagismo',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&auto=format&fit=crop&q=80',
  },
];

const TIME_SLOTS = [
  '09:00', '09:45', '10:30', '11:15', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45'
];

export const PublicBookingPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();

  // Busca dados da empresa do storage ou fallback
  const tenantData = useMemo(() => {
    try {
      const stored = localStorage.getItem('orbyshox_local_tenants');
      if (stored) {
        const list = JSON.parse(stored);
        const match = list.find((t: any) => t.slug === slug || (t.tradeName || t.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug);
        if (match) return match;
      }
    } catch {
      // ignore
    }
    return {
      companyName: slug.replace(/-/g, ' ').toUpperCase(),
      tradeName: slug.replace(/-/g, ' '),
      phone: '(11) 98765-4321',
      address: 'Rua Central, 120 · Centro',
      primaryColor: '#18181b',
      logo: '',
    };
  }, [slug]);

  // Estados do Agendamento
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedService, setSelectedService] = useState<ServiceItem>(DEFAULT_SERVICES[0]);
  const [selectedBarber, setSelectedBarber] = useState<BarberItem>(DEFAULT_BARBERS[0]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedTime, setSelectedTime] = useState<string>('14:15');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<any>(null);

  // Lista de próximos 7 dias
  const availableDays = useMemo(() => {
    const days = [];
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        iso: d.toISOString().split('T')[0],
        dayOfWeek: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : weekDays[d.getDay()],
        dayNumber: d.getDate(),
      });
    }
    return days;
  }, []);

  const handleFinishBooking = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!clientName.trim()) {
      toast.error('Por favor, informe seu nome completo');
      return;
    }
    if (!clientPhone.trim()) {
      toast.error('Por favor, informe seu WhatsApp');
      return;
    }

    setIsSubmitting(true);
    const appointmentRecord = {
      id: 'apt-' + Date.now(),
      serviceName: selectedService.name,
      customerName: clientName.trim(),
      customerPhone: clientPhone.trim(),
      barberName: selectedBarber.id === 'any' ? 'Barbeiro da Casa' : selectedBarber.name,
      priceCents: selectedService.priceCents,
      scheduledDate: selectedDate,
      scheduledTime: selectedTime,
      status: 'CONFIRMADO',
      notes,
      createdAt: new Date().toISOString(),
    };

    try {
      await apiPost(`/tenant-app/${slug}/appointments`, appointmentRecord);
    } catch {
      // fallback offline
    }

    try {
      const storageKey = `orbyshox_tenant_appointments_${slug}`;
      const existing = localStorage.getItem(storageKey);
      const list = existing ? JSON.parse(existing) : [];
      localStorage.setItem(storageKey, JSON.stringify([appointmentRecord, ...list]));
    } catch {
      // ignore
    }

    setBookingResult(appointmentRecord);
    setStep(5);
    setIsSubmitting(false);
    toast.success('Agendamento confirmado com sucesso!');
  };

  const tradeTitle = tenantData.tradeName || tenantData.companyName || 'Barbearia';

  return (
    <div className="min-h-screen bg-[#fafbfc] text-zinc-900 font-sans flex flex-col items-center justify-start p-3 sm:p-6 pb-28 sm:pb-12 selection:bg-zinc-900 selection:text-white">
      {/* ─── Top Header da Barbearia (Clean & Mobile-Friendly) ─── */}
      <header className="w-full max-w-lg mx-auto mb-4 sm:mb-6">
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-sm shadow-sm shrink-0 overflow-hidden"
              style={{ backgroundColor: tenantData.primaryColor || '#18181b' }}
            >
              {tenantData.logo ? (
                <img src={tenantData.logo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Scissors className="w-5 h-5 text-amber-400" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-black text-zinc-900 truncate">
                  {tradeTitle}
                </h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Aberto
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                <span>{tenantData.address || 'Atendimento com horário marcado'}</span>
              </p>
            </div>
          </div>

          <a
            href={`https://wa.me/55${(tenantData.phone || '').replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center shrink-0 transition"
            title="Falar no WhatsApp"
          >
            <Phone className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* ─── Card Principal do Agendamento ─── */}
      <main className="w-full max-w-lg mx-auto bg-white rounded-3xl sm:rounded-[32px] border border-zinc-200/80 shadow-xl overflow-hidden flex flex-col">
        {step < 5 && (
          <div className="p-4 sm:p-5 border-b border-zinc-100 bg-[#fdfdfd]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                {step === 1 && 'Passo 1: Selecione o Corte'}
                {step === 2 && 'Passo 2: Escolha o Barbeiro'}
                {step === 3 && 'Passo 3: Data & Horário'}
                {step === 4 && 'Passo 4: Seus Dados'}
              </span>
              <span className="text-[11px] font-extrabold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-lg font-mono">
                {step}/4
              </span>
            </div>

            {/* Barra de Progresso Suave */}
            <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-zinc-900 rounded-full transition-all duration-300"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6 flex-1">
          {/* ─── PASSO 1: Selecionar Serviço ─── */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div>
                <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
                  Escolha o Serviço Desejado
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                  Selecione o corte ou procedimento que deseja realizar
                </p>
              </div>

              <div className="space-y-2.5">
                {DEFAULT_SERVICES.map((srv) => {
                  const isSelected = selectedService.id === srv.id;
                  return (
                    <div
                      key={srv.id}
                      onClick={() => setSelectedService(srv)}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'border-zinc-950 bg-zinc-50/90 shadow-2xs ring-2 ring-zinc-950/10'
                          : 'border-zinc-200/90 bg-white hover:border-zinc-300'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm text-zinc-900 block">
                          {srv.name}
                        </span>
                        <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">
                          {srv.description}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5 text-[10px] text-zinc-400 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-400" />
                            {srv.durationMin} min
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end justify-between h-full">
                        <span className="text-xs sm:text-sm font-black text-zinc-900 font-mono block">
                          {srv.priceFormatted}
                        </span>
                        <div
                          className={`w-5 h-5 rounded-full mt-2 flex items-center justify-center border transition-all ${
                            isSelected
                              ? 'bg-zinc-900 border-zinc-900 text-white'
                              : 'border-zinc-300 bg-white'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── PASSO 2: Selecionar Barbeiro ─── */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div>
                <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
                  Com qual Barbeiro você prefere?
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                  Selecione seu profissional ou o primeiro disponível para menor espera
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {DEFAULT_BARBERS.map((barber) => {
                  const isSelected = selectedBarber.id === barber.id;
                  return (
                    <div
                      key={barber.id}
                      onClick={() => setSelectedBarber(barber)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center gap-3.5 ${
                        isSelected
                          ? 'border-zinc-950 bg-zinc-50/90 shadow-2xs ring-2 ring-zinc-950/10'
                          : 'border-zinc-200/90 bg-white hover:border-zinc-300'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {barber.avatar ? (
                          <img src={barber.avatar} alt={barber.name} className="w-full h-full object-cover" />
                        ) : (
                          <Scissors className="w-5 h-5 text-emerald-600" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                          {barber.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {barber.role}
                        </p>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                          isSelected ? 'bg-zinc-900 border-zinc-900 text-white' : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── PASSO 3: Data e Horário ─── */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div>
                <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
                  Selecione o Dia e Horário
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                  Escolha o momento ideal para o corte
                </p>
              </div>

              {/* Seletor de Dias Horizontal */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-800 block">Escolha o Dia</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {availableDays.map((d) => {
                    const isSelected = selectedDate === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setSelectedDate(d.iso)}
                        className={`p-2.5 rounded-2xl text-center border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-950 text-white border-zinc-950 shadow-2xs ring-2 ring-zinc-950/20'
                            : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        <span className="block text-[10px] uppercase font-bold tracking-wider opacity-75">
                          {d.dayOfWeek}
                        </span>
                        <span className="block text-sm font-black font-mono mt-0.5">
                          {d.dayNumber}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Seletor de Horários em Grade */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-zinc-800 block">Horários Livres</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {TIME_SLOTS.map((t) => {
                    const isSelected = selectedTime === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTime(t)}
                        className={`h-11 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-950 text-white border-zinc-950 shadow-2xs ring-2 ring-zinc-950/20'
                            : 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── PASSO 4: Seus Dados (Sem login) ─── */}
          {step === 4 && (
            <form onSubmit={handleFinishBooking} className="space-y-4 animate-in fade-in-50 duration-150">
              <div>
                <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
                  Quase lá! Seus dados de contato
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                  Sem burocracia ou senha: apenas seu nome e WhatsApp para lembrete
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-800 block">
                    Seu Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Silva"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-zinc-800 focus:ring-2 focus:ring-zinc-900/10 transition shadow-2xs"
                    autoFocus
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-800 block">
                    Seu WhatsApp com DDD *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="(11) 99999-8888"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-xs font-mono font-medium text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-zinc-800 focus:ring-2 focus:ring-zinc-900/10 transition shadow-2xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-800 block">
                    Observação para o barbeiro (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Degradê na zero, toalha bem quente..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-zinc-800 transition shadow-2xs"
                  />
                </div>
              </div>

              {/* Resumo do Agendamento */}
              <div className="p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Serviço:</span>
                  <span className="font-bold text-zinc-900">{selectedService.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Barbeiro:</span>
                  <span className="font-bold text-zinc-900">{selectedBarber.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Data & Horário:</span>
                  <span className="font-bold text-zinc-900 font-mono">
                    {selectedDate} às {selectedTime}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-200/60">
                  <span className="text-zinc-800 font-bold">Total a pagar no local:</span>
                  <span className="font-black text-zinc-950 font-mono text-sm">
                    {selectedService.priceFormatted}
                  </span>
                </div>
              </div>
            </form>
          )}

          {/* ─── PASSO 5: Agendamento Confirmado! ─── */}
          {step === 5 && bookingResult && (
            <div className="text-center space-y-5 py-2 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-black text-zinc-900 tracking-tight">
                  Horário Marcado com Sucesso!
                </h2>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Tudo pronto, <strong>{bookingResult.customerName}</strong>! Sua cadeira já está reservada.
                </p>
              </div>

              {/* Comprovante Limpo */}
              <div className="bg-zinc-50/80 p-4 sm:p-5 rounded-2xl border border-zinc-200 text-left text-xs space-y-2 max-w-md mx-auto">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Barbearia:</span>
                  <span className="font-bold text-zinc-900">{tradeTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Serviço:</span>
                  <span className="font-bold text-zinc-900">{bookingResult.serviceName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Barbeiro:</span>
                  <span className="font-bold text-zinc-900">{bookingResult.barberName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Horário:</span>
                  <span className="font-bold text-zinc-900 font-mono">
                    {bookingResult.scheduledDate} às {bookingResult.scheduledTime}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-200">
                  <span className="text-zinc-700 font-bold">Valor no Local:</span>
                  <span className="font-mono font-black text-emerald-800 text-sm">
                    {selectedService.priceFormatted}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 pt-2 max-w-md mx-auto">
                <a
                  href={`https://wa.me/55${(tenantData.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Olá! Acabei de agendar meu horário pelo site:\n✂️ ${bookingResult.serviceName}\n📅 ${bookingResult.scheduledDate} às ${bookingResult.scheduledTime}\n👤 ${bookingResult.customerName}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-11 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-2xs active:scale-[0.98]"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Avisar a Barbearia no WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setBookingResult(null);
                  }}
                  className="w-full h-10 rounded-xl bg-white hover:bg-zinc-50 text-zinc-600 border border-zinc-200 text-xs font-bold transition shadow-2xs"
                >
                  Marcar Outro Horário
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── BARRA INFERIOR DE NAVEGAÇÃO FIXA NO MOBILE / FLUIDA NO DESKTOP ─── */}
        {step < 5 && (
          <div className="fixed sm:static bottom-0 left-0 right-0 p-3 sm:p-4 bg-white/95 sm:bg-zinc-50/60 backdrop-blur-md sm:backdrop-blur-none border-t border-zinc-200/80 z-30 flex items-center justify-between gap-3 shadow-lg sm:shadow-none">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="h-11 sm:h-10 px-4 rounded-xl text-xs font-bold bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Voltar
              </Button>
            ) : (
              <div className="text-[11px] text-zinc-400 font-medium px-2 hidden sm:block">
                Etapa 1 de 4
              </div>
            )}

            {step < 4 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep((s) => (s + 1) as any)}
                className="h-11 sm:h-10 flex-1 sm:flex-initial px-6 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer ml-auto"
              >
                <span>Continuar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleFinishBooking()}
                className="h-11 sm:h-10 flex-1 sm:flex-initial px-6 text-xs font-bold text-white bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-500/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer ml-auto"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Confirmando...' : 'Confirmar Agendamento'}</span>
              </Button>
            )}
          </div>
        )}
      </main>

      {/* Footer discreto */}
      <footer className="mt-6 text-center text-[11px] text-zinc-400 font-medium hidden sm:block">
        Powered by Orbyshox SaaS · Plataforma de Gestão Corporativa
      </footer>
    </div>
  );
};
