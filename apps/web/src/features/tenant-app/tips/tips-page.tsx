import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  SlidersHorizontal,
  Search,
  Eye,
  Pencil,
  Trash2,
  History,
  PiggyBank,
  Landmark,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReceiptDialog } from '../components/receipt-dialog';
import {
  CossBadge,
  CossPanel,
  CossTable,
  CossTableHeader,
  CossTableBody,
  CossTableRow,
  CossTableHead,
  CossTableCell,
  CossInput,
  CossLabel,
  CossSwitch,
  CossEmpty,
  CossSpinner,
} from '@/components/coss-ui';
import { cargoLabel } from '../team/team-roles';

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TIP_STATUS: Record<string, { label: string; variant: 'neutral' | 'success' | 'info' | 'warning' }> = {
  NOT_PAID: { label: 'Não pagou', variant: 'neutral' },
  PAID: { label: 'Pagou', variant: 'success' },
  OVER: { label: 'Pagou a mais', variant: 'info' },
  UNDER: { label: 'Pagou a menos', variant: 'warning' },
};

const ROLE_OPTIONS = [
  { code: 'WAITER', label: 'Garçom' },
  { code: 'KITCHEN', label: 'Cozinheiro/Chapista' },
  { code: 'CLEANING', label: 'Limpeza/Auxiliar' },
  { code: 'CASHIER', label: 'Operador de Caixa' },
  { code: 'STORE_MANAGER', label: 'Gerente' },
];

/**
 * Caixinha dos 10% — área separada do caixa da empresa.
 *
 * Regra principal: Nota → 10% pago → Caixa 10% → divisão semanal →
 * funcionários participantes. O 10% nasce vinculado à comanda (sem nota, sem
 * registro) e qualquer ajuste/exclusão exige motivo e deixa trilha de quem,
 * quando, antes, depois e por quê.
 */
export const TipsPage: React.FC = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'history' | 'payout' | 'config'>('history');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<any | null>(null);
  const [editPaid, setEditPaid] = useState('');
  const [editMethod, setEditMethod] = useState('PIX');
  const [editReason, setEditReason] = useState('');
  const [deletingFee, setDeletingFee] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['tips-summary'],
    queryFn: () => apiGet('/restaurant/tips/summary'),
    refetchInterval: 5000,
  });
  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['tips-history', statusFilter, search],
    queryFn: () =>
      apiGet('/restaurant/tips/history', {
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search.trim() || undefined,
      }),
    refetchInterval: 8000,
  });
  const { data: config } = useQuery({
    queryKey: ['tips-config'],
    queryFn: () => apiGet('/restaurant/tips/config'),
    refetchInterval: 30000,
  });
  const { data: preview, refetch: refetchPreview } = useQuery({
    queryKey: ['tips-payout-preview'],
    queryFn: () => apiGet('/restaurant/tips/payout-preview'),
    refetchInterval: 10000,
  });
  const { data: payouts = [] } = useQuery({
    queryKey: ['tips-payouts'],
    queryFn: () => apiGet('/restaurant/tips/payouts?limit=20'),
    refetchInterval: 15000,
  });
  const { data: detail } = useQuery({
    queryKey: ['tips-detail', detailId],
    queryFn: () => apiGet(`/restaurant/tips/history/${detailId}`),
    enabled: Boolean(detailId),
  });

  const [cfgPercent, setCfgPercent] = useState<string | null>(null);
  const [cfgRoles, setCfgRoles] = useState<string[] | null>(null);
  const percentBps = config?.percentBps ?? 1000;
  const eligibleRoles: string[] = useMemo(
    () => (Array.isArray(config?.eligibleRoles) ? config.eligibleRoles : []),
    [config],
  );

  const saveConfigMutation = useMutation({
    mutationFn: (payload: any) => apiPost('/restaurant/tips/config', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tips-config'] });
      queryClient.invalidateQueries({ queryKey: ['tips-summary'] });
      setCfgPercent(null);
      setCfgRoles(null);
      toast.success('Regras dos 10% salvas!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar'),
  });

  const payoutMutation = useMutation({
    mutationFn: () => apiPost('/restaurant/tips/payouts', {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['tips-summary'] });
      queryClient.invalidateQueries({ queryKey: ['tips-payout-preview'] });
      queryClient.invalidateQueries({ queryKey: ['tips-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['tips-history'] });
      toast.success(
        `Divididos ${brl(res?.totalCents || 0)} entre ${res?.participantCount || 0}! Caixa 10% baixado.`,
      );
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao dividir'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      apiPatch(`/restaurant/tips/history/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tips-history'] });
      queryClient.invalidateQueries({ queryKey: ['tips-detail', detailId] });
      queryClient.invalidateQueries({ queryKey: ['tips-summary'] });
      setEditingFee(null);
      toast.success('10% ajustado com trilha registrada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao ajustar'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiDelete(`/restaurant/tips/history/${id}`, { data: { reason } } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tips-history'] });
      queryClient.invalidateQueries({ queryKey: ['tips-summary'] });
      setDeletingFee(null);
      setDetailId(null);
      toast.success('Registro excluído com trilha!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir'),
  });

  const parseCents = (raw: string) => {
    const v = parseFloat((raw || '').replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
  };

  const openEdit = (fee: any) => {
    setEditingFee(fee);
    setEditPaid(fee.paidCents > 0 ? (fee.paidCents / 100).toFixed(2).replace('.', ',') : '');
    setEditMethod(fee.paymentMethod || 'PIX');
    setEditReason('');
  };

  const snapshot = detail?.snapshot || {};
  const orderNumbers: number[] = useMemo(() => {
    try {
      const arr = JSON.parse(detail?.orderNumbers || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [detail]);

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-16 font-sans">
      {/* Hero do caixa */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 p-6 sm:p-8 text-white shadow-lg">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-black/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-100 flex items-center gap-1.5">
                  <PiggyBank className="w-4 h-4" />
                  Caixa 10% separado da empresa
                </p>
                <p className="mt-1 text-4xl sm:text-5xl font-black tabular-nums tracking-tight">
                  {brl(summary?.balanceCents || 0)}
                </p>
                <p className="mt-1 text-xs text-amber-100 font-medium">
                  {brl(summary?.weekCents || 0)} acumulados na semana {summary?.weekCount || 0} pagamento(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CossBadge variant="default" className="!bg-white/15 !text-white !border-white/25 backdrop-blur">
                  Taxa {(percentBps / 100).toLocaleString('pt-BR')}%
                </CossBadge>
                <CossBadge variant="default" className="!bg-white/15 !text-white !border-white/25 backdrop-blur">
                  {summary?.undistributedCount || 0} a distribuir
                </CossBadge>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-1.5 bg-black/20 p-1 rounded-2xl w-fit backdrop-blur">
              <button
                type="button"
                onClick={() => setTab('history')}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  tab === 'history' ? 'bg-white text-zinc-950 shadow' : 'text-amber-100 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Histórico
              </button>
              <button
                type="button"
                onClick={() => setTab('payout')}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  tab === 'payout' ? 'bg-white text-zinc-950 shadow' : 'text-amber-100 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Dividir 10%
              </button>
              <button
                type="button"
                onClick={() => setTab('config')}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  tab === 'config' ? 'bg-white text-zinc-950 shadow' : 'text-amber-100 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Cargos e Taxa
              </button>
            </div>
      </div>

      {/* Histórico */}
      {tab === 'history' && (
        <CossPanel className="!p-0 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <CossInput
                placeholder="Buscar cliente, nota ou responsável..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!pl-10"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[{ id: 'ALL', label: 'Todos' }, ...Object.entries(TIP_STATUS).map(([id, s]) => ({ id, label: s.label }))].map(
                (o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setStatusFilter(o.id)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition cursor-pointer border ${
                      statusFilter === o.id
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 hover:border-zinc-400'
                    }`}
                  >
                    {o.label}
                  </button>
                ),
              )}
            </div>
          </div>

          {loadingHistory ? (
            <div className="p-12 flex flex-col items-center gap-2 text-xs text-zinc-400">
              <CossSpinner className="w-6 h-6" />
              Carregando histórico...
            </div>
          ) : history.length === 0 ? (
            <CossEmpty
              icon={<Landmark className="w-5 h-5" />}
              title="Nenhum 10% por aqui ainda"
              description="Os pagamentos entram sozinhos ao fechar as comandas."
            />
          ) : (
            <CossTable>
              <CossTableHeader>
                <tr>
                  <CossTableHead>Cliente / Nota</CossTableHead>
                  <CossTableHead className="text-right">Conta</CossTableHead>
                  <CossTableHead className="text-right">10% pago</CossTableHead>
                  <CossTableHead>Status</CossTableHead>
                  <CossTableHead>Responsável</CossTableHead>
                  <CossTableHead className="text-right">Ações</CossTableHead>
                </tr>
              </CossTableHeader>
              <CossTableBody>
                {history.map((fee: any) => {
                  const st = TIP_STATUS[fee.status] || TIP_STATUS.NOT_PAID;
                  const nums: number[] = (() => {
                    try {
                      const a = JSON.parse(fee.orderNumbers || '[]');
                      return Array.isArray(a) ? a : [];
                    } catch {
                      return [];
                    }
                  })();
                  return (
                    <CossTableRow key={fee.id}>
                      <CossTableCell>
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{fee.clientName || 'Consumidor'}</p>
                        <p className="text-[11px] text-zinc-400 font-mono">
                          #{nums.join(', #') || '—'} • {new Date(fee.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </CossTableCell>
                      <CossTableCell className="text-right font-mono tabular-nums">{brl(fee.billTotalCents)}</CossTableCell>
                      <CossTableCell className="text-right">
                        <p className="font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {brl(fee.paidCents)}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          sug. {brl(fee.suggestedCents)}{fee.paymentMethod ? ` • ${fee.paymentMethod}` : ''}
                        </p>
                      </CossTableCell>
                      <CossTableCell>
                        <CossBadge variant={st.variant}>{st.label}</CossBadge>
                        {(fee.editCount || 0) > 0 && (
                          <CossBadge
                            variant="warning"
                            className="ml-1.5"
                          >
                            <span title={`Ajustado por ${fee.lastEditBy || '?'}: ${fee.lastEditReason || ''}`}>
                              Ajustado {fee.editCount}x
                            </span>
                          </CossBadge>
                        )}
                      </CossTableCell>
                      <CossTableCell className="font-medium">{fee.responsibleName || '—'}</CossTableCell>
                      <CossTableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDetailId(fee.id);
                              setReceiptOpen(false);
                            }}
                            className="h-8 text-[11px] font-bold rounded-xl"
                            title="Ver nota completa"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(fee)}
                            className="h-8 w-8 p-0 rounded-xl"
                            title="Ajustar (com motivo + trilha)"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDeletingFee(fee);
                              setDeleteReason('');
                            }}
                            className="h-8 w-8 p-0 rounded-xl hover:border-rose-300 hover:bg-rose-50"
                            title="Excluir (com motivo + trilha)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CossTableCell>
                    </CossTableRow>
                  );
                })}
              </CossTableBody>
            </CossTable>
          )}
        </CossPanel>
      )}

      {/* ─── DIVIDIR ─── */}
      {tab === 'payout' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <CossPanel className="lg:col-span-2 !bg-gradient-to-b !from-emerald-600 !to-emerald-700 !border-emerald-700 text-white flex flex-col justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">A distribuir</p>
              <p className="mt-1 text-4xl font-black tabular-nums tracking-tight">{brl(preview?.totalCents || 0)}</p>
              <p className="mt-1 text-xs text-emerald-100 font-medium">
                {(preview?.participants || []).length} participante(s) • {brl(preview?.amountEachCents || 0)} cada
              </p>
              {(preview?.remainderCents || 0) > 0 && (
                <p className="mt-1 text-[11px] text-emerald-100">
                  Sobra de {brl(preview.remainderCents)} permanece no caixa.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetchPreview()}
                className="h-9 text-xs font-bold rounded-xl bg-white/10 border-white/25 text-white hover:bg-white/20"
              >
                Recalcular
              </Button>
              <Button
                size="sm"
                onClick={() => payoutMutation.mutate()}
                disabled={
                  payoutMutation.isPending || !(preview?.totalCents > 0) || (preview?.participants || []).length === 0
                }
                className="flex-1 h-11 text-xs font-black uppercase tracking-wider rounded-2xl bg-white text-emerald-800 hover:bg-emerald-50"
              >
                {payoutMutation.isPending ? 'Dividindo...' : 'Confirmar divisão'}
              </Button>
            </div>
          </CossPanel>

          <CossPanel className="lg:col-span-3">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500 mb-3">
              Quem recebe
            </p>
            {(preview?.participants || []).length === 0 ? (
              <CossEmpty
                icon={<Users className="w-5 h-5" />}
                title="Nada a distribuir"
                description="Sem valor acumulado ou sem participantes ativos."
              />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(preview?.participants || []).map((p: any) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200/70 dark:border-zinc-700/60"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black text-zinc-900 dark:text-zinc-100 truncate">{p.name}</p>
                      <p className="text-[11px] text-zinc-400">{cargoLabel(p.role, p.position)}</p>
                    </div>
                    <p className="text-sm font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                      {brl(p.amountCents)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CossPanel>

          <CossPanel className="lg:col-span-5">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500 mb-3">Divisões anteriores</p>
            {payouts.length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhuma divisão registrada ainda.</p>
            ) : (
              <CossTable>
                <CossTableHeader>
                  <tr>
                    <CossTableHead>Período</CossTableHead>
                    <CossTableHead className="text-right">Total</CossTableHead>
                    <CossTableHead className="text-right">Cada um</CossTableHead>
                    <CossTableHead>Confirmado por</CossTableHead>
                  </tr>
                </CossTableHeader>
                <CossTableBody>
                  {payouts.map((p: any) => (
                    <CossTableRow key={p.id}>
                      <CossTableCell>
                        <p className="font-bold">
                          {new Date(p.periodStart).toLocaleDateString('pt-BR')} →{' '}
                          {new Date(p.periodEnd).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {(p.participants || []).map((x: any) => x.name).join(' • ')}
                        </p>
                      </CossTableCell>
                      <CossTableCell className="text-right font-mono font-black tabular-nums">
                        {brl(p.totalCents)}
                      </CossTableCell>
                      <CossTableCell className="text-right font-mono tabular-nums">
                        {brl(p.amountEachCents)} <span className="text-zinc-400">×{p.participantCount}</span>
                      </CossTableCell>
                      <CossTableCell>
                        {p.confirmedByName || '—'}
                        <p className="text-[11px] text-zinc-400">{new Date(p.createdAt).toLocaleString('pt-BR')}</p>
                      </CossTableCell>
                    </CossTableRow>
                  ))}
                </CossTableBody>
              </CossTable>
            )}
          </CossPanel>
        </div>
      )}

      {/* ─── CONFIG ─── */}
      {tab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CossPanel className="space-y-4">
            <div>
              <CossLabel>Taxa sugerida (%)</CossLabel>
              <CossInput
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={cfgPercent ?? ((percentBps || 1000) / 100).toString().replace('.', ',')}
                onChange={(e) => setCfgPercent(e.target.value)}
                className="mt-1.5 max-w-[180px] font-mono font-black"
              />
              <p className="text-[11px] text-zinc-400 mt-1.5">Padrão 10%. Vale na hora para as próximas comandas.</p>
            </div>
            <Button
              onClick={() => {
                const pct = parseFloat((cfgPercent ?? '').replace(',', '.'));
                saveConfigMutation.mutate({
                  percentBps:
                    cfgPercent === null ? undefined : Math.round((Number.isFinite(pct) ? pct : 10) * 100),
                  eligibleRoles: cfgRoles ?? undefined,
                });
              }}
              disabled={saveConfigMutation.isPending}
              className="h-11 px-6 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-xs"
            >
              {saveConfigMutation.isPending ? 'Salvando...' : 'Salvar regras'}
            </Button>
          </CossPanel>

          <CossPanel className="space-y-2.5">
            <CossLabel>Cargos que participam da divisão</CossLabel>
            {ROLE_OPTIONS.map((r) => {
              const list = cfgRoles ?? eligibleRoles;
              const on = list.includes(r.code);
              return (
                <label
                  key={r.code}
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                    on
                      ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/10'
                      : 'border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-bold">{r.label}</span>
                  <CossSwitch
                    checked={on}
                    onCheckedChange={() => {
                      const cur = cfgRoles ?? eligibleRoles;
                      setCfgRoles(on ? cur.filter((c) => c !== r.code) : [...cur, r.code]);
                    }}
                  />
                </label>
              );
            })}
            <p className="text-[11px] text-zinc-400">
              Ex.: sem gerente, só a equipe operacional divide. Vale para a próxima divisão.
            </p>
          </CossPanel>
        </div>
      )}

      {/* ─── Detalhe + nota completa ─── */}
      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>10% — {detail?.clientName || 'Consumidor'}</DialogTitle>
            <DialogDescription>
              Pedidos #{orderNumbers.join(', #')} •{' '}
              {detail?.createdAt ? new Date(detail.createdAt).toLocaleString('pt-BR') : ''}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Conta', value: brl(detail.billTotalCents) },
                  { label: '10% pago', value: brl(detail.paidCents), accent: true },
                  { label: 'Sugerido', value: brl(detail.suggestedCents) },
                  { label: 'Canal', value: detail.paymentMethod || '—' },
                ].map((k) => (
                  <div key={k.label} className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/60">
                    <div className="text-[10px] font-black uppercase text-zinc-400">{k.label}</div>
                    <div className={`font-black font-mono tabular-nums ${k.accent ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                      {k.value}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">
                <strong>Responsável:</strong> {detail.responsibleName || '—'}
              </p>
              {(detail.editCount || 0) > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-0.5">
                  <p className="font-black text-[11px] uppercase">Trilha de ajuste ({detail.editCount}x)</p>
                  <p>
                    Último por <strong>{detail.lastEditBy || '?'}</strong> em{' '}
                    {detail.lastEditAt ? new Date(detail.lastEditAt).toLocaleString('pt-BR') : '?'}: de{' '}
                    <strong>{brl(detail.lastEditBeforeCents)}</strong> para{' '}
                    <strong>{brl(detail.lastEditAfterCents)}</strong>
                  </p>
                  <p>
                    Motivo: <strong>{detail.lastEditReason || '—'}</strong>
                  </p>
                </div>
              )}
              <div>
                <p className="font-black text-[11px] uppercase text-zinc-400 mb-1.5">O que consumiu (nota original)</p>
                <div className="space-y-1.5">
                  {((snapshot.items as any[]) || []).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-xs">
                      <span className="truncate">
                        {it.quantity}x {it.name}
                        {it.modifiers?.length ? ` (+${it.modifiers.join(', ')})` : ''}
                        {it.notes ? ` — obs: ${it.notes}` : ''}
                      </span>
                      <span className="font-bold font-mono tabular-nums shrink-0">{brl(it.subtotalCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setReceiptOpen(true)} className="h-10 text-xs rounded-xl">
                  Ver nota completa
                </Button>
                <Button variant="outline" onClick={() => openEdit(detail)} className="h-10 text-xs rounded-xl">
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Ajustar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Recibo da nota original (somente leitura) */}
      {detail && (
        <ReceiptDialog
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          title={`Comanda — ${detail.clientName || ''}`}
          storeName={(tenant as any)?.companyName || (tenant as any)?.tradeName}
          reference={`Pedidos #${orderNumbers.join(', #')}`}
          createdAt={snapshot.openedAt || detail.createdAt}
          items={(snapshot.items as any[]) || []}
          subtotalCents={snapshot.subtotalCents || 0}
          discountCents={snapshot.discountCents || 0}
          totalCents={snapshot.totalCents || detail.billTotalCents}
          paymentMethod={(snapshot.paymentMethods || []).join(' + ') || null}
          extraRows={[
            { label: 'Cliente', value: detail.clientName || 'Consumidor' },
            { label: 'Responsável', value: detail.responsibleName || '—' },
            {
              label: '10% pago',
              value: `${brl(detail.paidCents)}${detail.paymentMethod ? ` via ${detail.paymentMethod}` : ''}`,
            },
            {
              label: 'Fechada em',
              value: snapshot.closedAt ? new Date(snapshot.closedAt).toLocaleString('pt-BR') : '—',
            },
          ]}
          closeLabel="Voltar"
        />
      )}

      {/* Ajustar (motivo obrigatório) */}
      <Dialog open={Boolean(editingFee)} onOpenChange={(open) => !open && setEditingFee(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar 10%</DialogTitle>
            <DialogDescription>
              {editingFee?.clientName} • conta {brl(editingFee?.billTotalCents)}. O motivo é obrigatório e fica na
              trilha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <CossLabel>Valor pago (R$)</CossLabel>
                <CossInput
                  value={editPaid}
                  onChange={(e) => setEditPaid(e.target.value)}
                  inputMode="decimal"
                  className="mt-1.5 font-mono"
                />
              </div>
              <div>
                <CossLabel>Canal</CossLabel>
                <select
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value)}
                  className="mt-1.5 w-full h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-bold"
                >
                  <option value="PIX">Pix</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO_CREDITO">Crédito</option>
                  <option value="CARTAO_DEBITO">Débito</option>
                </select>
              </div>
            </div>
            <div>
              <CossLabel required>Motivo do ajuste</CossLabel>
              <CossInput
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Ex: cliente completou depois no caixa"
                maxLength={300}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingFee(null)} className="h-10 text-xs rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={() =>
                editingFee &&
                editMutation.mutate({
                  id: editingFee.id,
                  payload: { paidCents: parseCents(editPaid), paymentMethod: editMethod, reason: editReason },
                })
              }
              disabled={editMutation.isPending}
              className="h-10 text-xs font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950"
            >
              {editMutation.isPending ? 'Salvando...' : 'Salvar ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir (motivo obrigatório) */}
      <ConfirmDialog
        open={Boolean(deletingFee)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingFee(null);
            setDeleteReason('');
          }
        }}
        title="Excluir este 10%?"
        description={
          <span className="space-y-2 block">
            <span className="block">
              {deletingFee?.clientName} • {brl(deletingFee?.paidCents)} — a exclusão fica na trilha de auditoria.
            </span>
            <CossInput
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Motivo da exclusão (obrigatório)"
              maxLength={300}
              className="mt-2"
            />
          </span>
        }
        confirmLabel={deleteMutation.isPending ? 'Excluindo...' : 'Excluir com trilha'}
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => deletingFee && deleteMutation.mutate({ id: deletingFee.id, reason: deleteReason })}
      />
    </div>
  );
};

export default TipsPage;
