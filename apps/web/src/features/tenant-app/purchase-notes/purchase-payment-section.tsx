import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  QrCode,
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  Wallet,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PurchaseNote } from './purchase-notes-page';

const METHODS = [
  { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
  { id: 'PIX', label: 'Pix', icon: QrCode },
  { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard },
  { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
] as const;

const methodLabel = (id: string) => METHODS.find((m) => m.id === id)?.label || id;

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "15,00" / "15.00" / "15" → centavos. */
const parseBRL = (raw: string): number => {
  const v = parseFloat((raw || '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100);
};

const fmtInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '');

/**
 * Canônico de pagamento (espelho do backend `payment-method.ts`): as vendas
 * podem estar gravadas como CASH/CREDIT_CARD/DEBIT_CARD (terminal) ou
 * DINHEIRO/CARTAO_* (PDV). Sem unificar aqui, a prévia mostrava saldo zerado
 * ou negativo mesmo com dinheiro em caixa.
 */
const CANON_ALIASES: Record<string, string> = {
  DINHEIRO: 'DINHEIRO',
  CASH: 'DINHEIRO',
  MONEY: 'DINHEIRO',
  ESPECIE: 'DINHEIRO',
  PIX: 'PIX',
  CARTAO_DEBITO: 'CARTAO_DEBITO',
  DEBIT_CARD: 'CARTAO_DEBITO',
  DEBITO: 'CARTAO_DEBITO',
  DEBIT: 'CARTAO_DEBITO',
  CARTAO_CREDITO: 'CARTAO_CREDITO',
  CREDIT_CARD: 'CARTAO_CREDITO',
  CREDITO: 'CARTAO_CREDITO',
  CREDIT: 'CARTAO_CREDITO',
};

const canonMethod = (raw: string | null | undefined): string => {
  const full = String(raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (CANON_ALIASES[full]) return CANON_ALIASES[full];
  const short = full.replace(/_D[AEO]_/g, '_');
  return CANON_ALIASES[short] || 'OUTROS';
};

/** Soma valores crus (qualquer variante) por canal canônico. */
const totalByCanon = (byMethod: Record<string, number>): Record<string, number> => {
  const acc: Record<string, number> = {};
  for (const [k, v] of Object.entries(byMethod || {})) {
    const c = canonMethod(k);
    acc[c] = (acc[c] || 0) + Number(v || 0);
  }
  return acc;
};

interface SplitRow {
  tempId: string;
  method: string;
  amount: string;
}

/**
 * Pagamento da nota de compra + abatimento no caixa do turno.
 *
 * Cobre a especificação: valor total, canal único, combinado (fracionado) e
 * rateio opcional por item. Na confirmação o backend valida (parcelas == total),
 * grava na nota, cria um movimento COMPRA por canal no turno aberto e a
 * despesa paga (DRE/fluxo/fechamento). Reconfirmar ajusta sem duplicar.
 */
export const PurchasePaymentSection: React.FC<{ note: PurchaseNote; slug: string }> = ({
  note,
  slug,
}) => {
  const queryClient = useQueryClient();
  const paid = Boolean((note as any).paidAt);
  const [editing, setEditing] = useState(!paid);

  const savedPayments: { method: string; amountCents: number }[] = useMemo(() => {
    try {
      const arr = JSON.parse((note as any).paymentsJson || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [note]);

  const [total, setTotal] = useState(() =>
    fmtInput(Number((note as any).totalCents || 0)),
  );
  const [supplier, setSupplier] = useState((note as any).supplierName || '');
  const [mode, setMode] = useState<'SINGLE' | 'SPLIT'>(savedPayments.length > 1 ? 'SPLIT' : 'SINGLE');
  const [singleMethod, setSingleMethod] = useState(savedPayments[0]?.method || 'PIX');
  const [splits, setSplits] = useState<SplitRow[]>(() =>
    savedPayments.length > 1
      ? savedPayments.map((p, i) => ({
          tempId: `s${i}`,
          method: p.method,
          amount: fmtInput(p.amountCents),
        }))
      : [{ tempId: 's0', method: 'DINHEIRO', amount: '' }],
  );
  // Rateio por item: itemId -> {price, method}
  const [showItems, setShowItems] = useState(false);
  const [itemRates, setItemRates] = useState<Record<string, { price: string; method: string }>>(() => {
    const init: Record<string, { price: string; method: string }> = {};
    for (const it of note.items || []) {
      init[it.id] = {
        price: fmtInput(Number((it as any).priceCents || 0)),
        method: (it as any).paymentMethod || 'DINHEIRO',
      };
    }
    return init;
  });

  // Saldos do turno atual (para mostrar de onde vai abater).
  const { data: cashData } = useQuery({
    queryKey: ['cash-register', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/cash-register`).catch(() => null),
    enabled: !!slug && editing,
  });
  const registerOpen = Boolean(cashData?.isOpen);
  const salesByMethod: Record<string, number> = cashData?.metrics?.byMethod || {};
  const purchasesByMethod: Record<string, number> = cashData?.metrics?.purchasesByMethod || {};
  // Saldos por canal canônico (mesma conta do backend): dinheiro abate da
  // gaveta, pix do pix, combinado abate de cada canal da sua parcela.
  const salesByCanon = useMemo(() => totalByCanon(salesByMethod), [salesByMethod]);
  const purchasesByCanon = useMemo(() => totalByCanon(purchasesByMethod), [purchasesByMethod]);

  const totalCents = parseBRL(total);

  // Parcelas efetivas conforme o modo.
  const effectiveSplits = useMemo(() => {
    if (mode === 'SINGLE') {
      return totalCents > 0 ? [{ method: singleMethod, amountCents: totalCents }] : [];
    }
    return splits
      .map((s) => ({ method: s.method, amountCents: parseBRL(s.amount) }))
      .filter((s) => s.amountCents > 0);
  }, [mode, singleMethod, splits, totalCents]);

  const splitsSum = effectiveSplits.reduce((s, p) => s + p.amountCents, 0);
  const splitsOk = totalCents > 0 && splitsSum === totalCents;

  const itemsSum = useMemo(
    () =>
      (note.items || []).reduce((s, it) => {
        const r = itemRates[it.id];
        return s + (r ? parseBRL(r.price) : 0);
      }, 0),
    [note.items, itemRates],
  );
  const anyItemPriced = itemsSum > 0;
  const itemsOk = !anyItemPriced || itemsSum === totalCents;

  const confirmMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/purchase-notes/${note.id}/confirm`, payload),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-notes', slug] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', slug] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['bills-payable', slug] });
      setEditing(false);
      const n = res?.payment?.movements?.length || 0;
      toast.success(
        res?.payment?.registerOpen
          ? `Compra confirmada! ${n} abatimento(s) no caixa do turno.`
          : 'Compra confirmada! Sem turno aberto: registrado na nota e nas despesas.',
      );
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao confirmar pagamento'),
  });

  const handleConfirm = () => {
    if (totalCents <= 0) return toast.error('Informe o valor total gasto na compra.');
    if (!splitsOk) return toast.error('A soma das parcelas precisa fechar no total da nota.');
    if (!itemsOk) return toast.error('A soma dos itens precisa fechar no total da nota.');
    confirmMutation.mutate({
      totalCents,
      payments: effectiveSplits,
      items: anyItemPriced
        ? (note.items || []).map((it) => ({
            itemId: it.id,
            priceCents: parseBRL(itemRates[it.id]?.price || ''),
            paymentMethod: itemRates[it.id]?.method,
          }))
        : undefined,
      supplierName: supplier.trim() || undefined,
    });
  };

  /** Preenche o rateio dividindo o total igualmente entre os itens. */
  const distributeEqually = () => {
    const items = note.items || [];
    if (items.length === 0 || totalCents <= 0) return;
    const base = Math.floor(totalCents / items.length);
    let rest = totalCents - base * items.length;
    const next: Record<string, { price: string; method: string }> = {};
    items.forEach((it, idx) => {
      const cents = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      next[it.id] = { price: fmtInput(cents), method: itemRates[it.id]?.method || 'DINHEIRO' };
    });
    setItemRates(next);
  };

  /** Monta as parcelas a partir do rateio por item (arroz no dinheiro + ovo no pix...). */
  const useItemRatesAsSplits = () => {
    const map = new Map<string, number>();
    for (const it of note.items || []) {
      const cents = parseBRL(itemRates[it.id]?.price || '');
      if (cents <= 0) continue;
      const m = itemRates[it.id]?.method || 'DINHEIRO';
      map.set(m, (map.get(m) || 0) + cents);
    }
    if (map.size === 0) return toast.error('Dê preço aos itens primeiro.');
    setMode('SPLIT');
    setSplits(
      [...map.entries()].map(([method, amountCents], i) => ({
        tempId: `s${Date.now()}-${i}`,
        method,
        amount: fmtInput(amountCents),
      })),
    );
  };

  if (paid && !editing) {
    return (
      <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Pagamento confirmado
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
            Ajustar
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-emerald-700">Total pago</span>
          <span className="text-lg font-black text-emerald-900">{brl(Number((note as any).totalCents || 0))}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {savedPayments.map((p, i) => (
            <span
              key={i}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800"
            >
              {methodLabel(p.method)} • {brl(p.amountCents)}
            </span>
          ))}
        </div>
        <div className="text-[11px] text-emerald-700">
          {((note as any).supplierName ? `Fornecedor: ${(note as any).supplierName} • ` : '') +
            `Pago em ${new Date((note as any).paidAt).toLocaleString('pt-BR')} • abatido do caixa e lançado nas despesas`}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200 space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
          <Wallet className="w-4 h-4 text-emerald-600" />
          Pagamento da compra
        </span>
        {paid && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[11px] font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer"
          >
            Cancelar ajuste
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label className="text-[11px] font-bold text-zinc-700">Valor total gasto (R$) *</Label>
          <Input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="Ex: 15,00"
            inputMode="decimal"
            className="h-10 text-sm font-black font-mono rounded-xl bg-white mt-1"
          />
        </div>
        <div>
          <Label className="text-[11px] font-bold text-zinc-700">Fornecedor / origem</Label>
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Ex: Atacadão"
            className="h-10 text-xs rounded-xl bg-white mt-1"
            maxLength={120}
          />
        </div>
      </div>

      {/* Modo: único ou combinado */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100">
        {(
          [
            { id: 'SINGLE', label: 'Canal único' },
            { id: 'SPLIT', label: 'Combinado' },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`min-h-[44px] rounded-lg text-sm font-black transition cursor-pointer ${
              mode === m.id ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'SINGLE' ? (
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const active = singleMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSingleMethod(m.id)}
                className={`min-h-[56px] p-3 rounded-xl border text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {m.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {splits.map((row) => (
            <div key={row.tempId} className="flex items-center gap-2">
              <select
                value={row.method}
                onChange={(e) =>
                  setSplits((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, method: e.target.value } : r)))
                }
                className="min-h-[48px] rounded-xl border border-zinc-200 bg-white px-2 text-sm font-bold flex-1"
              >
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Input
                value={row.amount}
                onChange={(e) =>
                  setSplits((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, amount: e.target.value } : r)))
                }
                placeholder="0,00"
                inputMode="decimal"
                className="min-h-[48px] text-sm font-mono rounded-xl bg-white w-28"
              />
              <button
                type="button"
                onClick={() => setSplits((prev) => (prev.length > 1 ? prev.filter((r) => r.tempId !== row.tempId) : prev))}
                className="w-12 h-12 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 cursor-pointer"
                title="Remover parcela"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSplits((prev) => [...prev, { tempId: `s${Date.now()}`, method: 'PIX', amount: '' }])}
              className="text-[11px] font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar parcela
            </button>
            <span className={`text-[11px] font-black font-mono ${splitsOk ? 'text-emerald-700' : 'text-rose-600'}`}>
              {brl(splitsSum)} / {brl(totalCents)}
            </span>
          </div>
        </div>
      )}

      {/* Rateio opcional por item */}
      <div>
        <button
          type="button"
          onClick={() => setShowItems((v) => !v)}
          className="text-[11px] font-bold text-zinc-600 hover:text-zinc-900 cursor-pointer"
        >
          {showItems ? '− Ocultar rateio por item' : '+ Ratear valor por item (opcional)'}
        </button>
        {showItems && (
          <div className="mt-2 space-y-2 p-2.5 rounded-xl bg-white border border-zinc-200">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={distributeEqually}
                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 cursor-pointer"
              >
                Dividir total igualmente
              </button>
              <button
                type="button"
                onClick={useItemRatesAsSplits}
                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 cursor-pointer"
              >
                Usar rateio como parcelas
              </button>
              <span className={`ml-auto text-[11px] font-black font-mono ${itemsOk ? 'text-emerald-700' : 'text-rose-600'}`}>
                {brl(itemsSum)} / {brl(totalCents)}
              </span>
            </div>
            {(note.items || []).map((it) => (
              <div key={it.id} className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-800 truncate flex-1">{it.itemName}</span>
                <select
                  value={itemRates[it.id]?.method || 'DINHEIRO'}
                  onChange={(e) =>
                    setItemRates((prev) => ({
                      ...prev,
                      [it.id]: { price: prev[it.id]?.price || '', method: e.target.value },
                    }))
                  }
                  className="min-h-[44px] rounded-lg border border-zinc-200 bg-white px-1.5 text-xs font-bold"
                >
                  {METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <Input
                  value={itemRates[it.id]?.price || ''}
                  onChange={(e) =>
                    setItemRates((prev) => ({
                      ...prev,
                      [it.id]: { price: e.target.value, method: prev[it.id]?.method || 'DINHEIRO' },
                    }))
                  }
                  placeholder="0,00"
                  inputMode="decimal"
                  className="min-h-[44px] text-xs font-mono rounded-lg w-24"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prévia do abatimento por canal */}
      {effectiveSplits.length > 0 && (
        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-[11px] space-y-1">
          <p className="font-black text-emerald-800 uppercase tracking-wide text-[10px]">Vai abater do caixa</p>
          {effectiveSplits.map((p, i) => {
            const canon = canonMethod(p.method);
            const sales = Number(salesByCanon[canon] || 0);
            const bought = Number(purchasesByCanon[canon] || 0);
            return (
              <div key={i} className="flex justify-between text-emerald-900">
                <span>
                  {methodLabel(p.method)}: {brl(p.amountCents)}
                </span>
                {registerOpen && (
                  <span className="text-emerald-700 font-mono">
                    saldo {brl(sales - bought)} → {brl(sales - bought - p.amountCents)}
                  </span>
                )}
              </div>
            );
          })}
          {!registerOpen && (
            <p className="flex items-start gap-1 text-amber-700 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Sem turno aberto: o pagamento fica na nota e nas despesas, sem movimento de caixa.
            </p>
          )}
        </div>
      )}

      <Button
        onClick={handleConfirm}
        disabled={confirmMutation.isPending || totalCents <= 0 || !splitsOk || !itemsOk}
        className="w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider"
      >
        {confirmMutation.isPending
          ? 'Confirmando...'
          : paid
            ? 'Salvar ajuste e reabater'
            : 'Confirmar pagamento e abater do caixa'}
      </Button>
    </div>
  );
};

export default PurchasePaymentSection;
