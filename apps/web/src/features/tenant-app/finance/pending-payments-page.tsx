import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ChevronDown,
  MessageCircle,
  History,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const parseBRL = (raw: string) => {
  const v = parseFloat((raw || '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
};

const METHODS = ['Pix', 'Dinheiro', 'Crédito', 'Débito', 'Cartão'] as const;

const todayStart = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

/** Quanto já entrou nesta parcela (RECEIVED conta como quitada). */
const effectivePaid = (b: any) =>
  b.status === 'RECEIVED' ? Number(b.amountCents || 0) : Number(b.paidCents || 0);

const pendingOf = (b: any) => Math.max(0, Number(b.amountCents || 0) - effectivePaid(b));

type DisplayStatus = 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'RECEIVED';

const billStatus = (b: any, today: Date): DisplayStatus => {
  if (b.status === 'RECEIVED' || b.status === 'CANCELED') return 'RECEIVED';
  if (pendingOf(b) <= 0) return 'RECEIVED';
  if (new Date(b.dueDate) < today) return 'OVERDUE';
  return effectivePaid(b) > 0 ? 'PARTIAL' : 'PENDING';
};

const daysOverdue = (b: any, today: Date) => {
  const diff = today.getTime() - new Date(new Date(b.dueDate).setHours(0, 0, 0, 0)).getTime();
  return diff > 0 ? Math.floor(diff / 86400000) : 0;
};

const STATUS_META: Record<DisplayStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  PARTIAL: { label: 'Parcial', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  OVERDUE: { label: 'Vencido', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  RECEIVED: { label: 'Quitado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

/**
 * Pagamentos Pendentes (crediário da loja): por cliente, com parcelas,
 * pagamento parcial, histórico, cobrança no WhatsApp e filtros.
 */
export const PendingPaymentsPage: React.FC = () => {
  const { slug, tenant } = useTenant();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayStart(), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DisplayStatus>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'OVERDUE'>('ALL');
  const [sortBy, setSortBy] = useState<'DUE' | 'VALUE'>('DUE');
  const [expanded, setExpanded] = useState<string[]>([]);

  // Modal registrar pagamento (parcial ou total)
  const [payBill, setPayBill] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>('Pix');
  const [payNotes, setPayNotes] = useState('');

  // Modal cadastrar venda parcelada
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regCustomerId, setRegCustomerId] = useState('');
  const [regNewCustomer, setRegNewCustomer] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDescription, setRegDescription] = useState('');
  const [regOrderId, setRegOrderId] = useState('');
  const [regTotal, setRegTotal] = useState('');
  const [regInitial, setRegInitial] = useState('');
  const [regCount, setRegCount] = useState('3');
  const [regPurchaseDate, setRegPurchaseDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });
  const [regFirstDue, setRegFirstDue] = useState(() => {
    const n = new Date(Date.now() + 30 * 86400000);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });
  const [regInterval, setRegInterval] = useState('30');
  const [regCustomInterval, setRegCustomInterval] = useState('30');
  const [regMethod, setRegMethod] = useState<string>('Pix');
  const [regNotes, setRegNotes] = useState('');

  const { data: billsRaw = [], isLoading } = useQuery({
    queryKey: ['pending-payments', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/finance/receivables`),
    enabled: !!slug,
    refetchInterval: 15000,
  });

  const { data: customersData = [] } = useQuery({
    queryKey: ['pending-payments-customers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/customers`).catch(() => []),
    enabled: !!slug,
  });

  const { data: ordersData = [] } = useQuery({
    queryKey: ['pending-payments-orders', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/orders`).catch(() => []),
    enabled: !!slug,
  });

  const bills: any[] = Array.isArray(billsRaw) ? billsRaw : [];
  const customers: any[] = Array.isArray(customersData) ? customersData : customersData?.customers || [];
  const orders: any[] = Array.isArray(ordersData) ? ordersData : [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['pending-payments', slug] });
    queryClient.invalidateQueries({ queryKey: ['pending-payments-customers', slug] });
    queryClient.invalidateQueries({ queryKey: ['bills-receivable', slug] });
    queryClient.invalidateQueries({ queryKey: ['day-closing'] });
  };

  // ─── Agregação por cliente ───
  const groups = useMemo(() => {
    const map = new Map<string, any>();
    for (const b of bills) {
      if (b.status === 'CANCELED') continue;
      const c = b.customer || {};
      const key = b.customerId || `avulso-${b.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          customerId: b.customerId || null,
          name: c.name || 'Venda avulsa',
          phone: c.phone || '',
          bills: [] as any[],
        });
      }
      map.get(key).bills.push(b);
    }
    const list = [...map.values()].map((g) => {
      const open = g.bills.filter((b: any) => billStatus(b, today) !== 'RECEIVED');
      const totalPurchase = g.bills.reduce((s: number, b: any) => s + Number(b.amountCents || 0), 0);
      const totalPending = g.bills.reduce((s: number, b: any) => s + pendingOf(b), 0);
      const paidCount = g.bills.filter((b: any) => billStatus(b, today) === 'RECEIVED').length;
      const nextDue = open.length
        ? open.map((b: any) => new Date(b.dueDate).getTime()).reduce((a: number, v: number) => Math.min(a, v))
        : null;
      const maxOverdue = open.reduce((m: number, b: any) => Math.max(m, daysOverdue(b, today)), 0);
      const rank = (s: DisplayStatus) => (s === 'OVERDUE' ? 3 : s === 'PARTIAL' ? 2 : s === 'PENDING' ? 1 : 0);
      const status: DisplayStatus =
        open.length === 0
          ? 'RECEIVED'
          : open.map((b: any) => billStatus(b, today)).sort((a: DisplayStatus, b2: DisplayStatus) => rank(b2) - rank(a))[0];
      const history = g.bills
        .flatMap((b: any) => (b.payments || []).map((p: any) => ({ ...p, billDescription: b.description })))
        .sort((a: any, b: any) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
      const purchaseDate = g.bills
        .map((b: any) => new Date(b.purchaseDate || b.createdAt).getTime())
        .filter((t: number) => Number.isFinite(t))
        .sort((a: number, b: number) => a - b)[0];
      return {
        ...g,
        bills: g.bills.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
        open,
        totalPurchase,
        totalPending,
        paidCount,
        totalCount: g.bills.length,
        nextDue,
        maxOverdue,
        status,
        history,
        purchaseDate,
      };
    });
    return list;
  }, [bills, today]);

  // ─── KPIs ───
  const kpis = useMemo(() => {
    let pendente = 0;
    let vencido = 0;
    const debtors = new Set<string>();
    for (const g of groups) {
      if (g.totalPending <= 0) continue;
      pendente += g.totalPending;
      debtors.add(g.key);
      for (const b of g.open) {
        if (billStatus(b, today) === 'OVERDUE') vencido += pendingOf(b);
      }
    }
    return { pendente, vencido, aVencer: Math.max(0, pendente - vencido), clientes: debtors.size };
  }, [groups, today]);

  // ─── Filtros + ordenação ───
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const weekEnd = today.getTime() + 7 * 86400000;
    const monthEnd = today.getTime() + 30 * 86400000;
    const list = groups.filter((g) => {
      if (
        term &&
        !`${g.name} ${g.phone} ${g.bills.map((b: any) => b.description).join(' ')}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
      if (periodFilter === 'OVERDUE' && g.maxOverdue <= 0) return false;
      if (periodFilter === 'TODAY' && !(g.nextDue && new Date(g.nextDue).toDateString() === today.toDateString())) {
        return false;
      }
      if (periodFilter === 'WEEK' && !(g.nextDue && g.nextDue >= today.getTime() && g.nextDue <= weekEnd)) return false;
      if (periodFilter === 'MONTH' && !(g.nextDue && g.nextDue >= today.getTime() && g.nextDue <= monthEnd)) {
        return false;
      }
      return true;
    });
    list.sort((a, b) =>
      sortBy === 'VALUE' ? b.totalPending - a.totalPending : (a.nextDue || Infinity) - (b.nextDue || Infinity),
    );
    return list;
  }, [groups, searchTerm, statusFilter, periodFilter, sortBy, today]);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // ─── Mutations ───
  const payMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiPatch(`/tenant-app/${slug}/finance/receivables/${id}/pay`, body),
    onSuccess: () => {
      invalidateAll();
      setPayBill(null);
      setPayAmount('');
      setPayNotes('');
      toast.success('Pagamento registrado!');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao registrar pagamento'),
  });

  const registerMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/tenant-app/${slug}/finance/receivables/installments`, body),
    onSuccess: (res: any) => {
      invalidateAll();
      closeRegister();
      toast.success(
        res?.bills?.length > 1
          ? `Venda parcelada em ${res.bills.length}x cadastrada!`
          : 'Pagamento pendente cadastrado!',
      );
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao cadastrar'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiDelete(`/tenant-app/${slug}/finance/receivables/group/${groupId}`),
    onSuccess: (res: any) => {
      invalidateAll();
      toast.success(`Venda removida (${res?.removed || 0} parcela(s)).`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao remover'),
  });

  // ─── Modal cadastrar: derivados ───
  const regTotalCents = parseBRL(regTotal);
  const regInitialCents = Math.min(regTotalCents, parseBRL(regInitial));
  const regPendingCents = regTotalCents - regInitialCents;
  const regCountNum = Math.min(60, Math.max(1, parseInt(regCount, 10) || 1));
  const regIntervalDays = regInterval === 'custom' ? Math.max(1, parseInt(regCustomInterval, 10) || 30) : parseInt(regInterval, 10) || 30;
  const regPerCents = regCountNum > 0 ? regTotalCents / regCountNum : 0;
  const regSelectedCustomer = customers.find((c: any) => c.id === regCustomerId);
  const regCustomerOpen = useMemo(() => {
    if (!regCustomerId) return [];
    return bills.filter(
      (b: any) => b.customerId === regCustomerId && billStatus(b, today) !== 'RECEIVED' && b.status !== 'CANCELED',
    );
  }, [bills, regCustomerId, today]);
  const regStatusPreview: DisplayStatus =
    regTotalCents <= 0 ? 'PENDING' : regPendingCents <= 0 ? 'RECEIVED' : regInitialCents > 0 ? 'PARTIAL' : 'PENDING';

  const openRegister = () => {
    setRegCustomerId('');
    setRegNewCustomer(false);
    setRegName('');
    setRegPhone('');
    setRegDescription('');
    setRegOrderId('');
    setRegTotal('');
    setRegInitial('');
    setRegCount('3');
    setRegFirstDue(() => {
      const n = new Date(Date.now() + 30 * 86400000);
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    });
    setRegNotes('');
    setRegisterOpen(true);
  };

  const closeRegister = () => setRegisterOpen(false);

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (regTotalCents <= 0) return toast.error('Informe o valor total da compra');
    if (!regNewCustomer && !regCustomerId) return toast.error('Selecione o cliente');
    if (regNewCustomer && !regName.trim()) return toast.error('Informe o nome do cliente');
    registerMutation.mutate({
      customerId: regNewCustomer ? undefined : regCustomerId,
      customerName: regNewCustomer ? regName.trim() : undefined,
      customerPhone: regNewCustomer ? regPhone.replace(/\D/g, '') || undefined : undefined,
      orderId: regOrderId || undefined,
      description: regDescription.trim() || undefined,
      totalCents: regTotalCents,
      initialPaidCents: regInitialCents,
      installmentsTotal: regCountNum,
      purchaseDate: regPurchaseDate || undefined,
      firstDueDate: regFirstDue || undefined,
      intervalDays: regIntervalDays,
      paymentMethod: regMethod,
      notes: regNotes.trim() || undefined,
    });
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payBill) return;
    const cents = parseBRL(payAmount);
    if (cents <= 0) return toast.error('Informe o valor recebido');
    payMutation.mutate({ id: payBill.id, body: { amountCents: cents, method: payMethod, notes: payNotes.trim() || undefined } });
  };

  const cobrançaHref = (g: any) => {
    const digits = (g.phone || '').replace(/\D/g, '');
    if (!digits) return null;
    const store = tenant?.tradeName || tenant?.companyName || 'loja';
    const text = `Olá ${g.name}! Aqui é da ${store}: você tem ${brl(g.totalPending)} em aberto${
      g.nextDue ? ` (vence ${fmtDate(g.nextDue)})` : ''
    }. Qualquer coisa chama a gente!`;
    return `https://wa.me/55${digits}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-600" />
            Pagamentos Pendentes
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Crediário da loja: parcelas, parciais, cobranças e histórico por cliente.
          </p>
        </div>
        <Button
          onClick={openRegister}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar pagamento pendente</span>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Total pendente</span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{brl(kpis.pendente)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">A receber</span>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Total vencido</span>
          <p className="text-2xl font-bold text-rose-600 mt-1 font-mono">{brl(kpis.vencido)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Passou do vencimento</span>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Total a vencer</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">{brl(kpis.aVencer)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Dentro do prazo</span>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Clientes devendo</span>
          <p className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{kpis.clientes}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Com pendência aberta</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, telefone ou descrição..."
              className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold"
          >
            <option value="DUE">Ordenar: vencimento</option>
            <option value="VALUE">Ordenar: maior valor</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {(
              [
                ['ALL', 'Todos'],
                ['PENDING', 'Pendente'],
                ['PARTIAL', 'Parcial'],
                ['OVERDUE', 'Vencido'],
                ['RECEIVED', 'Quitado'],
              ] as [typeof statusFilter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  statusFilter === id ? 'bg-zinc-900 text-white shadow-2xs' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                ['ALL', 'Qualquer data'],
                ['TODAY', 'Vence hoje'],
                ['WEEK', '7 dias'],
                ['MONTH', '30 dias'],
                ['OVERDUE', 'Vencidas'],
              ] as [typeof periodFilter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriodFilter(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap border ${
                  periodFilter === id
                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista por cliente */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-zinc-200/80 p-4">
              <TableRowSkeleton columns={4} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center">
            <ErpEmptyState
              icon={Wallet}
              title="Nenhum pendente por aqui"
              description="Cadastre a primeira venda parcelada para começar o crediário."
            />
          </div>
        ) : (
          filtered.map((g: any) => {
            const meta = STATUS_META[g.status as DisplayStatus];
            const isOpen = expanded.includes(g.key);
            const wa = cobrançaHref(g);
            return (
              <div key={g.key} className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(g.key)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-zinc-50/60 transition cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white font-black text-sm flex items-center justify-center shrink-0">
                    {(g.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-zinc-900 truncate">{g.name}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      {g.phone || 'Sem telefone'} · {g.paidCount}/{g.totalCount} parcela(s) ·{' '}
                      {g.totalPending > 0 ? `vence ${fmtDate(g.nextDue)}` : 'quitado'}
                      {g.maxOverdue > 0 && <span className="text-rose-600 font-bold"> · {g.maxOverdue}d em atraso</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-black text-zinc-900">{brl(g.totalPending)}</p>
                    <p className="text-[10px] text-zinc-400 font-mono">de {brl(g.totalPurchase)}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${meta.className}`}>
                    {meta.label}
                  </Badge>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-100 p-4 space-y-3 bg-zinc-50/40">
                    {/* Parcelas */}
                    {g.bills.map((b: any) => {
                      const st = billStatus(b, today);
                      const m = STATUS_META[st];
                      return (
                        <div key={b.id} className="bg-white rounded-xl border border-zinc-200/80 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-zinc-900 truncate">
                                {b.installmentNumber && b.installmentsTotal
                                  ? `${b.installmentNumber}/${b.installmentsTotal} · `
                                  : ''}
                                {b.description}
                              </p>
                              <p className="text-[11px] text-zinc-500 font-mono">
                                Compra {fmtDate(b.purchaseDate || b.createdAt)} · Vence {fmtDate(b.dueDate)}
                                {st === 'OVERDUE' && (
                                  <span className="text-rose-600 font-bold"> · {daysOverdue(b, today)}d em atraso</span>
                                )}
                              </p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${m.className}`}>
                              {m.label}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="font-mono text-zinc-600">
                              {brl(effectivePaid(b))} pagos de {brl(b.amountCents)}
                            </span>
                            <span className="font-mono font-black text-zinc-900">falta {brl(pendingOf(b))}</span>
                          </div>
                          {pendingOf(b) > 0 && (
                            <div className="flex items-center justify-end gap-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPayBill(b);
                                  setPayAmount(
                                    (pendingOf(b) / 100).toFixed(2).replace('.', ','),
                                  );
                                  setPayMethod('Pix');
                                  setPayNotes('');
                                }}
                                className="h-8 px-3 rounded-lg text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Registrar pagamento
                              </Button>
                            </div>
                          )}
                          {/* Histórico da parcela */}
                          {(b.payments || []).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-zinc-100 space-y-1">
                              {(b.payments || []).map((p: any) => (
                                <p key={p.id} className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
                                  <History className="w-3 h-3 text-zinc-400" />
                                  {fmtDate(p.paidAt)} · {brl(p.amountCents)}
                                  {p.method ? ` · ${p.method}` : ''}
                                  {p.notes ? ` · ${p.notes}` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Histórico geral do cliente */}
                    {g.history.length > 0 && (
                      <details className="bg-white rounded-xl border border-zinc-200/80 px-3 py-2 text-xs">
                        <summary className="font-bold text-zinc-700 cursor-pointer">
                          Histórico de pagamentos ({g.history.length})
                        </summary>
                        <div className="mt-2 space-y-1 pb-1">
                          {g.history.map((p: any, i: number) => (
                            <p key={p.id || i} className="text-[11px] text-zinc-500 font-mono">
                              {fmtDate(p.paidAt)} · {brl(p.amountCents)}
                              {p.method ? ` · ${p.method}` : ''} · {p.billDescription || ''}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Ações do cliente */}
                    <div className="flex items-center justify-end gap-2">
                      {g.totalPending > 0 && wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="h-8 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 transition"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Enviar cobrança
                        </a>
                      )}
                      {g.totalPending > 0 && !wa && (
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Sem telefone para cobrança
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const firstGroup = g.bills.find((b: any) => b.groupId)?.groupId;
                          if (!firstGroup) return toast.error('Venda sem agrupamento.');
                          if (confirm(`Remover toda a venda de ${g.name}? O pendente sai do saldo.`)) {
                            deleteGroupMutation.mutate(firstGroup);
                          }
                        }}
                        className="h-8 w-8 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"
                        title="Remover venda"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: registrar pagamento */}
      <Dialog open={!!payBill} onOpenChange={(open) => !open && setPayBill(null)}>
        <DialogContent className="max-w-sm bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">Registrar pagamento</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              {payBill?.description} · falta {payBill ? brl(pendingOf(payBill)) : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaySubmit} className="space-y-3 py-2 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Valor recebido (R$) *</label>
              <Input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="h-10 font-mono font-bold rounded-xl"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Forma de pagamento</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[...METHODS, 'Outro'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMethod(m)}
                    className={`h-9 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      payMethod === m
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Observação</label>
              <Input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Ex: PIX comprovante 123"
                className="h-9 text-xs rounded-xl"
                maxLength={120}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPayBill(null)} className="rounded-xl h-9 text-xs">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={payMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-bold"
              >
                {payMutation.isPending ? 'Registrando...' : 'Confirmar recebimento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: cadastrar pagamento pendente */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">Cadastrar pagamento pendente</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Venda no crediário com parcelas, entrada e vencimentos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegisterSubmit} className="space-y-3 py-2 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Cliente *</label>
              {!regNewCustomer ? (
                <div className="flex gap-2">
                  <select
                    value={regCustomerId}
                    onChange={(e) => setRegCustomerId(e.target.value)}
                    className="flex-1 h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="">Selecionar cliente...</option>
                    {customers.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRegNewCustomer(true);
                      setRegCustomerId('');
                    }}
                    className="h-10 rounded-xl text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Novo
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Nome do cliente *"
                    className="h-10 text-xs rounded-xl"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="WhatsApp"
                      className="h-10 text-xs font-mono rounded-xl"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setRegNewCustomer(false)}
                      className="h-10 text-xs rounded-xl shrink-0"
                    >
                      Usar lista
                    </Button>
                  </div>
                </div>
              )}
              {regSelectedCustomer && (
                <p className="text-[11px] text-zinc-500 mt-1">
                  {regSelectedCustomer.phone || 'Sem telefone'} ·{' '}
                  {regCustomerOpen.length > 0
                    ? `${regCustomerOpen.length} conta(s) em aberto (${brl(
                        regCustomerOpen.reduce((s: number, b: any) => s + pendingOf(b), 0),
                      )})`
                    : 'sem pendências — cliente em dia'}
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Descrição da venda</label>
              <Input
                value={regDescription}
                onChange={(e) => setRegDescription(e.target.value)}
                placeholder="Ex: Vestido + acessórios"
                className="h-10 text-xs rounded-xl"
                maxLength={120}
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Venda relacionada (opcional)</label>
              <select
                value={regOrderId}
                onChange={(e) => setRegOrderId(e.target.value)}
                className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
              >
                <option value="">Sem vínculo</option>
                {orders.slice(0, 30).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    Pedido #{o.orderNumber || o.id.slice(0, 6)} · {brl(o.totalCents)} ·{' '}
                    {o.createdAt ? fmtDate(o.createdAt) : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Total (R$) *</label>
                <Input
                  value={regTotal}
                  onChange={(e) => setRegTotal(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="h-10 text-xs font-mono font-bold rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Entrada (R$)</label>
                <Input
                  value={regInitial}
                  onChange={(e) => setRegInitial(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="h-10 text-xs font-mono rounded-xl"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Pendente</label>
                <div className="h-10 px-3 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center font-mono font-black text-zinc-900">
                  {brl(regPendingCents)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Parcelas</label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={regCount}
                  onChange={(e) => setRegCount(e.target.value)}
                  className="h-10 text-xs font-mono rounded-xl"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Por parcela</label>
                <div className="h-10 px-3 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center font-mono font-bold text-zinc-700">
                  {brl(regPerCents)}
                </div>
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Status</label>
                <div className="h-10">
                  <Badge variant="outline" className={`text-[11px] font-semibold ${STATUS_META[regStatusPreview].className}`}>
                    {regStatusPreview === 'RECEIVED'
                      ? 'Quitado'
                      : STATUS_META[regStatusPreview].label}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Data da compra</label>
                <Input
                  type="date"
                  value={regPurchaseDate}
                  onChange={(e) => setRegPurchaseDate(e.target.value)}
                  className="h-10 text-xs font-mono rounded-xl"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">1º vencimento</label>
                <Input
                  type="date"
                  value={regFirstDue}
                  onChange={(e) => setRegFirstDue(e.target.value)}
                  className="h-10 text-xs font-mono rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Intervalo parcelas</label>
                <select
                  value={regInterval}
                  onChange={(e) => setRegInterval(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold"
                >
                  <option value="7">Semanal</option>
                  <option value="15">Quinzenal</option>
                  <option value="30">Mensal</option>
                  <option value="custom">Personalizado...</option>
                </select>
              </div>
              {regInterval === 'custom' ? (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">A cada (dias)</label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={regCustomInterval}
                    onChange={(e) => setRegCustomInterval(e.target.value)}
                    className="h-10 text-xs font-mono rounded-xl"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Forma de pagamento</label>
                  <select
                    value={regMethod}
                    onChange={(e) => setRegMethod(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {regInterval === 'custom' && (
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Forma de pagamento</label>
                <select
                  value={regMethod}
                  onChange={(e) => setRegMethod(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Observações</label>
              <Input
                value={regNotes}
                onChange={(e) => setRegNotes(e.target.value)}
                placeholder="Ex: cliente paga todo dia 10"
                className="h-10 text-xs rounded-xl"
                maxLength={300}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={closeRegister} className="rounded-xl h-10 text-xs">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={registerMutation.isPending}
                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-10 text-xs font-bold"
              >
                {registerMutation.isPending ? 'Cadastrando...' : 'Cadastrar pagamento pendente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingPaymentsPage;
