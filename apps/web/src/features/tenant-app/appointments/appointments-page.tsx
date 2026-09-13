import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Plus,
  User,
  CheckCircle2,
  Scissors,
  DollarSign,
  Sparkles,
  Phone,
  Copy,
  ExternalLink,
  MessageSquare,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Lock,
  Unlock,
  Zap,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface AppointmentItem {
  id: string;
  customerName: string;
  customerPhone?: string;
  serviceName: string;
  barberName: string;
  scheduledDate: string; // "YYYY-MM-DD" e.g. "2026-09-10"
  scheduledTime: string; // "HH:mm" e.g. "14:40"
  durationMin: number;
  priceCents: number;
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
  notes?: string;
  whatsappReminderSent?: boolean;
  /** ID do funcionário/barbeiro responsável — chave de filtro confiável. */
  barberId?: string;
}

const BARBERS_LIST_FALLBACK: Array<{ id: string; name: string; role: string }> = [
  { id: 'all', name: 'Todos os Barbeiros', role: 'Equipe Completa' },
];

const PRESET_SERVICES = [
  { name: 'Corte Degradê Navalhado', price: '50,00', priceCents: 5000, durationMin: 40 },
  { name: 'Barboterapia Completa', price: '45,00', priceCents: 4500, durationMin: 35 },
  { name: 'Combo Cabelo + Barba', price: '85,00', priceCents: 8500, durationMin: 60 },
  { name: 'Corte Social na Tesoura', price: '40,00', priceCents: 4000, durationMin: 35 },
  { name: 'Combo Cabelo + Barba + Sobrancelha', price: '95,00', priceCents: 9500, durationMin: 70 },
  { name: 'Pezinho & Acabamento', price: '25,00', priceCents: 2500, durationMin: 20 },
];

// Grade padrão de blocos de horários (idêntico à imagem do usuário)
const ALL_TIME_SLOTS = [
  '08:00', '08:40', '09:20', '10:00', '10:40', '11:20',
  '12:00', '12:40', '13:20', '14:00', '14:40', '15:20',
  '16:00', '16:40', '17:20', '18:00', '18:40', '19:20'
];

// Mês base: Setembro 2026
const YEAR = 2026;
const MONTH = 8; // 8 = Setembro (0-indexed)

const DEFAULT_MOCK_APPOINTMENTS: AppointmentItem[] = [
  {
    id: 'apt-1',
    customerName: 'Matheus Ribeiro',
    customerPhone: '(11) 98765-4321',
    serviceName: 'Corte Degradê Navalhado',
    barberName: 'Lucas Silva',
    scheduledDate: '2026-09-10',
    scheduledTime: '08:00',
    durationMin: 40,
    priceCents: 5000,
    status: 'COMPLETED',
  },
  {
    id: 'apt-2',
    customerName: 'Felipe Camargo',
    customerPhone: '(11) 97654-3210',
    serviceName: 'Barboterapia Completa',
    barberName: 'Marcos Vinicius',
    scheduledDate: '2026-09-10',
    scheduledTime: '08:40',
    durationMin: 35,
    priceCents: 4500,
    status: 'COMPLETED',
  },
  {
    id: 'apt-3',
    customerName: 'Gabriel Souza',
    customerPhone: '(11) 96543-2109',
    serviceName: 'Combo Cabelo + Barba',
    barberName: 'Lucas Silva',
    scheduledDate: '2026-09-10',
    scheduledTime: '09:20',
    durationMin: 40,
    priceCents: 8500,
    status: 'COMPLETED',
  },
  {
    id: 'apt-4',
    customerName: 'Thiago Mendes',
    customerPhone: '(11) 95432-1098',
    serviceName: 'Corte Social na Tesoura',
    barberName: 'André Oliveira',
    scheduledDate: '2026-09-10',
    scheduledTime: '10:00',
    durationMin: 35,
    priceCents: 4000,
    status: 'COMPLETED',
  },
  {
    id: 'apt-5',
    customerName: 'Rodrigo Dias',
    customerPhone: '(11) 94321-0987',
    serviceName: 'Corte Degradê Navalhado',
    barberName: 'Lucas Silva',
    scheduledDate: '2026-09-10',
    scheduledTime: '10:40',
    durationMin: 40,
    priceCents: 5000,
    status: 'COMPLETED',
  },
  {
    id: 'apt-6',
    customerName: 'Carlos Eduardo',
    customerPhone: '(11) 93210-9876',
    serviceName: 'Combo Cabelo + Barba',
    barberName: 'Marcos Vinicius',
    scheduledDate: '2026-09-10',
    scheduledTime: '11:20',
    durationMin: 40,
    priceCents: 8500,
    status: 'COMPLETED',
  },
  {
    id: 'apt-block-1',
    customerName: 'Pausa Almoço da Equipe',
    serviceName: 'Intervalo Bloqueado',
    barberName: 'Lucas Silva',
    scheduledDate: '2026-09-10',
    scheduledTime: '12:00',
    durationMin: 40,
    priceCents: 0,
    status: 'BLOCKED',
  },
  {
    id: 'apt-7',
    customerName: 'Vinicius Prado',
    customerPhone: '(11) 92109-8765',
    serviceName: 'Corte Degradê Navalhado',
    barberName: 'Lucas Silva',
    scheduledDate: '2026-09-10',
    scheduledTime: '14:00',
    durationMin: 40,
    priceCents: 5000,
    status: 'IN_PROGRESS',
    whatsappReminderSent: true,
  },
  {
    id: 'apt-8',
    customerName: 'Lucas Barbosa',
    customerPhone: '(11) 91098-7654',
    serviceName: 'Corte Degradê Navalhado',
    barberName: 'Marcos Vinicius',
    scheduledDate: '2026-09-10',
    scheduledTime: '18:00',
    durationMin: 40,
    priceCents: 5000,
    status: 'CONFIRMED',
    whatsappReminderSent: true,
  },
  {
    id: 'apt-9',
    customerName: 'Leonardo Rocha',
    customerPhone: '(11) 99887-7665',
    serviceName: 'Pezinho & Acabamento',
    barberName: 'André Oliveira',
    scheduledDate: '2026-09-10',
    scheduledTime: '18:40',
    durationMin: 40,
    priceCents: 2500,
    status: 'CONFIRMED',
  },
  {
    id: 'apt-10',
    customerName: 'Guilherme Silva',
    customerPhone: '(11) 98712-3456',
    serviceName: 'Barboterapia Completa',
    barberName: 'Lucas Silva',
    scheduledDate: '2026-09-10',
    scheduledTime: '19:20',
    durationMin: 40,
    priceCents: 4500,
    status: 'CONFIRMED',
  },
];

export const AppointmentsPage: React.FC = () => {
  const { slug, tenant } = useTenant();
  const queryClient = useQueryClient();

  // Data Selecionada (Padrão: 10/09/2026)
  const [selectedYear, setSelectedYear] = useState(YEAR);
  const [selectedMonth, setSelectedMonth] = useState(MONTH);
  const [selectedDay, setSelectedDay] = useState(10);

  // Filtros
  const [selectedBarber, setSelectedBarber] = useState<string>('all');
  const [blockFilter, setBlockFilter] = useState<'ALL' | 'FREE' | 'BOOKED'>('ALL');

  // Modais
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);

  // Atendimento Ativo
  const [activeAppointment, setActiveAppointment] = useState<AppointmentItem | null>(null);
  const [activeSlotTime, setActiveSlotTime] = useState('14:40');

  // Form State: Novo Agendamento
  const [serviceName, setServiceName] = useState('Corte Degradê Navalhado');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [price, setPrice] = useState('50,00');
  const [assignedBarber, setAssignedBarber] = useState('Lucas Silva');
  const [durationMin, setDurationMin] = useState(40);

  // Form State: Bloqueio
  const [blockReason, setBlockReason] = useState('Pausa para Almoço');
  const [blockBarber, setBlockBarber] = useState('Lucas Silva');

  // Checkout
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT' | 'DEBIT' | 'CASH'>('PIX');

  // Local storage state
  const [localAppointments, setLocalAppointments] = useState<AppointmentItem[]>(() => {
    try {
      const storageKey = `orbyshox_tenant_appointments_${slug}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_MOCK_APPOINTMENTS;
  });

  const saveLocalAppointments = (updated: AppointmentItem[]) => {
    setLocalAppointments(updated);
    try {
      const storageKey = `orbyshox_tenant_appointments_${slug}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Queries
  const { data: serverAppointments = [] } = useQuery({
    queryKey: ['tenant-appointments', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/appointments`),
  });

  const { data: teamData } = useQuery({
    queryKey: ['tenant-appointments-team', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/employees`),
  });

  const employees = (teamData?.employees || []) as Array<{ id: string; name: string; role: string; isActive?: boolean }>;

  const barbersList = useMemo(() => {
    const team = employees
      .filter((e) => e.isActive !== false)
      .map((e) => ({ id: e.id, name: e.name, role: e.role === 'TENANT_ADMIN' ? 'Administrador' : 'Operador' }));
    return [{ id: 'all', name: 'Todos os Funcionários', role: 'Equipe Completa' }, ...team];
  }, [employees]);

  // Mescla appointments
  const allAppointments: AppointmentItem[] = useMemo(() => {
    if (serverAppointments && serverAppointments.length > 0) {
      const formattedServer = serverAppointments.map((apt: any) => ({
        id: apt.id,
        customerName: apt.customer?.name || apt.customerName || 'Cliente',
        customerPhone: apt.customer?.phone || apt.customerPhone || '',
        serviceName: apt.serviceName || 'Corte',
        barberName: apt.staff?.name || apt.barberName || 'Lucas Silva',
        barberId: apt.staffId || apt.staff?.id || apt.barberId || undefined,
        scheduledDate: apt.scheduledAt
          ? new Date(apt.scheduledAt).toISOString().split('T')[0]
          : '2026-09-10',
        scheduledTime: apt.scheduledAt
          ? new Date(apt.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '14:00',
        durationMin: apt.durationMin || 40,
        priceCents: apt.priceCents || 5000,
        status: (apt.status || 'CONFIRMED') as any,
        whatsappReminderSent: Boolean(apt.whatsappReminderSent),
      }));

      const serverIds = new Set(formattedServer.map((a: any) => a.id));
      const notInServer = localAppointments.filter((a) => !serverIds.has(a.id));
      return [...formattedServer, ...notInServer];
    }
    return localAppointments;
  }, [serverAppointments, localAppointments]);

  // Data formatada string "YYYY-MM-DD"
  const formattedSelectedDate = useMemo(() => {
    const m = String(selectedMonth + 1).padStart(2, '0');
    const d = String(selectedDay).padStart(2, '0');
    return `${selectedYear}-${m}-${d}`;
  }, [selectedYear, selectedMonth, selectedDay]);

  // Data formatada legível "10/09/2026"
  const formattedBrazilianDate = useMemo(() => {
    const m = String(selectedMonth + 1).padStart(2, '0');
    const d = String(selectedDay).padStart(2, '0');
    return `${d}/${m}/${selectedYear}`;
  }, [selectedYear, selectedMonth, selectedDay]);

  // Atendimentos do Dia Selecionado
  const appointmentsOnSelectedDay = useMemo(() => {
    return allAppointments.filter((apt) => {
      // Verifica data
      if (apt.scheduledDate && apt.scheduledDate !== formattedSelectedDate) {
        return false;
      }
      // Filtro de funcionário: prioriza `barberId` (confiável) e cai para o
      // nome completo como fallback apenas quando o ID não está disponível —
      // nunca por primeiro nome, que colide entre homônimos.
      if (selectedBarber !== 'all') {
        if (apt.barberId) {
          if (apt.barberId !== selectedBarber) return false;
        } else {
          const barberObj = barbersList.find((b) => b.id === selectedBarber);
          if (barberObj && apt.barberName.trim().toLowerCase() !== barberObj.name.trim().toLowerCase()) {
            return false;
          }
        }
      }
      return true;
    });
  }, [allAppointments, formattedSelectedDate, selectedBarber, barbersList]);

  // Estatísticas do dia selecionado
  const dayStats = useMemo(() => {
    const bookedCount = appointmentsOnSelectedDay.filter((a) => a.status !== 'BLOCKED').length;
    const freeCount = Math.max(0, ALL_TIME_SLOTS.length - appointmentsOnSelectedDay.length);
    const revenueCents = appointmentsOnSelectedDay.reduce(
      (acc, a) => (a.status !== 'BLOCKED' ? acc + (a.priceCents || 0) : acc),
      0
    );
    return {
      bookedCount,
      freeCount,
      totalSlots: ALL_TIME_SLOTS.length,
      revenue: (revenueCents / 100).toFixed(2),
    };
  }, [appointmentsOnSelectedDay]);

  // Calendário: Gera as células do mês de Setembro de 2026 (idêntico à imagem)
  const calendarCells = useMemo(() => {
    // Primeiro dia do mês
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    // Dias do mês anterior para preenchimento
    const daysInPrevMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    const cells: {
      day: number;
      isCurrentMonth: boolean;
      dateStr: string;
      hasAvailability: boolean;
      isFull: boolean;
    }[] = [];

    // Células do mês anterior
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      cells.push({
        day: prevDay,
        isCurrentMonth: false,
        dateStr: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`,
        hasAvailability: false,
        isFull: false,
      });
    }

    // Células do mês atual
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayApts = allAppointments.filter((a) => a.scheduledDate === dateStr);
      const isFull = dayApts.length >= ALL_TIME_SLOTS.length - 2;
      const hasAvailability = dayApts.length < ALL_TIME_SLOTS.length;

      cells.push({
        day: d,
        isCurrentMonth: true,
        dateStr,
        hasAvailability,
        isFull,
      });
    }

    // Células do próximo mês para completar 35 ou 42 células
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
      cells.push({
        day: n,
        isCurrentMonth: false,
        dateStr: `${selectedYear}-${String(selectedMonth + 2).padStart(2, '0')}-${String(n).padStart(2, '0')}`,
        hasAvailability: false,
        isFull: false,
      });
    }

    return cells;
  }, [selectedYear, selectedMonth, allAppointments]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newApt: any) => apiPost(`/tenant-app/${slug}/appointments`, newApt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-appointments', slug] });
    },
    onError: (err: any) => {
      // Antes o erro era engolido e o usuário recebia um toast de sucesso.
      toast.error(
        err?.response?.data?.message ||
          'Agendamento salvo localmente, mas não foi possível sincronizar com o servidor.',
      );
    },
  });

  // Salvar Novo Agendamento
  const handleSaveBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }

    const priceCents = Math.round(parseFloat(price.replace(',', '.') || '0') * 100);
    const newId = 'apt-' + Date.now();

    const newRecord: AppointmentItem = {
      id: newId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      serviceName,
      barberName: assignedBarber,
      scheduledDate: formattedSelectedDate,
      scheduledTime: activeSlotTime,
      durationMin,
      priceCents,
      status: 'CONFIRMED',
    };

    const updated = [newRecord, ...localAppointments];
    saveLocalAppointments(updated);

    createMutation.mutate({
      serviceName,
      customerName,
      customerPhone,
      priceCents,
      staffName: assignedBarber,
      scheduledAt: `${formattedSelectedDate}T${activeSlotTime}:00`,
      durationMin,
      status: 'CONFIRMED',
    });

    setBookingModalOpen(false);
    setCustomerName('');
    setCustomerPhone('');
    if (createMutation.isError) {
      // O onError já emitiu o aviso de falha de sincronização.
      return;
    }
    toast.success(`Horário das ${activeSlotTime} agendado para ${customerName}!`);
  };

  // Salvar Bloqueio de Horário
  const handleSaveBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = 'block-' + Date.now();
    const newRecord: AppointmentItem = {
      id: newId,
      customerName: blockReason.trim() || 'Pausa da Equipe',
      serviceName: 'Horário Bloqueado',
      barberName: blockBarber,
      scheduledDate: formattedSelectedDate,
      scheduledTime: activeSlotTime,
      durationMin: 40,
      priceCents: 0,
      status: 'BLOCKED',
    };

    const updated = [newRecord, ...localAppointments];
    saveLocalAppointments(updated);
    setBlockModalOpen(false);
    toast.success(`Horário das ${activeSlotTime} bloqueado com sucesso!`);
  };

  // Alterar Status
  const updateStatus = async (
    aptId: string,
    nextStatus: AppointmentItem['status'],
    paymentMethod?: string,
  ) => {
    const updated = localAppointments.map((apt) =>
      apt.id === aptId ? { ...apt, status: nextStatus } : apt
    );
    saveLocalAppointments(updated);

    let synced = true;
    try {
      await apiPatch(`/tenant-app/${slug}/appointments/${aptId}/status`, {
        status: nextStatus,
        paymentMethod,
      });
      queryClient.invalidateQueries({ queryKey: ['tenant-appointments', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-barbers', slug] });
    } catch {
      // Não silenciar: o usuário precisa saber que o faturamento NÃO foi registrado.
      synced = false;
    }

    if (!synced) {
      toast.error(
        'A alteração foi salva apenas neste dispositivo. Falha ao sincronizar com o servidor — o faturamento pode não ter sido registrado.',
      );
    } else if (nextStatus === 'IN_PROGRESS') {
      toast.info('Cliente colocado na cadeira! Bom atendimento.');
    } else if (nextStatus === 'COMPLETED') {
      toast.success('Atendimento concluído e registrado no faturamento!');
    } else if (nextStatus === 'CANCELLED') {
      toast.error('Agendamento cancelado.');
    }
  };

  // Liberar Horário Bloqueado
  const handleUnblock = (aptId: string) => {
    const updated = localAppointments.filter((apt) => apt.id !== aptId);
    saveLocalAppointments(updated);
    toast.success('Horário liberado novamente na agenda!');
  };

  // Abrir Modal de Checkout
  const handleOpenCheckout = (apt: AppointmentItem) => {
    setActiveAppointment(apt);
    setCheckoutModalOpen(true);
  };

  // Confirmar Cobrança
  const handleConfirmCheckout = () => {
    if (!activeAppointment) return;
    updateStatus(activeAppointment.id, 'COMPLETED', paymentMethod);
    setCheckoutModalOpen(false);
    toast.success(
      `Pagamento de R$ ${((activeAppointment.priceCents || 0) / 100).toFixed(2)} recebido via ${paymentMethod}!`
    );
  };

  // Disparar WhatsApp
  const handleSendWhatsApp = (apt: AppointmentItem) => {
    const cleanPhone = (apt.customerPhone || '').replace(/\D/g, '');
    const companyName = tenant?.tradeName || tenant?.companyName || 'Barbearia';
    const text = encodeURIComponent(
      `Olá ${apt.customerName}! 💈 Confirmando seu horário de *${apt.serviceName}* com o barbeiro *${apt.barberName}* no dia *${formattedBrazilianDate}* às *${apt.scheduledTime}* na *${companyName}*. Te aguardamos!`
    );

    const updated = localAppointments.map((a) =>
      a.id === apt.id ? { ...a, whatsappReminderSent: true } : a
    );
    saveLocalAppointments(updated);

    if (cleanPhone.length >= 10) {
      window.open(`https://wa.me/55${cleanPhone}?text=${text}`, '_blank');
    } else {
      navigator.clipboard.writeText(
        `Olá ${apt.customerName}! 💈 Seu horário de ${apt.serviceName} está confirmado para ${formattedBrazilianDate} às ${apt.scheduledTime}!`
      );
      toast.success('Mensagem de confirmação copiada para a área de transferência!');
    }
  };

  // Clique em um Bloco de Horário
  const handleSlotClick = (slot: string) => {
    setActiveSlotTime(slot);
    const booked = appointmentsOnSelectedDay.find(
      (a) => a.scheduledTime === slot || a.scheduledTime.startsWith(slot.slice(0, 4))
    );

    if (booked) {
      setActiveAppointment(booked);
      setDetailModalOpen(true);
    } else {
      // Slot livre: abre agendamento
      setBookingModalOpen(true);
    }
  };

  // Copiar link de agendamento online público
  const copyPublicBookingLink = () => {
    const url = `${window.location.origin}/${slug}/agendar`;
    navigator.clipboard.writeText(url);
    toast.success('Link do agendamento online copiado! Envie aos seus clientes.');
  };

  return (
    <div className="space-y-5 font-sans pb-12">
      {/* ─── 1. Header do Módulo (Coss UI Moderno) ─── */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-zinc-950 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Scissors className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900">
                  Agenda & Horários
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Visual Calendário & Blocos
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Selecione o dia no calendário para gerenciar ou marcar nos blocos de horários.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <Button
              variant="outline"
              size="sm"
              onClick={copyPublicBookingLink}
              className="h-9 px-3 text-xs font-bold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Copiar link da página pública"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>Link Online</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setActiveSlotTime('14:40');
                setBookingModalOpen(true);
              }}
              className="h-9 px-3.5 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-lg shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 text-amber-400 stroke-[2.5]" />
              <span>Novo Agendamento</span>
            </Button>
          </div>
        </div>

        {/* Filtro de Funcionários com Chips Elegantes */}
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5">
            {barbersList.map((b) => {
              const isSelected = selectedBarber === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBarber(b.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border select-none cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <span>{b.name}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Vagas Livres
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              Lotado / Bloqueado
            </span>
          </div>
        </div>
      </div>

      {/* ─── 2. CALENDÁRIO MENSAL EM BLOCOS QUADRADOS COMPACTOS ─── */}
      <div className="bg-white rounded-xl border border-zinc-200/90 shadow-2xs overflow-hidden">
        {/* Topo do Calendário */}
        <div className="px-4 py-3 bg-zinc-50/70 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-zinc-800 shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Setembro de 2026
              </h2>
              <p className="text-[11px] text-zinc-400">
                Selecione o dia desejado para ver ou gerenciar os blocos de horários
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedDay(10);
                toast.info('Visualizando hoje: 10/09/2026');
              }}
              className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
            >
              Hoje (10 Set)
            </button>
          </div>
        </div>

        {/* Grade do Calendário: Tabela com Células 100% Quadradas (aspect-square) */}
        <div className="max-w-2xl">
          {/* Cabeçalho dos Dias da Semana */}
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/50 text-center text-xs font-bold text-zinc-700 select-none">
            <div className="py-2 text-zinc-400">Dom</div>
            <div className="py-2">Seg</div>
            <div className="py-2">Ter</div>
            <div className="py-2">Qua</div>
            <div className="py-2">Qui</div>
            <div className="py-2">Sex</div>
            <div className="py-2 text-zinc-400">Sáb</div>
          </div>

          {/* Células dos Dias: Quadradas (aspect-square) com Bordas Compartilhadas */}
          <div className="grid grid-cols-7 border-l border-t border-zinc-200">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.isCurrentMonth && cell.day === selectedDay;
              const isPastOrNext = !cell.isCurrentMonth;
              const isPastDay = cell.isCurrentMonth && cell.day < 9;
              // Barra lateral verde idêntica ao print de referência
              const hasGreenBorder = cell.isCurrentMonth && cell.day >= 10 && cell.day <= 30;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isPastOrNext}
                  onClick={() => {
                    if (cell.isCurrentMonth) {
                      setSelectedDay(cell.day);
                    }
                  }}
                  className={`aspect-square p-1 sm:p-1.5 border-r border-b border-zinc-200 text-left transition-all relative flex flex-col justify-between select-none cursor-pointer ${
                    isPastOrNext
                      ? 'bg-zinc-50/40 text-zinc-300 opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-amber-100/90 text-zinc-950 font-black border-l-4 border-l-amber-500 shadow-xs ring-1 ring-inset ring-amber-400/50'
                      : hasGreenBorder
                      ? 'bg-emerald-50/30 hover:bg-emerald-100/60 text-zinc-900 border-l-4 border-l-emerald-600'
                      : isPastDay
                      ? 'bg-white hover:bg-zinc-50 text-zinc-400'
                      : 'bg-white hover:bg-zinc-50 text-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between w-full">
                    <span
                      className={`text-xs sm:text-sm font-bold font-mono pl-0.5 leading-none ${
                        isSelected
                          ? 'text-zinc-950 font-black'
                          : isPastOrNext || isPastDay
                          ? 'text-zinc-400'
                          : 'text-zinc-900'
                      }`}
                    >
                      {cell.day}
                    </span>

                    {/* Bolinhas indicadoras (verde = livre, vermelho = ocupado) */}
                    {cell.isCurrentMonth && cell.day >= 9 && (
                      <span
                        className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mt-0.5 ${
                          cell.day % 3 === 0 ? 'bg-rose-500' : 'bg-emerald-600'
                        }`}
                        title={cell.day % 3 === 0 ? 'Alta ocupação' : 'Vagas disponíveis'}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── 3. SEÇÃO DE BLOCOS DE HORÁRIOS 100% QUADRADOS (NÃO RETÂNGULO) ─── */}
      <div className="bg-white rounded-xl border border-zinc-200/90 shadow-2xs p-4 sm:p-5 space-y-3.5">
        {/* Topo da Seção de Horários */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/60">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">
                Horários disponíveis para {formattedBrazilianDate}
              </h3>
            </div>
          </div>

          {/* Legenda Resumida dos Blocos */}
          <div className="flex items-center gap-1.5 text-xs">
            <div className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 font-bold text-[10px] flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-amber-600" />
              <span>Concluído / Pausa</span>
            </div>
            <div className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-400 text-emerald-900 font-bold text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{dayStats.freeCount} Livres</span>
            </div>
            <div className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-300 text-rose-900 font-bold text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>{dayStats.bookedCount} Ocupados</span>
            </div>
          </div>
        </div>

        {/* ─── GRADE DE BLOCOS DE HORÁRIOS: 100% QUADRADOS (aspect-square), NÃO RETÂNGULO ─── */}
        <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-2.5 max-w-xl">
          {ALL_TIME_SLOTS.map((slot) => {
            const bookedItem = appointmentsOnSelectedDay.find(
              (a) => a.scheduledTime === slot || a.scheduledTime.startsWith(slot.slice(0, 4))
            );

            // Se o horário estiver ocupado/bloqueado
            if (bookedItem) {
              const isBlocked = bookedItem.status === 'BLOCKED';
              const isFinished = bookedItem.status === 'COMPLETED';
              const isInProgress = bookedItem.status === 'IN_PROGRESS';
              const isWaiting = bookedItem.status === 'CONFIRMED';

              // Bloco Amarelo com cadeado (Linha 1 do print) - Quadrado
              if (isFinished || isBlocked) {
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    className="aspect-square rounded-xl border-2 border-amber-300 bg-amber-100/75 hover:bg-amber-200/90 text-amber-950 flex flex-col items-center justify-center p-1 transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-95 select-none"
                    title={
                      isBlocked
                        ? `Pausa: ${bookedItem.customerName}`
                        : `Concluído: ${bookedItem.customerName} (${bookedItem.serviceName})`
                    }
                  >
                    <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-800 mb-0.5 sm:mb-1 shrink-0" />
                    <span className="font-mono font-black text-xs sm:text-sm tracking-tight leading-none">{slot}</span>
                    <span className="text-[9px] font-sans font-bold text-amber-800 mt-1 opacity-80 leading-none">
                      {isBlocked ? 'Pausa' : 'Feito'}
                    </span>
                  </button>
                );
              }

              // Bloco Na Cadeira (Pulsante) - Quadrado
              if (isInProgress) {
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    className="aspect-square rounded-xl border-2 border-emerald-500 bg-emerald-100 text-emerald-950 flex flex-col items-center justify-center p-1 transition-all shadow-2xs cursor-pointer active:scale-95 ring-2 ring-emerald-500/20 animate-pulse select-none"
                    title={`Na Cadeira: ${bookedItem.customerName} (${bookedItem.serviceName})`}
                  >
                    <Scissors className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 mb-0.5 sm:mb-1 shrink-0" />
                    <span className="font-mono font-black text-xs sm:text-sm tracking-tight leading-none">{slot}</span>
                    <span className="text-[9px] font-sans font-bold text-emerald-800 mt-1 leading-none">
                      Corte
                    </span>
                  </button>
                );
              }

              // Bloco Vermelho/Rosa (Ocupado/Confirmado - Linha 3 do print) - Quadrado
              if (isWaiting) {
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    className="aspect-square rounded-xl border-2 border-rose-300 bg-rose-100/80 hover:bg-rose-200/90 text-rose-950 flex flex-col items-center justify-center p-1 transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-95 select-none"
                    title={`Ocupado: ${bookedItem.customerName} (${bookedItem.serviceName})`}
                  >
                    <span className="font-mono font-black text-xs sm:text-sm tracking-tight leading-none">{slot}</span>
                    <span className="text-[10px] font-sans font-bold text-rose-800 truncate max-w-[58px] mt-1.5 leading-none">
                      {bookedItem.customerName.split(' ')[0]}
                    </span>
                  </button>
                );
              }
            }

            // Bloco Verde / Livre (Linha 2 do print) - Quadrado
            return (
              <button
                key={slot}
                type="button"
                onClick={() => handleSlotClick(slot)}
                className="aspect-square rounded-xl border-2 border-emerald-500 bg-white hover:bg-emerald-50/70 text-emerald-800 hover:text-emerald-950 flex flex-col items-center justify-center p-1 transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-95 select-none group"
                title="Horário livre para agendar"
              >
                <span className="text-emerald-600 font-black text-sm leading-none mb-0.5 group-hover:scale-125 transition-transform">+</span>
                <span className="font-mono font-black text-xs sm:text-sm tracking-tight leading-none">{slot}</span>
                <span className="text-[9px] font-sans font-bold text-emerald-700 mt-1 leading-none">
                  Livre
                </span>
              </button>
            );
          })}
        </div>

        {/* Resumo Financeiro & Operacional da Data */}
        <div className="pt-2.5 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-zinc-500">
              Faturamento Previsto para {formattedBrazilianDate}:
            </span>
            <strong className="font-mono font-black text-sm text-zinc-900">
              R$ {dayStats.revenue}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveSlotTime('12:00');
                setBlockModalOpen(true);
              }}
              className="h-8 px-3 text-xs font-bold text-zinc-700 rounded-lg cursor-pointer"
            >
              <Lock className="w-3 h-3 mr-1" />
              <span>Bloquear Horário / Almoço</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── 4. MODAL: DETALHES DO HORÁRIO OCUPADO (AO CLICAR NO BLOCO COLORIDO) ─── */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-5 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-700" />
              Horário das {activeSlotTime} · {formattedBrazilianDate}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Gerencie o atendimento deste cliente ou faça cobrança direta.
            </DialogDescription>
          </DialogHeader>

          {activeAppointment && (
            <div className="space-y-4 mt-2">
              {activeAppointment.status === 'BLOCKED' ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <Lock className="w-4 h-4 text-amber-700" />
                    <span>{activeAppointment.customerName}</span>
                  </div>
                  <p className="text-xs text-amber-700">
                    Este horário está pausado para {activeAppointment.barberName}. Clientes não podem agendar online neste período.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      handleUnblock(activeAppointment.id);
                      setDetailModalOpen(false);
                    }}
                    className="w-full h-9 mt-2 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl"
                  >
                    Desbloquear e Liberar Horário
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Card com Detalhes do Cliente */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Cliente:</span>
                      <strong className="text-zinc-900 font-bold text-sm">
                        {activeAppointment.customerName}
                      </strong>
                    </div>
                    {activeAppointment.customerPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">WhatsApp:</span>
                        <strong className="text-zinc-800 font-mono">
                          {activeAppointment.customerPhone}
                        </strong>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Serviço:</span>
                      <strong className="text-zinc-900">{activeAppointment.serviceName}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Barbeiro:</span>
                      <strong className="text-zinc-900">{activeAppointment.barberName}</strong>
                    </div>
                    <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-700">Valor do Corte:</span>
                      <span className="text-base font-black text-emerald-600 font-mono">
                        R$ {((activeAppointment.priceCents || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="space-y-2">
                    {/* Botão de WhatsApp */}
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(activeAppointment)}
                      className="w-full h-10 px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>Enviar Mensagem no WhatsApp</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      {activeAppointment.status === 'CONFIRMED' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateStatus(activeAppointment.id, 'IN_PROGRESS');
                            setDetailModalOpen(false);
                          }}
                          className="h-10 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-2xl cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5 mr-1" />
                          <span>Iniciar Corte</span>
                        </Button>
                      )}

                      {activeAppointment.status === 'IN_PROGRESS' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setDetailModalOpen(false);
                            handleOpenCheckout(activeAppointment);
                          }}
                          className="h-10 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-2xl cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1" />
                          <span>Cobrar & Concluir</span>
                        </Button>
                      )}

                      {activeAppointment.status === 'COMPLETED' && (
                        <div className="h-10 rounded-2xl bg-zinc-100 text-zinc-500 font-bold text-xs flex items-center justify-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Atendimento Pago</span>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateStatus(activeAppointment.id, 'CANCELLED');
                          setDetailModalOpen(false);
                        }}
                        className="h-10 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 rounded-2xl cursor-pointer"
                      >
                        Cancelar Horário
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 5. MODAL: NOVO AGENDAMENTO (AO TOCAR NO BLOCO VERDE LIVRE) ─── */}
      <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-5 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-emerald-600" />
              Agendar para às {activeSlotTime} ({formattedBrazilianDate})
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Preencha os dados do cliente para reservar este bloco de horário.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveBooking} className="space-y-3.5 mt-2">
            {/* Escolha Rápida do Serviço */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-800 block">Serviço *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_SERVICES.slice(0, 4).map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      setServiceName(s.name);
                      setPrice(s.price);
                      setDurationMin(s.durationMin);
                    }}
                    className={`p-2 rounded-xl border text-left transition select-none cursor-pointer ${
                      serviceName === s.name
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                        : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                    }`}
                  >
                    <p className="text-[11px] font-bold truncate">{s.name}</p>
                    <p
                      className={`text-[10px] font-mono ${
                        serviceName === s.name ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                    >
                      R$ {s.price} · {s.durationMin}m
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Escolha do Funcionário */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-800 block">
                Funcionário responsável *
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {barbersList.filter((b) => b.id !== 'all').map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setAssignedBarber(b.name)}
                    className={`p-1.5 rounded-xl border text-center transition select-none cursor-pointer ${
                      assignedBarber === b.name
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                    }`}
                  >
                    <p className="text-xs font-bold truncate">{b.name.split(' ')[0]}</p>
                    <p className="text-[9px] text-zinc-400 truncate">{b.role.split(' ')[0]}</p>
                  </button>
                ))}
                {barbersList.filter((b) => b.id !== 'all').length === 0 && (
                  <p className="col-span-3 text-[11px] text-zinc-500 italic">
                    Cadastre um funcionário na aba "Equipe & Funcionários" para atribuir
                    agendamentos.
                  </p>
                )}
              </div>
            </div>

            {/* Dados do Cliente */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">Nome do Cliente *</label>
                <Input
                  placeholder="Ex: Carlos Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">WhatsApp</label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="h-9 text-xs font-mono rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">Horário</label>
                <Input
                  value={activeSlotTime}
                  disabled
                  className="h-9 text-xs font-mono rounded-xl bg-zinc-100 border-zinc-200 text-zinc-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">Valor (R$) *</label>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="h-9 text-xs font-mono rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBookingModalOpen(false)}
                className="h-9 px-3 text-xs font-bold text-zinc-700 rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="h-9 px-4 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl"
              >
                {createMutation.isPending ? 'Salvando...' : 'Confirmar Agendamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 6. MODAL: BLOQUEAR HORÁRIO / INTERVALO ─── */}
      <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-5 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600" />
              Bloquear Horário ({formattedBrazilianDate})
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Bloqueie este intervalo para almoço, descanso ou pausa da equipe.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveBlock} className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1">Motivo do Bloqueio *</label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {['Pausa Almoço', 'Intervalo Café', 'Folga / Manutenção'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBlockReason(m)}
                    className={`p-1.5 rounded-xl border text-xs font-bold transition select-none cursor-pointer ${
                      blockReason === m
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="h-9 text-xs rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">
                  Funcionário *
                </label>
                <select
                  value={blockBarber}
                  onChange={(e) => setBlockBarber(e.target.value)}
                  className="w-full h-9 px-2 text-xs rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white"
                >
                  {barbersList.filter((b) => b.id !== 'all').map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">Horário *</label>
                <select
                  value={activeSlotTime}
                  onChange={(e) => setActiveSlotTime(e.target.value)}
                  className="w-full h-9 px-2 text-xs font-mono rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white"
                >
                  {ALL_TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBlockModalOpen(false)}
                className="h-9 px-3 text-xs font-bold text-zinc-700 rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-9 px-4 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl"
              >
                Confirmar Bloqueio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 7. MODAL: RECEBER & COBRAR ATENDIMENTO (CHECKOUT RÁPIDO) ─── */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-5 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Concluir & Receber Atendimento
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Registre a forma de pagamento recebida para dar baixa no caixa.
            </DialogDescription>
          </DialogHeader>

          {activeAppointment && (
            <div className="space-y-3.5 mt-2">
              <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/70 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Cliente:</span>
                  <strong className="text-zinc-900">{activeAppointment.customerName}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Serviço:</span>
                  <strong className="text-zinc-900">{activeAppointment.serviceName}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Barbeiro:</span>
                  <strong className="text-zinc-900">{activeAppointment.barberName}</strong>
                </div>
                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                  <span className="font-bold text-zinc-700">Total a Pagar:</span>
                  <span className="text-lg font-black text-emerald-600 font-mono">
                    R$ {((activeAppointment.priceCents || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-800 block">Forma de Pagamento *</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'PIX', label: 'PIX Instantâneo', icon: QrCode },
                    { id: 'CREDIT', label: 'Cartão Crédito', icon: CreditCard },
                    { id: 'DEBIT', label: 'Cartão Débito', icon: CreditCard },
                    { id: 'CASH', label: 'Dinheiro', icon: Banknote },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`p-2 rounded-xl border text-left transition select-none cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                            : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-bold">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="h-9 px-3 text-xs font-bold text-zinc-700 rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmCheckout}
                  className="h-9 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmar Recebimento</span>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
