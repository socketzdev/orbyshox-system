import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Search,
  Plus,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  User,
  CreditCard,
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

export const BillsReceivablePage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'RECEIVED'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState<'FIADO' | 'CREDIT_CARD' | 'OTHER'>('FIADO');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills-receivable', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/finance/receivables`),
    refetchInterval: 15000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/customers`).catch(() => []),
    enabled: modalOpen,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/finance/receivables`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills-receivable', slug] });
      queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-dashboard', slug] });
      toast.success('Recebível registrado com sucesso!');
      setModalOpen(false);
      setDescription('');
      setCustomerId('');
      setAmount('');
      setDueDate('');
      setNotes('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao cadastrar recebível'),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/tenant-app/${slug}/finance/receivables/${id}/receive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills-receivable', slug] });
      queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-dashboard', slug] });
      toast.success('Recebimento registrado e fiado do cliente abatido!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao registrar recebimento'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/finance/receivables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills-receivable', slug] });
      toast.success('Registro removido com sucesso');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao remover registro'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return toast.error('Informe a descrição');
    const amountCents = Math.round(parseFloat(amount.replace(',', '.') || '0') * 100);
    if (isNaN(amountCents) || amountCents <= 0) return toast.error('Informe um valor válido');
    if (!dueDate) return toast.error('Informe a data de vencimento');

    createMutation.mutate({
      description,
      customerId: customerId || null,
      type,
      amountCents,
      dueDate,
      notes,
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
        (b.customer?.name && b.customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.order?.orderNumber && String(b.order.orderNumber).includes(searchTerm));

      if (!matchSearch) return false;

      if (statusFilter === 'PENDING') return b.status === 'PENDING' && !b.isOverdue;
      if (statusFilter === 'OVERDUE') return b.isOverdue;
      if (statusFilter === 'RECEIVED') return b.status === 'RECEIVED';
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

  const receivedMonthCents = enrichedBills
    .filter((b: any) => b.status === 'RECEIVED')
    .reduce((s: number, b: any) => s + b.amountCents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Contas a Receber & Fiado
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Controle de vendas a prazo, fiado de clientes com limite de crédito e recebíveis com baixa automática.
          </p>
        </div>

        <Button
          onClick={() => setModalOpen(true)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-4 text-xs font-semibold flex items-center gap-2 shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Lançar Recebível / Fiado</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            A Receber Hoje
          </span>
          <p className="text-2xl font-bold text-amber-600 mt-1 font-mono">{brl(dueTodayCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Previsão de cobrança do dia</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total em Aberto (Fiado)
          </span>
          <p className="text-2xl font-bold text-blue-600 mt-1 font-mono">{brl(pendingTotalCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Carteira de clientes a prazo</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total Já Recebido
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">{brl(receivedMonthCents)}</p>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Recebimentos liquidados</span>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'PENDING', label: 'Em Aberto / Fiado' },
              { id: 'OVERDUE', label: 'Vencidos / Cobrança' },
              { id: 'RECEIVED', label: 'Recebidos' },
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
              placeholder="Buscar cliente, cupom, descrição..."
              className="pl-8 h-9 text-xs rounded-xl bg-zinc-50/50 border-zinc-200 focus:bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Tipo</th>
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
                      icon={Wallet}
                      title="Nenhum recebível encontrado"
                      description="Vendas marcadas como 'Fiado' no PDV e cobranças avulsas serão listadas aqui."
                    />
                  </td>
                </tr>
              ) : (
                filteredBills.map((b: any) => {
                  return (
                    <tr key={b.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-3 px-4 font-semibold text-zinc-900">
                        {b.description}
                        {b.order?.orderNumber && (
                          <span className="block text-[10px] text-zinc-400 font-normal">
                            Cupom #{b.order.orderNumber}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-700 whitespace-nowrap">
                        {b.customer?.name || 'Cliente Avulso'}
                        {b.customer?.phone && (
                          <span className="block text-[10px] text-zinc-400 font-normal">{b.customer.phone}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${
                            b.type === 'FIADO'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                          }`}
                        >
                          {b.type === 'FIADO' ? 'Fiado (Caderneta)' : b.type === 'CREDIT_CARD' ? 'Cartão' : 'Outro'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-700 whitespace-nowrap">
                        {new Date(b.dueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {brl(b.amountCents)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {b.status === 'RECEIVED' ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                            Recebido
                          </Badge>
                        ) : b.isOverdue ? (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold">
                            Atrasado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold">
                            Pendente
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {b.status !== 'RECEIVED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => receiveMutation.mutate(b.id)}
                              disabled={receiveMutation.isPending}
                              className="h-7 px-2.5 rounded-lg text-xs font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Receber
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Deseja excluir este recebível?')) deleteMutation.mutate(b.id);
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

      {/* Modal: Novo Recebível */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Lançar Conta a Receber / Fiado
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Registre débitos de clientes ou valores a receber para controle de fluxo de caixa.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Cliente *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                required
              >
                <option value="">Selecione um cliente...</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.document ? `(CPF: ${c.document})` : ''} — Dívida: {brl(c.currentDebtCents || 0)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Descrição *</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Fiado de compras da semana, adiantamento..."
                className="h-9 text-xs rounded-xl"
                required
              />
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
                <label className="block font-semibold text-zinc-700 mb-1">Data de Vencimento *</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 text-xs font-mono rounded-xl"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Tipo de Recebível *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
              >
                <option value="FIADO">Fiado na Caderneta (A Prazo)</option>
                <option value="CREDIT_CARD">Recebível de Cartão</option>
                <option value="OTHER">Outros Recebíveis</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Observações</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Prometeu pagar dia 10 junto com o pagamento"
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
                {createMutation.isPending ? 'Cadastrando...' : 'Salvar Recebível'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
