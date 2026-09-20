import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  Download,
  Receipt,
  AlertTriangle,
  BellRing,
  Save,
  History,
  Eye,
  Wallet,
  AlertOctagon,
  CreditCard,
  ShoppingBag,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Id do contêiner no <body> que recebe o relatório só durante a impressão. */
const PRINT_HOST_ID = 'day-closing-print-host';
const PRINT_AREA_ID = 'day-closing-print-area';

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
] as const;

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const center = (s: string, width: number) => {
  const t = s.length >= width ? s.slice(0, width) : s;
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
};

/**
 * Fechamento de caixa — "Relatório Vendas de Hoje" (com Semana/Mês).
 *
 * O gerente confere na tela e imprime na térmica um documento CONTÍNUO: todas
 * as notas do período em sequência (cliente, itens, pagamento, valor) e, logo
 * após a última, o rodapé com totais por pagamento + total geral + despesas
 * pagas (abatimento) + saldo líquido. Sai tudo de uma vez porque a área de
 * impressão é um bloco único.
 *
 * "Salvar fechamento" grava a foto no histórico para o proprietário consultar
 * e reimprimir qualquer dia depois.
 */
export const DayClosingPage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm' | null>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  // Fechamento salvo em visualização (snapshot) — null = dados ao vivo.
  const [viewingId, setViewingId] = useState<string | null>(null);

  const {
    data: live,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['day-closing', slug, period],
    queryFn: () => apiGet(`/tenant-app/${slug}/reports/day-closing?period=${period}`),
    enabled: !!slug,
    refetchInterval: 10000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['cash-closings', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/finance/closings?limit=30`),
    enabled: !!slug,
    refetchInterval: 15000,
  });

  const { data: viewing } = useQuery({
    queryKey: ['cash-closing', slug, viewingId],
    queryFn: () => apiGet(`/tenant-app/${slug}/finance/closings/${viewingId}`),
    enabled: !!slug && !!viewingId,
  });

  const saveMutation = useMutation({
    mutationFn: () => apiPost(`/tenant-app/${slug}/finance/closings`, { period }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['cash-closings', slug] });
      toast.success(
        res?.updated ? 'Fechamento do dia atualizado no histórico!' : 'Fechamento salvo no histórico!',
      );
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar fechamento'),
  });

  // Dados efetivos: snapshot salvo ou ao vivo.
  const data = viewing?.snapshot || live;
  const isViewingHistory = Boolean(viewing?.snapshot);

  const width: '80mm' | '58mm' =
    paperWidth || (data?.store?.thermalPrinter === '58mm' ? '58mm' : '80mm');
  // 80mm ≈ 48 colunas, 58mm ≈ 32 colunas em fonte mono de cupom.
  const cols = width === '80mm' ? 48 : 32;
  const dashes = '-'.repeat(cols);

  const when = data?.generatedAt ? new Date(data.generatedAt) : new Date();
  const notes: any[] = data?.notes || [];
  const totals: Record<string, { count: number; totalCents: number; label: string }> = data?.totals || {};
  const expenses = data?.expenses || { paidTotalCents: 0, pendingTotalCents: 0, paid: [], pending: [] };
  const alerts = data?.alerts || { overdue: [], dueToday: [], dueSoon: [] };

  const orderedTotals = useMemo(() => {
    const order = ['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'VALE', 'FIADO', 'OUTROS'];
    return Object.entries(totals).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [totals]);

  const grandTotalCents = Number(data?.grandTotalCents || 0);
  const ticketMedioCents = data?.count ? Math.round(grandTotalCents / data.count) : 0;

  /** Vendas agrupadas por canal/origem (Balcão, Salão, QR, Delivery...). */
  const byOrigin = useMemo(() => {
    const map = new Map<string, { origin: string; count: number; totalCents: number }>();
    notes.forEach((n: any) => {
      const key = String(n.origin || 'Balcão (PDV)');
      const e = map.get(key) || { origin: key, count: 0, totalCents: 0 };
      e.count += 1;
      e.totalCents += Number(n.totalCents || 0);
      map.set(key, e);
    });
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [notes]);

  /** Itens mais vendidos no período (por faturamento). */
  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; totalCents: number }>();
    notes.forEach((n: any) => {
      (n.items || []).forEach((it: any) => {
        const name = String(it.name || 'Item');
        const e = map.get(name) || { name, qty: 0, totalCents: 0 };
        e.qty += Number(it.quantity || 0);
        e.totalCents += Number(it.subtotalCents || 0);
        map.set(name, e);
      });
    });
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 10);
  }, [notes]);

  /** Movimento por hora (só horas com venda). */
  const byHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => ({ count: 0, totalCents: 0 }));
    notes.forEach((n: any) => {
      const d = new Date(n.createdAt);
      if (Number.isNaN(d.getTime())) return;
      const h = d.getHours();
      buckets[h].count += 1;
      buckets[h].totalCents += Number(n.totalCents || 0);
    });
    const max = Math.max(1, ...buckets.map((b) => b.totalCents));
    return buckets
      .map((b, hour) => ({ hour, ...b, pct: Math.round((b.totalCents / max) * 100) }))
      .filter((b) => b.count > 0);
  }, [notes]);

  const buildText = useCallback(() => {
    const out: string[] = [];
    const store = data?.store || {};
    if (store.name) out.push(center(String(store.name).toUpperCase().slice(0, cols), cols));
    if (store.cnpj) out.push(center(`CNPJ: ${store.cnpj}`, cols));
    if (store.address) out.push(center(String(store.address).slice(0, cols), cols));
    if (store.phone) out.push(center(String(store.phone).slice(0, cols), cols));
    out.push(dashes);
    out.push(center('FECHAMENTO DE CAIXA', cols));
    out.push(center(`VENDAS - ${String(data?.periodLabel || 'Hoje').toUpperCase()}`, cols));
    out.push(center(when.toLocaleString('pt-BR'), cols));
    out.push(center(`${data?.count || 0} VENDA(S) NO PERIODO`, cols));
    out.push(dashes);

    notes.forEach((n: any) => {
      out.push(`NOTA ${n.seq} - ${n.clientName}`);
      if (n.tableLabel) out.push(`  ${n.tableLabel} - ${n.origin}`);
      else out.push(`  ${n.origin}`);
      (n.items || []).forEach((it: any) => {
        out.push(`  ${it.quantity}x ${it.name}`);
      });
      out.push(`  PAGAMENTO: ${n.paymentLabel}`);
      out.push(`  VALOR: ${brl(n.totalCents)}`);
      out.push(dashes);
    });

    out.push(center('RESUMO DE FECHAMENTO', cols));
    out.push(dashes);
    orderedTotals.forEach(([, t]) => {
      out.push(`TOTAL EM ${t.label.toUpperCase()} (${t.count}x): ${brl(t.totalCents)}`);
    });
    out.push(dashes);
    out.push(center(`VALOR TOTAL DO DIA: ${brl(data?.grandTotalCents || 0)}`, cols));
    out.push(center(`TICKET MEDIO: ${brl(ticketMedioCents)} (${data?.count || 0} VENDAS)`, cols));
    out.push(dashes);
    out.push(`DESPESAS PAGAS: ${brl(expenses.paidTotalCents)}`);
    out.push(center(`SALDO LIQUIDO: ${brl(data?.netTotalCents ?? 0)}`, cols));
    out.push(dashes);
    out.push(center('Documento gerado para prestacao de contas.', cols));
    return out.join('\n');
  }, [data, notes, orderedTotals, dashes, cols, when, expenses.paidTotalCents, ticketMedioCents]);

  const handlePrint = useCallback(() => {
    if (notes.length === 0) {
      toast.error('Sem vendas no período para imprimir.');
      return;
    }
    // O bloco de impressão fica SEMPRE montado (escondido na tela via
    // `hidden`, visível no print via `print:block`). Chamar window.print()
    // direto evita a condição de corrida do padrão antigo (montar -> print ->
    // desmontar), onde o Chrome abria o preview já com o conteúdo desmontado
    // e saía página em branco.
    window.print();
  }, [notes.length]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([buildText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fechamento-${period}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Relatório baixado.');
  }, [buildText, period]);

  const alertCount = alerts.overdue.length + alerts.dueToday.length + alerts.dueSoon.length;

  const ClosingBody = () => (
    <>
      {data?.store?.name && (
        <div className="text-center font-bold text-xs uppercase tracking-wider">{data.store.name}</div>
      )}
      {[data?.store?.cnpj && `CNPJ: ${data.store.cnpj}`, data?.store?.address, data?.store?.phone]
        .filter(Boolean)
        .map((s, i) => (
          <div key={i} className="text-center text-[10px] text-zinc-500 print:text-black">
            {s}
          </div>
        ))}
      <div className="text-center text-[10px] text-zinc-400 print:text-black">{dashes}</div>
      <div className="text-center font-black text-xs">FECHAMENTO DE CAIXA</div>
      <div className="text-center text-[10px] font-bold">
        VENDAS — {(data?.periodLabel || 'Hoje').toUpperCase()}
      </div>
      <div className="text-center text-[10px]">
        {when.toLocaleString('pt-BR')} • {data?.count || 0} venda(s)
      </div>
      <div className="text-center text-[10px] text-zinc-400 print:text-black">{dashes}</div>

      {notes.map((n: any) => (
        <div key={n.orderId || n.seq} className="space-y-0.5 closing-note">
          <div className="font-black text-[11px]">
            NOTA {n.seq} - {n.clientName}
          </div>
          <div className="text-[10px] text-zinc-500 print:text-black">
            {n.tableLabel ? `${n.tableLabel} — ` : ''}
            {n.origin} • {new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {(n.items || []).map((it: any, i: number) => (
            <div key={i} className="flex justify-between text-[10px] pl-2">
              <span className="truncate max-w-[70%]">
                {it.quantity}x {it.name}
              </span>
              <span className="shrink-0 font-bold">{brl(it.subtotalCents)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[10px] pl-2">
            <span>PAGAMENTO: {n.paymentLabel}</span>
            <span className="font-black">{brl(n.totalCents)}</span>
          </div>
          <div className="text-center text-[10px] text-zinc-400 print:text-black">{dashes}</div>
        </div>
      ))}

      <div className="text-center font-black text-xs pt-1">RESUMO DE FECHAMENTO</div>
      <div className="text-center text-[10px] text-zinc-400 print:text-black">{dashes}</div>
      {orderedTotals.map(([key, t]) => (
        <div key={key} className="flex justify-between text-[10px]">
          <span>
            TOTAL EM {t.label.toUpperCase()} ({t.count}x):
          </span>
          <span className="font-bold">{brl(t.totalCents)}</span>
        </div>
      ))}
      <div className="text-center text-[10px] text-zinc-400 print:text-black">{dashes}</div>
      <div className="flex justify-between font-black text-sm pt-1 border-t border-zinc-300 print:border-black">
        <span>VALOR TOTAL DO DIA:</span>
        <span>{brl(data?.grandTotalCents || 0)}</span>
      </div>
      <div className="flex justify-between text-[10px] pt-1">
        <span>TICKET MÉDIO ({data?.count || 0}x):</span>
        <span className="font-bold">{brl(ticketMedioCents)}</span>
      </div>
      <div className="flex justify-between text-[10px] pt-1">
        <span>DESPESAS PAGAS ({(expenses.paid || []).length}x):</span>
        <span className="font-bold">- {brl(expenses.paidTotalCents)}</span>
      </div>
      <div className="flex justify-between font-black text-sm pt-1 border-t border-zinc-300 print:border-black">
        <span>SALDO LÍQUIDO:</span>
        <span>{brl(data?.netTotalCents ?? 0)}</span>
      </div>
      {(expenses.pendingTotalCents || 0) > 0 && (
        <div className="flex justify-between text-[10px]">
          <span>A VENCER ({(expenses.pending || []).length}x):</span>
          <span className="font-bold">{brl(expenses.pendingTotalCents)}</span>
        </div>
      )}
      <div className="text-center text-[10px] text-zinc-400 print:text-black">{dashes}</div>
      <div className="text-center text-[10px] text-zinc-500 print:text-black italic">
        Documento gerado para prestação de contas.
      </div>
    </>
  );

  return (
    <div className="space-y-5 w-full pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`${base}/reports`)}
            className="h-9 w-9 p-0 rounded-xl shrink-0"
            title="Voltar aos relatórios"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight text-zinc-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" />
              Fechamento de Caixa
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {data?.periodLabel || 'Hoje'} • {when.toLocaleDateString('pt-BR')} • {data?.count || 0} venda(s) •{' '}
              {brl(data?.grandTotalCents || 0)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            {(['80mm', '58mm'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setPaperWidth(w)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  width === w ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 text-xs font-bold rounded-xl"
          >
            Atualizar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={notes.length === 0}
            className="h-9 text-xs font-bold rounded-xl"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Baixar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isViewingHistory}
            className="h-9 text-xs font-bold rounded-xl"
            title="Grava a foto deste fechamento no histórico"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar fechamento'}
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={notes.length === 0}
            className="h-9 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Printer className="w-3.5 h-3.5 mr-1" />
            Imprimir na térmica
          </Button>
        </div>
      </div>

      {/* Período */}
      <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-2xl w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPeriod(p.id);
              setViewingId(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              period === p.id ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {p.id === 'today' ? 'Vendas de Hoje' : p.id === 'week' ? 'Vendas da Semana' : 'Vendas do Mês'}
          </button>
        ))}
      </div>

      {/* Alertas de contas (crítico = vencida ou vence hoje) */}
      {!isLoading && !isError && alertCount > 0 && !isViewingHistory && (
        <div className="space-y-2">
          {alerts.overdue.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-rose-600 text-white flex items-start gap-2.5 shadow-md motion-safe:animate-pulse">
              <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-black uppercase tracking-wide">Conta(s) vencida(s) — ação imediata</p>
                {alerts.overdue.slice(0, 3).map((a: any) => (
                  <p key={a.id} className="font-medium mt-0.5">
                    {a.description} • {brl(a.amountCents)} • venceu em{' '}
                    {new Date(a.dueDate).toLocaleDateString('pt-BR')}
                  </p>
                ))}
                {alerts.overdue.length > 3 && (
                  <p className="font-bold mt-0.5">+ {alerts.overdue.length - 3} outra(s)</p>
                )}
              </div>
            </div>
          )}
          {alerts.dueToday.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500 text-zinc-950 flex items-start gap-2.5 shadow-md">
              <BellRing className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-black uppercase tracking-wide">Vence hoje</p>
                {alerts.dueToday.slice(0, 3).map((a: any) => (
                  <p key={a.id} className="font-medium mt-0.5">
                    {a.description} • {brl(a.amountCents)}
                  </p>
                ))}
                {alerts.dueToday.length > 3 && (
                  <p className="font-bold mt-0.5">+ {alerts.dueToday.length - 3} outra(s)</p>
                )}
              </div>
            </div>
          )}
          {alerts.dueSoon.length > 0 && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-black">Vencendo em até 3 dias: </span>
                {alerts.dueSoon
                  .slice(0, 3)
                  .map((a: any) => `${a.description} (${brl(a.amountCents)})`)
                  .join(' • ')}
                {alerts.dueSoon.length > 3 && ` + ${alerts.dueSoon.length - 3} outra(s)`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Visualizando snapshot salvo */}
      {isViewingHistory && viewing?.snapshot && (
        <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center justify-between gap-2">
          <p>
            <span className="font-black">Visualizando fechamento salvo</span> de{' '}
            {new Date(viewing.createdAt).toLocaleString('pt-BR')}
            {viewing.createdByName ? ` • por ${viewing.createdByName}` : ''}. A impressão sai desta foto.
          </p>
          <Button size="sm" variant="outline" onClick={() => setViewingId(null)} className="h-8 text-xs rounded-xl shrink-0">
            Voltar ao vivo
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="p-16 text-center text-xs text-zinc-400">
          <div className="w-6 h-6 border-2 border-zinc-300 border-t-emerald-600 rounded-full animate-spin mx-auto mb-2" />
          Montando o fechamento...
        </div>
      ) : isError ? (
        <div className="p-8 text-center rounded-3xl border border-rose-200 bg-rose-50 text-xs text-rose-700 space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto" />
          <p className="font-bold">Não foi possível carregar o fechamento.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="rounded-xl text-xs font-bold">
            Tentar novamente
          </Button>
        </div>
      ) : notes.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-zinc-300 text-xs text-zinc-400">
          <Receipt className="w-10 h-10 mx-auto mb-2 text-zinc-300" />
          <p className="font-bold text-zinc-600">Nenhuma venda no período</p>
          <p className="mt-1">As vendas de todos os canais entram aqui automaticamente.</p>
        </div>
      ) : (
        <>
          {/* Detalhamento nota a nota: sai SÓ na impressão térmica, não na tela. */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-dashed border-zinc-300 text-center text-xs text-zinc-500">
            <p className="font-bold text-zinc-700">
              {data?.count || 0} venda(s) neste período — o detalhamento nota a nota aparece somente na impressão.
            </p>
            <p className="mt-1">
              Clique em <span className="font-bold">Imprimir na térmica</span> para emitir o cupom contínuo com
              todas as notas + resumo no rodapé.
            </p>
          </div>

          {/* KPIs do período */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Faturamento</div>
              <div className="text-lg font-black text-emerald-800 font-mono">{brl(grandTotalCents)}</div>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-zinc-200 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Vendas</div>
              <div className="text-lg font-black text-zinc-900 font-mono">{data?.count || 0}</div>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-zinc-200 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Ticket médio
              </div>
              <div className="text-lg font-black text-zinc-900 font-mono">{brl(ticketMedioCents)}</div>
            </div>
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                Despesas pagas
              </div>
              <div className="text-lg font-black text-rose-800 font-mono">- {brl(expenses.paidTotalCents)}</div>
            </div>
            <div className="p-3 rounded-2xl bg-zinc-900 text-center col-span-2 sm:col-span-1">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center justify-center gap-1">
                <Wallet className="w-3 h-3" />
                Saldo líquido
              </div>
              <div className="text-lg font-black text-white font-mono">{brl(data?.netTotalCents ?? 0)}</div>
            </div>
          </div>

          {/* Por pagamento + por canal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-black text-zinc-900">Vendas por pagamento</h2>
              </div>
              <div className="space-y-2.5">
                {orderedTotals.map(([key, t]) => {
                  const pct = grandTotalCents > 0 ? Math.round((t.totalCents / grandTotalCents) * 100) : 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-700">
                          {t.label} <span className="font-mono font-normal text-zinc-400">({t.count}x)</span>
                        </span>
                        <span className="font-mono font-black text-zinc-900">
                          {brl(t.totalCents)} <span className="font-normal text-zinc-400">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-black text-zinc-900">Vendas por canal</h2>
              </div>
              <div className="space-y-2.5">
                {byOrigin.map((o) => {
                  const pct = grandTotalCents > 0 ? Math.round((o.totalCents / grandTotalCents) * 100) : 0;
                  return (
                    <div key={o.origin} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-700">
                          {o.origin} <span className="font-mono font-normal text-zinc-400">({o.count}x)</span>
                        </span>
                        <span className="font-mono font-black text-zinc-900">
                          {brl(o.totalCents)} <span className="font-normal text-zinc-400">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top itens + movimento por hora */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-black text-zinc-900">Itens mais vendidos</h2>
              </div>
              {topItems.length === 0 ? (
                <p className="text-xs text-zinc-400">Sem itens no período.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {topItems.map((it, idx) => (
                    <div
                      key={`${it.name}-${idx}`}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center font-mono font-bold text-[10px] text-zinc-700 shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-zinc-900 truncate">{it.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-zinc-500 text-[11px]">{it.qty} un</span>
                        <span className="font-mono font-bold text-zinc-900">{brl(it.totalCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-black text-zinc-900">Movimento por hora</h2>
              </div>
              {byHour.length === 0 ? (
                <p className="text-xs text-zinc-400">Sem movimento no período.</p>
              ) : (
                <div className="flex items-end gap-1.5 h-36 pt-2">
                  {byHour.map((b) => (
                    <div key={b.hour} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${String(b.hour).padStart(2, '0')}h: ${b.count}x • ${brl(b.totalCents)}`}>
                      <span className="text-[9px] font-mono font-bold text-zinc-600">{b.count}x</span>
                      <div className="w-full bg-zinc-100 rounded-t-md flex items-end" style={{ height: '100%' }}>
                        <div
                          className="w-full bg-indigo-500 rounded-t-md"
                          style={{ height: `${Math.max(4, b.pct)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-zinc-400">{String(b.hour).padStart(2, '0')}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Despesas: pagas (abatem) + a vencer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-rose-900">Despesas pagas (abatidas)</h2>
                <span className="text-sm font-black font-mono text-rose-700">- {brl(expenses.paidTotalCents)}</span>
              </div>
              {(expenses.paid || []).length === 0 ? (
                <p className="text-xs text-zinc-400">Nenhuma despesa paga no período.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {(expenses.paid || []).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between text-xs bg-white rounded-xl border border-rose-100 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-800 truncate">{e.description}</p>
                        <p className="text-[10px] text-zinc-400">
                          {e.category}
                          {e.paidAt ? ` • pago em ${new Date(e.paidAt).toLocaleDateString('pt-BR')}` : ''}
                        </p>
                      </div>
                      <span className="font-mono font-black text-rose-700 shrink-0 ml-2">- {brl(e.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-amber-900">Contas a vencer</h2>
                <span className="text-sm font-black font-mono text-amber-700">{brl(expenses.pendingTotalCents)}</span>
              </div>
              {(expenses.pending || []).length === 0 ? (
                <p className="text-xs text-zinc-400">Nenhuma conta em aberto.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {(expenses.pending || []).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between text-xs bg-white rounded-xl border border-amber-100 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-800 truncate">{e.description}</p>
                        <p className="text-[10px] text-zinc-400">
                          {e.category}
                          {e.dueDate ? ` • vence ${new Date(e.dueDate).toLocaleDateString('pt-BR')}` : ''}
                        </p>
                      </div>
                      <span className="font-mono font-black text-amber-700 shrink-0 ml-2">{brl(e.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pedidos do período (tabela compacta) */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-zinc-900">Pedidos do período</h2>
              <span className="text-[11px] text-zinc-400 font-mono">
                {notes.length} nota(s) • detalhe item a item só na impressão
              </span>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[640px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    <th className="py-2 pr-3">Nota</th>
                    <th className="py-2 pr-3">Hora</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Canal</th>
                    <th className="py-2 pr-3">Pagamento</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs">
                  {notes.map((n: any) => (
                    <tr key={n.orderId || n.seq} className="hover:bg-zinc-50/60">
                      <td className="py-2 pr-3 font-mono font-black text-zinc-700">#{n.seq}</td>
                      <td className="py-2 pr-3 font-mono text-zinc-500">
                        {n.createdAt
                          ? new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          : '-'}
                      </td>
                      <td className="py-2 pr-3 font-bold text-zinc-800">{n.clientName}</td>
                      <td className="py-2 pr-3 text-zinc-500">
                        {n.tableLabel ? `${n.tableLabel} • ` : ''}{n.origin}
                      </td>
                      <td className="py-2 pr-3 text-zinc-600">{n.paymentLabel}</td>
                      <td className="py-2 text-right font-mono font-black text-zinc-900">{brl(n.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-center text-[11px] text-zinc-400">
            A impressão é contínua: notas em sequência + resumo no rodapé, um corte só no fim.
          </p>
        </>
      )}

      {/* Histórico de caixas */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-black text-zinc-900">Histórico de fechamentos</h2>
          <Badge variant="secondary" className="text-[10px] font-bold">
            {history.length}
          </Badge>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Nenhum fechamento salvo ainda. Use "Salvar fechamento" para guardar a foto de hoje.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.map((h: any) => (
              <div
                key={h.id}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                  viewingId === h.id
                    ? 'border-indigo-400 bg-indigo-50/60'
                    : 'border-zinc-200 bg-zinc-50/60 hover:border-zinc-300'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-black text-zinc-900">
                    {new Date(h.createdAt).toLocaleString('pt-BR')} • {String(h.period) === 'WEEK' ? 'Semana' : String(h.period) === 'MONTH' ? 'Mês' : 'Hoje'}
                  </p>
                  <p className="text-zinc-500 mt-0.5">
                    {h.notesCount} venda(s) • Total {brl(h.grandTotalCents)} • Líquido {brl(h.netTotalCents)}
                    {h.createdByName ? ` • ${h.createdByName}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewingId(viewingId === h.id ? null : h.id)}
                  className="h-8 text-xs font-bold rounded-xl shrink-0"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  {viewingId === h.id ? 'Ocultar' : 'Ver / Imprimir'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bloco de impressão: sempre montado, escondido na tela (`hidden`) e
          visível só no print (`print:block` + CSS @media print abaixo). Manter
          montado é o que garante que a térmica/preview receba o conteúdo. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id={PRINT_HOST_ID} aria-hidden className="hidden print:block bg-white font-mono text-black leading-tight">
            <div id={PRINT_AREA_ID} data-width={width}>
              <ClosingBody />
            </div>
          </div>,
          document.body,
        )}

      <style>{`
        @media print {
          @page { margin: 4mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden !important; }
          #${PRINT_HOST_ID}, #${PRINT_HOST_ID} * { visibility: visible !important; }
          body *:not(#${PRINT_HOST_ID}):not(#${PRINT_HOST_ID} *) { display: none !important; }
          #${PRINT_HOST_ID} { display: block !important; }
          #${PRINT_AREA_ID} {
            position: static !important;
            width: 100% !important;
            margin: 0 auto !important;
            border: none !important;
            border-radius: 0 !important;
            background: #fff !important;
            box-shadow: none !important;
            color: #000 !important;
            font-size: 11px !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            page-break-inside: auto;
          }
          #${PRINT_AREA_ID}[data-width="80mm"] { max-width: 80mm !important; }
          #${PRINT_AREA_ID}[data-width="58mm"] { max-width: 58mm !important; }
          #${PRINT_AREA_ID} .closing-note { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>
    </div>
  );
};

export default DayClosingPage;
