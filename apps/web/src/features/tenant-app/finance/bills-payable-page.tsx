import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Search,
  Plus,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Truck,
  Filter,
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
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CATEGORIES = [
  'FORNECEDOR',
  'ALUGUEL',
  'ENERGIA',
  'AGUA',
  'FOLHA',
  'IMPOSTOS',
  'MANUTENCAO',
  'OUTROS',
];

export const BillsPayablePage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'PAID'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('FORNECEDOR');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  // Conta fixa (aluguel, energia, internet): vence todo mês no mesmo dia.
  const [isRecurring, setIsRecurring] = useState(false);
  const [dueDay, setDueDay] = useState('10');

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills-payable', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/finance/payables`),
    refetchInterval: 15000,
  });

  // Alertas: vencidas/vencendo hoje (crítico) e em até 3 dias (aviso).
  const { data: billAlerts } = useQuery({
    queryKey: ['bills-alerts', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/finance/bills/alerts`).catch(() => null),
    enabled: !!slug,
    refetchInterval: 60000,
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/marketplace/suppliers`).catch(() => []),
    enabled: modalOpen,
  });

  const suppliers = Array.isArray(suppliersData) ? suppliersData : suppliersData?.suppliers || [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/finance/payables`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills-payable', slug] });
      queryClient.invalidateQueries({ queryKey: ['bills-alerts', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-dashboard', slug] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      toast.success('Conta a pagar cadastrada com sucesso!');
      setModalOpen(false);
      setDescription('');
      setSupplierId('');
      setAmount('');
      setDueDate('');
      setNotes('');
      setIsRecurring(false);
      setDueDay('10');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao cadastrar conta'),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/tenant-app/${slug}/finance/payables/${id}/pay`, {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['bills-payable', slug] });
      queryClient.invalidateQueries({ queryKey: ['bills-alerts', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-dashboard', slug] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      toast.success(
        res?.next
          ? `Pagamento registrado! Próxima gerada para ${new Date(res.next.dueDate).toLocaleDateString('pt-BR')}.`
          : 'Pagamento registrado com sucesso!',
      );
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao registrar pagamento'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/finance/payables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills-payable', slug] });
      toast.success('Conta removida com sucesso');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao remover conta'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return toast.error('Informe a descrição');
    const amountCents = Math.round(parseFloat(amount.replace(',', '.') || '0') * 100);
    if (isNaN(amountCents) || amountCents <= 0) return toast.error('Informe um valor válido');
    const day = Math.min(31, Math.max(1, parseInt(dueDay, 10) || 0));
    if (isRecurring && !day) return toast.error('Informe o dia fixo do vencimento (1-31)');
    // Conta fixa pode ir só com o dia: o primeiro vencimento é o próximo dia.
    if (!isRecurring && !dueDate) return toast.error('Informe a data de vencimento');

    createMutation.mutate({
      description,
      supplierId: supplierId || null,
      category,
      amountCents,
      dueDate: dueDate || undefined,
      notes,
      isRecurring,
      dueDay: isRecurring ? day : undefined,
    });
  };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const enrichedBills = useMemo(() => {
    return bills.map((b: any) => {
      const due = new Date(b.dueDate);
      const isOverdue = b.status === 'PENDING' && due < startOfDay;
      return {
        ...b,
        isOverdue,
      };
    });
  }, [bills, startOfDay]);

  const filteredBills = useMemo(() => {
    return enrichedBills.filter((b: any) => {
      const matchSearch =
        b.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.supplier?.tradeName && b.supplier.tradeName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.category && b.category.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      if (statusFilter === 'PENDING') return b.status === 'PENDING' && !b.isOverdue;
      if (statusFilter === 'OVERDUE') return b.isOverdue;
      if (statusFilter === 'PAID') return b.status === 'PAID';
      return true;
    });
  }, [enrichedBills, searchTerm, statusFilter]);

  // KPIs
  const dueTodayCents = enrichedBills
    .filter((b: any) => {
      if (b.status !== 'PENDING') return false;
      const due = new Date(b.dueDate);
      return due.toDateString() === now.toDateString();
    })
    .reduce((s: number, b: any) => s + b.amountCents, 0);

  const pendingTotalCents = enrichedBills
    .filter((b: any) => b.status === 'PENDING')
    .reduce((s: number, b: any) => s + b.amountCents, 0);

  const paidMonthCents = enrichedBills
    .filter((b: any) => b.status === 'PAID')
    .reduce((s: number, b: any) => s + b.amountCents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-rose-600" />
            Contas a Pagar
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Gestão de despesas operacionais, boletos de fornecedores e controle de datas de vencimento.
          </p>
        </div>

        <Button
          onClick={() => setModalOpen(true)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Conta a Pagar</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Vence Hoje
          </span>
          <p className="text-2xl font-bold text-amber-600 mt-1 font-mono">{brl(dueTodayCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Compromissos para o dia</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total a Pagar (Pendente)
          </span>
          <p className="text-2xl font-bold text-rose-600 mt-1 font-mono">{brl(pendingTotalCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Previsão total em aberto</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total Já Quitado
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">{brl(paidMonthCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Baixas efetuadas</span>
        </div>
      </div>

      {/* Alertas de vencimento: crítico = vencida ou vence hoje */}
      {((billAlerts?.overdue?.length || 0) + (billAlerts?.dueToday?.length || 0) + (billAlerts?.dueSoon?.length || 0)) > 0 && (
        <div className="space-y-2">
          {(billAlerts?.overdue?.length || 0) > 0 && (
            <div className="p-3.5 rounded-2xl bg-rose-600 text-white flex items-start gap-2.5 shadow-md">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-black uppercase tracking-wide">
                  {billAlerts.overdue.length} conta(s) vencida(s) — ação imediata
                </p>
                {billAlerts.overdue.slice(0, 3).map((a: any) => (
                  <p key={a.id} className="font-medium mt-0.5">
                    {a.description} • {brl(a.amountCents)} • venceu em{' '}
                    {new Date(a.dueDate).toLocaleDateString('pt-BR')}
                  </p>
                ))}
              </div>
            </div>
          )}
          {(billAlerts?.dueToday?.length || 0) > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500 text-zinc-950 flex items-start gap-2.5 shadow-md">
              <Clock className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-black uppercase tracking-wide">Vence hoje</p>
                {billAlerts.dueToday.slice(0, 3).map((a: any) => (
                  <p key={a.id} className="font-medium mt-0.5">
                    {a.description} • {brl(a.amountCents)}
                  </p>
                ))}
              </div>
            </div>
          )}
          {(billAlerts?.dueSoon?.length || 0) > 0 && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-black">Vencendo em até 3 dias: </span>
                {billAlerts.dueSoon
                  .slice(0, 4)
                  .map((a: any) => `${a.description} (${brl(a.amountCents)})`)
                  .join(' • ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'Todas' },
              { id: 'PENDING', label: 'Em Aberto' },
              { id: 'OVERDUE', label: 'Vencidas' },
              { id: 'PAID', label: 'Pagas' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar descrição, fornecedor..."
              className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Fornecedor</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} columns={7} />)
              ) : filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <ErpEmptyState
                      icon={DollarSign}
                      title="Nenhuma conta encontrada"
                      description="Cadastre novas despesas e boletos para manter o controle do fluxo de caixa."
                    />
                  </td>
                </tr>
              ) : (
                filteredBills.map((b: any) => {
                  return (
                    <tr key={b.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-3 px-4 font-semibold text-zinc-900">
                        <span className="flex items-center gap-1.5">
                          {b.description}
                          {b.isRecurring && (
                            <span
                              title={`Conta fixa — vence todo dia ${b.dueDay || ''}`}
                              className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 shrink-0"
                            >
                              Fixa{b.dueDay ? ` dia ${b.dueDay}` : ''}
                            </span>
                          )}
                        </span>
                        {b.notes && <span className="block text-[10px] text-zinc-400 font-normal">{b.notes}</span>}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] bg-zinc-50 text-zinc-700">
                          {b.category}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                        {b.supplier?.tradeName || b.supplier?.companyName || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-700 whitespace-nowrap">
                        {new Date(b.dueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {brl(b.amountCents)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {b.status === 'PAID' ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                            Pago
                          </Badge>
                        ) : b.isOverdue ? (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold">
                            Vencido
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                            Pendente
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {b.status !== 'PAID' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => payMutation.mutate(b.id)}
                              disabled={payMutation.isPending}
                              className="h-7 px-2.5 rounded-lg text-xs font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Baixar
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Deseja excluir esta conta?')) deleteMutation.mutate(b.id);
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nova Conta */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-rose-600" />
              Cadastrar Conta a Pagar
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Informe os dados da despesa para controle de vencimentos e baixa financeira.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Descrição da Despesa *</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Fatura Fornecedor Ambev, Conta de Luz..."
                className="h-9 text-xs rounded-xl"
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Fornecedor (Opcional)</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">Nenhum / Avulso</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName || s.companyName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Valor (R$) *</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="h-9 text-xs font-mono rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  {isRecurring ? 'Primeiro vencimento (opcional)' : 'Data de Vencimento *'}
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 text-xs font-mono rounded-xl"
                  required={!isRecurring}
                />
                {isRecurring && (
                  <span className="text-[10px] text-zinc-400 mt-1 block">
                    Vazio = próximo dia {dueDay || '—'} automaticamente.
                  </span>
                )}
              </div>
            </div>

            {/* Conta fixa/recorrente */}
            <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span className="font-bold text-zinc-800">Conta fixa (repete todo mês)</span>
              </label>
              {isRecurring && (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Dia do vencimento *</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={dueDay}
                      onChange={(e) => setDueDay(e.target.value)}
                      className="h-9 text-xs font-mono rounded-xl w-24"
                      required
                    />
                    <span className="text-[11px] text-zinc-500">
                      Ex: aluguel dia 10, energia dia 15. Ao dar baixa, a próxima é gerada sozinha.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Observações</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Parcela 2 de 5, código de barras do boleto..."
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-xl h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-9 text-xs font-semibold"
              >
                {createMutation.isPending ? 'Cadastrando...' : 'Salvar Conta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
