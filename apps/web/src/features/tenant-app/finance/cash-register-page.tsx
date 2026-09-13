import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  DollarSign,
  QrCode,
  CreditCard,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  TrendingUp,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export const CashRegisterPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [initialBalance, setInitialBalance] = useState('100,00');
  const [actualBalance, setActualBalance] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cash-register', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/cash-register`),
    refetchInterval: 10000,
  });

  const isOpen = data?.isOpen;
  const register = data?.register;
  const metrics = data?.metrics || { totalSalesCents: 0, orderCount: 0, byMethod: {} };

  const openMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/cash-register/open`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register', slug] });
      setOpenModal(false);
      toast.success('Turno de caixa aberto com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao abrir caixa'),
  });

  const closeMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/cash-register/close`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-automations', slug] });
      setCloseModal(false);
      setActualBalance('');
      toast.success('Caixa fechado com sucesso! Resumo DRE gerado automaticamente.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao fechar caixa'),
  });

  const handleOpen = (e: React.FormEvent) => {
    e.preventDefault();
    const balanceCents = Math.round(parseFloat(initialBalance.replace(',', '.') || '0') * 100);
    openMutation.mutate({ initialBalanceCents: balanceCents, notes });
  };

  const handleClose = (e: React.FormEvent) => {
    e.preventDefault();
    const balanceCents = Math.round(parseFloat(actualBalance.replace(',', '.') || '0') * 100);
    closeMutation.mutate({ actualBalanceCents: balanceCents, notes });
  };

  const expectedFinalCents = (register?.initialBalanceCents || 0) + metrics.totalSalesCents;

  // Actual balance difference calculation
  const enteredActualCents = Math.round(parseFloat(actualBalance.replace(',', '.') || '0') * 100);
  const diffCents = enteredActualCents - expectedFinalCents;

  // Shift duration
  const shiftDuration = useMemo(() => {
    if (!register?.openedAt) return '';
    const start = new Date(register.openedAt).getTime();
    const now = Date.now();
    const diffMin = Math.max(0, Math.floor((now - start) / 60000));
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    if (hours === 0) return `${mins} min`;
    return `${hours}h ${mins}min`;
  }, [register?.openedAt]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 bg-white rounded-2xl border border-zinc-200" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-64 bg-white rounded-2xl border border-zinc-200" />
          <div className="h-64 bg-white rounded-2xl border border-zinc-200 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const totalSales = metrics.totalSalesCents || 1; // avoid / 0
  const pixPercent = Math.round(((metrics.byMethod?.PIX || 0) / totalSales) * 100);
  const cashPercent = Math.round(((metrics.byMethod?.CASH || 0) / totalSales) * 100);
  const creditPercent = Math.round(((metrics.byMethod?.CREDIT_CARD || 0) / totalSales) * 100);
  const debitPercent = Math.round(((metrics.byMethod?.DEBIT_CARD || 0) / totalSales) * 100);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-zinc-700" />
              Controle de Caixa & Conciliação DRE
            </h1>
            {isOpen ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                Caixa Aberto
              </Badge>
            ) : (
              <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200 text-[11px] font-bold">
                <Lock className="w-3 h-3 mr-1" />
                Caixa Fechado
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Abertura, conferência cega, quebra de caixa e conciliação automática de métodos de pagamento.
          </p>
        </div>

        {isOpen ? (
          <Button
            size="sm"
            onClick={() => setCloseModal(true)}
            className="h-9 px-4 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Fechar Caixa & Gerar DRE</span>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setOpenModal(true)}
            className="h-9 px-4 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-sm flex items-center gap-1.5"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>Abrir Turno de Caixa</span>
          </Button>
        )}
      </div>

      {isOpen ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Resumo Geral */}
          <Card className="p-6 bg-white border-zinc-200/80 rounded-2xl shadow-soft space-y-4 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                Turno Atual em Operação
              </h3>
              {shiftDuration && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {shiftDuration}
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs divide-y divide-zinc-100">
              <div className="pt-2 flex justify-between">
                <span className="text-zinc-500">Operador</span>
                <span className="font-semibold text-zinc-800">{register.openedBy?.name}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-zinc-500">Horário de Abertura</span>
                <span className="font-mono text-zinc-700">
                  {new Date(register.openedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-zinc-500">Fundo de Troco Inicial</span>
                <span className="font-bold text-zinc-900 font-mono">
                  R$ {(register.initialBalanceCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-zinc-500">Total de Vendas no Turno</span>
                <span className="font-bold text-emerald-600 font-mono">
                  + R$ {(metrics.totalSalesCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="pt-3 flex justify-between text-sm font-bold text-zinc-900">
                <span>Saldo Contábil Esperado</span>
                <span className="font-mono">R$ {(expectedFinalCents / 100).toFixed(2)}</span>
              </div>
            </div>
          </Card>

          {/* Discriminação por Forma de Pagamento */}
          <Card className="p-6 bg-white border-zinc-200/80 rounded-2xl shadow-soft lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Conciliação por Forma de Pagamento</h3>
              <span className="text-[11px] text-zinc-400 font-mono">
                {metrics.orderCount} {metrics.orderCount === 1 ? 'venda' : 'vendas'} registradas
              </span>
            </div>

            {/* Distribution Progress Bar */}
            {metrics.totalSalesCents > 0 && (
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded-full bg-zinc-100 overflow-hidden flex">
                  {pixPercent > 0 && (
                    <div style={{ width: `${pixPercent}%` }} className="bg-emerald-500 h-full" title={`Pix: ${pixPercent}%`} />
                  )}
                  {cashPercent > 0 && (
                    <div style={{ width: `${cashPercent}%` }} className="bg-amber-500 h-full" title={`Dinheiro: ${cashPercent}%`} />
                  )}
                  {creditPercent > 0 && (
                    <div style={{ width: `${creditPercent}%` }} className="bg-blue-500 h-full" title={`Crédito: ${creditPercent}%`} />
                  )}
                  {debitPercent > 0 && (
                    <div style={{ width: `${debitPercent}%` }} className="bg-indigo-500 h-full" title={`Débito: ${debitPercent}%`} />
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span className="text-[11px] font-semibold">Pix</span>
                  </div>
                  {metrics.totalSalesCents > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400">{pixPercent}%</span>
                  )}
                </div>
                <p className="text-base font-bold text-zinc-900 font-mono">
                  R$ {((metrics.byMethod?.PIX || 0) / 100).toFixed(2)}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                    <span className="text-[11px] font-semibold">Dinheiro</span>
                  </div>
                  {metrics.totalSalesCents > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400">{cashPercent}%</span>
                  )}
                </div>
                <p className="text-base font-bold text-zinc-900 font-mono">
                  R$ {((metrics.byMethod?.CASH || 0) / 100).toFixed(2)}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span className="text-[11px] font-semibold">Crédito</span>
                  </div>
                  {metrics.totalSalesCents > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400">{creditPercent}%</span>
                  )}
                </div>
                <p className="text-base font-bold text-zinc-900 font-mono">
                  R$ {((metrics.byMethod?.CREDIT_CARD || 0) / 100).toFixed(2)}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    <span className="text-[11px] font-semibold">Débito</span>
                  </div>
                  {metrics.totalSalesCents > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400">{debitPercent}%</span>
                  )}
                </div>
                <p className="text-base font-bold text-zinc-900 font-mono">
                  R$ {((metrics.byMethod?.DEBIT_CARD || 0) / 100).toFixed(2)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-12 text-center bg-white border border-zinc-200/80 rounded-2xl shadow-soft max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-3 text-zinc-600 border border-zinc-200/60 shadow-xs">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">Caixa Fechado</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Nenhum turno de vendas está aberto no momento. Abra o caixa com um fundo de troco para liberar os registros de venda.
          </p>
          <Button
            size="sm"
            onClick={() => setOpenModal(true)}
            className="mt-5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold px-5 h-9 rounded-xl shadow-sm"
          >
            Abrir Caixa Agora
          </Button>
        </Card>
      )}

      {/* Modal: Abertura de Caixa */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-6 sm:p-7 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Abrir Novo Turno de Caixa
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Informe o valor em dinheiro disponível na gaveta para troco inicial.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleOpen} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1.5">
                Fundo de Troco Inicial (R$) *
              </label>
              <Input
                placeholder="100,00"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="h-11 text-base font-bold font-mono rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-800 transition"
                required
                autoFocus
              />
              <div className="flex items-center gap-2 mt-2.5">
                {['50,00', '100,00', '200,00'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setInitialBalance(val)}
                    className="h-8 px-3 text-xs font-bold font-mono bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-xl shadow-2xs transition-all cursor-pointer"
                  >
                    R$ {val}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1.5">
                Observação do Turno (opcional)
              </label>
              <Input
                placeholder="Ex: Turno da Manhã"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-10 text-xs font-medium rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-800 transition"
              />
            </div>

            <DialogFooter className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenModal(false)}
                className="h-10 px-4 text-xs font-bold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl shadow-2xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={openMutation.isPending}
                className="h-10 px-5 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                {openMutation.isPending ? 'Abrindo...' : 'Confirmar e Abrir Caixa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Fechamento de Caixa */}
      <Dialog open={closeModal} onOpenChange={setCloseModal}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-6 sm:p-7 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-zinc-700" />
              Fechar Turno & Gerar Conferência
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Realize a contagem do dinheiro em gaveta para a conferência cega.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleClose} className="space-y-4 mt-2">
            <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/80 text-xs space-y-2">
              <div className="flex justify-between text-zinc-600 font-medium">
                <span>Vendas registradas no turno:</span>
                <span className="font-bold text-zinc-900 font-mono">
                  R$ {(metrics.totalSalesCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600 font-medium">
                <span>Saldo contábil esperado (fundo + vendas):</span>
                <span className="font-bold text-zinc-900 font-mono">
                  R$ {(expectedFinalCents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1.5">
                Valor Total Contado em Caixa (R$) *
              </label>
              <Input
                placeholder="Informe o valor contado na gaveta"
                value={actualBalance}
                onChange={(e) => setActualBalance(e.target.value)}
                className="h-11 text-base font-bold font-mono rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-800 transition"
                required
                autoFocus
              />
            </div>

            {enteredActualCents > 0 && (
              <div
                className={`p-3.5 rounded-2xl border flex justify-between font-bold text-xs ${
                  diffCents === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : diffCents > 0
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <span>
                  {diffCents === 0
                    ? 'Caixa 100% Exato:'
                    : diffCents > 0
                    ? 'Sobra de Caixa:'
                    : 'Quebra de Caixa (Falta):'}
                </span>
                <span className="font-mono">
                  {diffCents > 0 ? '+' : ''} R$ {(diffCents / 100).toFixed(2)}
                </span>
              </div>
            )}

            <DialogFooter className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseModal(false)}
                className="h-10 px-4 text-xs font-bold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl shadow-2xs cursor-pointer"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={closeMutation.isPending}
                className="h-10 px-5 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                {closeMutation.isPending ? 'Fechando...' : 'Confirmar e Encerrar Caixa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
