import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { io, Socket } from 'socket.io-client';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  RefreshCw,
  ShieldAlert,
  Maximize2,
  Minimize2,
  WifiOff,
  Users,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Edit3,
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Regras do painel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alergênicos reconhecidos a partir de observações de texto livre.
 *
 * É detecção por palavra-chave sobre `OrderItem.notes`, porque o sistema ainda
 * não tem campo estruturado de alergia. Cobre os casos comuns, mas depende de o
 * garçom escrever o termo — não é garantia clínica. Um campo dedicado
 * (marcado no momento do pedido) é o caminho correto e depende de migração.
 */
const ALLERGENS: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'gluten', label: 'Sem glúten', pattern: /gl[uú]ten/i },
  { key: 'amendoim', label: 'Sem amendoim', pattern: /amendoim/i },
  { key: 'lactose', label: 'Sem lactose', pattern: /lactose|sem leite/i },
  { key: 'ovo', label: 'Sem ovo', pattern: /\bovo/i },
  { key: 'soja', label: 'Sem soja', pattern: /soja/i },
  { key: 'marisco', label: 'Sem frutos do mar', pattern: /frutos? do mar|camar[aã]o/i },
];

type WaitTier = 'ok' | 'warn' | 'late';

const WAIT_TIERS: Record<WaitTier, { ring: string; dot: string; text: string; label: string }> = {
  ok: { ring: 'border-border', dot: 'bg-emerald-500', text: 'text-muted-foreground', label: '' },
  warn: {
    ring: 'border-amber-500/60 ring-2 ring-amber-500/20',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Atenção',
  },
  late: {
    ring: 'border-rose-500/70 ring-2 ring-rose-500/25',
    dot: 'bg-rose-500 motion-safe:animate-pulse',
    text: 'text-rose-600 dark:text-rose-400',
    label: 'Atrasado',
  },
};

const FLOW = ['PENDING', 'PREPARING', 'READY', 'DELIVERED'];

function nextStatus(status: string): string {
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : 'DELIVERED';
}
function prevStatus(status: string): string | null {
  const i = FLOW.indexOf(status);
  return i > 0 ? FLOW[i - 1] : null;
}

function elapsedMs(createdAt: string) {
  return Math.max(0, Date.now() - new Date(createdAt).getTime());
}
function waitTier(createdAt: string): WaitTier {
  const min = elapsedMs(createdAt) / 60000;
  if (min >= 10) return 'late';
  if (min >= 5) return 'warn';
  return 'ok';
}
function formatElapsed(createdAt: string): string {
  const total = Math.floor(elapsedMs(createdAt) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Relógio de 1s: os cronômetros não podem ficar parados entre refetches. */
function useEverySecond() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

/**
 * Garçom responsável pelo pedido, na ordem de confiança:
 * nome gravado no pedido → nome da comanda → autor legado.
 * Pedidos antigos (antes da coluna) caem em null e a tela mostra "—".
 */
function getWaiterName(order: any): string | null {
  return order?.waiterName || order?.tableSession?.waiterName || order?.createdBy?.name || null;
}

/** Nome da comanda (ex.: "Mesa do João") quando houver. */
function getComandaName(order: any): string | null {
  return order?.tableSession?.comandaName || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sons
// ─────────────────────────────────────────────────────────────────────────────

const playKitchenChime = (type: 'new_order' | 'status_change' | 'late') => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'new_order') {
      // Agudo e curto: entrou comanda nova.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'late') {
      // Grave e mais longo: pedido passou de 10 min.
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      osc.frequency.setValueAtTime(196, audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.7);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch {
    // AudioContext pode exigir interação do usuário antes do primeiro som.
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Componentes
// ─────────────────────────────────────────────────────────────────────────────

const AllergenBadges: React.FC<{ notes?: string | null }> = ({ notes }) => {
  if (!notes) return null;
  const found = ALLERGENS.filter((a) => a.pattern.test(notes));
  if (found.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {found.map((a) => (
        <span
          key={a.key}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wide"
        >
          <ShieldAlert className="w-3 h-3" />
          {a.label}
        </span>
      ))}
    </div>
  );
};

interface OrderCardProps {
  order: any;
  actionLabel: string;
  actionIcon: React.ReactNode;
  actionClass: string;
  onAdvance: () => void;
  onUpdateNotes?: (orderId: string, notes: string) => void;
  busy: boolean;
  tvMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDragStart: () => void;
  /** Na coluna PRONTOS o cartão destaca quem deve buscar. */
  highlightWaiter?: boolean;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  actionLabel,
  actionIcon,
  actionClass,
  onAdvance,
  onUpdateNotes,
  busy,
  tvMode,
  selected,
  onToggleSelect,
  onDragStart,
  highlightWaiter = false,
}) => {
  const tier = WAIT_TIERS[waitTier(order.createdAt)];
  const isVip = Boolean(order.table?.isVip);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(order.notes || '');
  const waiter = getWaiterName(order);
  const comanda = getComandaName(order);
  const itemCount = (order.items || []).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);

  const displayTable = order.table?.label
    ? order.table.label
    : order.table?.number
    ? `Mesa ${String(order.table.number).padStart(2, '0')}`
    : order.origin === 'DELIVERY'
    ? '🛵 Delivery'
    : '🥡 Balcão';

  const originLabel =
    order.origin === 'QR_CODE'
      ? 'QR do cliente'
      : order.origin === 'TABLET'
      ? 'Tablet da mesa'
      : order.origin === 'WAITER'
      ? 'Garçom'
      : order.origin === 'DELIVERY'
      ? 'Delivery'
      : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', order.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      className={`p-3.5 rounded-2xl bg-card border shadow-sm space-y-2.5 cursor-grab active:cursor-grabbing transition ${tier.ring} ${
        selected ? 'ring-2 ring-primary' : ''
      } ${highlightWaiter ? 'border-emerald-500/60' : ''}`}
    >
      {/* Faixa "quem busca": só na coluna de prontos, bem visível a distância. */}
      {highlightWaiter && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-emerald-600 text-white">
          <Users className="w-4 h-4 shrink-0" />
          <span className={`font-black truncate ${tvMode ? 'text-xl' : 'text-sm'}`}>
            Buscar: {waiter || 'garçom da mesa'}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-black text-foreground block truncate ${
                tvMode ? 'text-4xl' : 'text-xl'
              }`}
            >
              {displayTable}
            </span>
            {isVip && (
              <Badge className="bg-amber-500 text-zinc-950 font-black text-[10px] uppercase">
                Urgente
              </Badge>
            )}
            {originLabel && (
              <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">
                {originLabel}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] font-bold text-muted-foreground">
              Pedido #{order.orderNumber}
            </span>
            <span className="text-[11px] text-muted-foreground">•</span>
            <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            </span>
            {comanda && (
              <>
                <span className="text-[11px] text-muted-foreground">•</span>
                <span className="text-[11px] font-bold text-muted-foreground truncate max-w-[140px]">
                  {comanda}
                </span>
              </>
            )}
          </div>
          {/* Garçom responsável: sempre visível para saber quem chamou/busca. */}
          <span
            className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-black max-w-full ${
              waiter
                ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                : 'bg-muted border border-border text-muted-foreground'
            }`}
          >
            <Users className="w-3 h-3 shrink-0" />
            <span className="truncate">{waiter || 'Garçom não identificado'}</span>
          </span>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className={`font-semibold flex items-center gap-1 tabular-nums ${tier.text} ${
              tvMode ? 'text-xl' : 'text-[13px]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {formatElapsed(order.createdAt)}
          </span>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Selecionar pedido ${order.orderNumber}`}
            className="h-4 w-4 rounded border-border accent-primary"
          />
        </div>
      </div>

      {tier.label && (
        <Badge
          variant="outline"
          className={`text-[10px] font-bold ${
            tier.label === 'Atrasado'
              ? 'border-rose-500/40 text-rose-600 dark:text-rose-400'
              : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
          }`}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          {tier.label}
        </Badge>
      )}

      {/* Observação Geral do Pedido / Mesa */}
      {order.notes && !isEditingNotes && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <FileText className="w-3.5 h-3.5" />
              Observação do Pedido
            </span>
            <button
              type="button"
              onClick={() => {
                setTempNotes(order.notes || '');
                setIsEditingNotes(true);
              }}
              className="text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              Editar
            </button>
          </div>
          <p className="text-xs font-semibold leading-snug break-words">{order.notes}</p>
        </div>
      )}

      {/* Botão de adicionar observação de cozinha quando ainda não possui */}
      {!order.notes && !isEditingNotes && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setTempNotes('');
              setIsEditingNotes(true);
            }}
            className="text-[11px] font-semibold text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 cursor-pointer transition py-0.5 px-2 rounded-lg hover:bg-muted"
          >
            <FileText className="w-3 h-3 text-amber-500" />
            <span>+ Obs</span>
          </button>
        </div>
      )}

      {/* Editor rápido de observação */}
      {isEditingNotes && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Observação
            </span>
            <button
              type="button"
              onClick={() => setIsEditingNotes(false)}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={tempNotes}
            onChange={(e) => setTempNotes(e.target.value)}
            placeholder="Ex: Cliente tem alergia a pimenta, carne bem passada..."
            rows={2}
            className="w-full text-xs p-2 rounded-lg bg-background border border-border resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditingNotes(false)}
              className="h-7 px-2 text-[11px]"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onUpdateNotes?.(order.id, tempNotes.trim());
                setIsEditingNotes(false);
              }}
              className="h-7 px-2.5 text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3" />
              Salvar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de Itens do Pedido */}
      <div className="space-y-2">
        {(order.items || []).map((item: any) => (
          <div key={item.id} className="p-2.5 rounded-xl bg-muted">
            <div className={`font-black text-foreground ${tvMode ? 'text-xl' : 'text-sm'}`}>
              {item.quantity}x {item.product?.name}
            </div>
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="text-[11px] text-muted-foreground font-bold mt-0.5">
                + {item.modifiers.map((m: any) => m.name).join(', ')}
              </div>
            )}
            {item.notes && (
              <div className="mt-1.5 p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25">
                <div className="flex items-start gap-1.5">
                  <span className="text-amber-600 dark:text-amber-400 text-xs leading-tight">📝</span>
                  <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 leading-tight">
                    <span className="uppercase text-[10px] tracking-wide font-black text-amber-600 dark:text-amber-400 mr-1">
                      Obs:
                    </span>
                    {item.notes}
                  </div>
                </div>
                <AllergenBadges notes={item.notes} />
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        onClick={onAdvance}
        disabled={busy}
        className={`w-full font-black rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
          tvMode ? 'h-14 text-base' : 'h-9 text-xs'
        } ${actionClass}`}
      >
        {actionIcon}
        {actionLabel}
      </Button>
    </div>
  );
};

const OrderCardSkeleton: React.FC<{ tvMode: boolean }> = ({ tvMode }) => (
  <div className="p-4 rounded-2xl bg-card border border-border space-y-3 motion-safe:animate-pulse">
    <div className={`w-24 rounded bg-muted ${tvMode ? 'h-8' : 'h-5'}`} />
    <div className="h-3 w-16 rounded bg-muted" />
    <div className="h-16 rounded-xl bg-muted" />
    <div className={`rounded-xl bg-muted ${tvMode ? 'h-14' : 'h-9'}`} />
  </div>
);

const GroupedItems: React.FC<{ orders: any[]; tvMode: boolean }> = ({ orders, tvMode }) => {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    for (const order of orders) {
      for (const item of order.items || []) {
        const name = item.product?.name || 'Item';
        map.set(name, { name, qty: (map.get(name)?.qty ?? 0) + Number(item.quantity || 0) });
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }, [orders]);

  if (grouped.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-3.5 text-left hover:bg-muted/60 transition"
      >
        <span className="text-xs font-black text-foreground uppercase tracking-wider">
          Produção agrupada — {grouped.length} {grouped.length === 1 ? 'item' : 'itens'}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3 pt-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {grouped.map((g) => (
            <div key={g.name} className="p-2.5 rounded-xl bg-muted text-center">
              <div
                className={`font-black text-foreground tabular-nums ${
                  tvMode ? 'text-2xl' : 'text-lg'
                }`}
              >
                {g.qty}x
              </div>
              <div className="text-[11px] text-muted-foreground font-bold truncate">{g.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface KdsColumnProps {
  title: string;
  accent: string;
  status: string;
  list: any[];
  loading: boolean;
  emptyLabel: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  actionClass: string;
  tvMode: boolean;
  busy: boolean;
  selected: string[];
  dragging: boolean;
  highlightWaiter?: boolean;
  onDrop: (status: string, orderId: string) => void;
  onToggleSelect: (id: string) => void;
  onAdvance: (order: any) => void;
  onUpdateNotes?: (orderId: string, notes: string) => void;
  onDragStart: (id: string) => void;
}

const KdsColumn: React.FC<KdsColumnProps> = ({
  title,
  accent,
  status,
  list,
  loading,
  emptyLabel,
  actionLabel,
  actionIcon,
  actionClass,
  tvMode,
  busy,
  selected,
  dragging,
  highlightWaiter = false,
  onDrop,
  onToggleSelect,
  onAdvance,
  onUpdateNotes,
  onDragStart,
}) => {
  const oldest = list.length > 0 ? list[0] : null;
  return (
  <div
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      const orderId = e.dataTransfer.getData('text/plain');
      if (orderId) onDrop(status, orderId);
    }}
    className={`flex flex-col bg-muted/40 rounded-3xl border overflow-hidden shadow-sm transition min-h-[280px] ${
      dragging ? 'border-dashed border-primary/60' : 'border-border'
    }`}
  >
    <div className="p-3.5 bg-muted/60 border-b border-border flex items-center justify-between gap-2 sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${accent}`} />
        <h2
          className={`font-black text-foreground uppercase tracking-wider truncate ${
            tvMode ? 'text-base' : 'text-xs'
          }`}
        >
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {oldest && (
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatElapsed(oldest.createdAt)}
          </span>
        )}
        <Badge variant="secondary" className="font-black text-xs px-2 py-0.5 tabular-nums">
          {list.length}
        </Badge>
      </div>
    </div>

    <div className={`p-3 space-y-3 flex-1 overflow-y-auto ${tvMode ? '' : 'max-h-[68vh]'}`}>
      {loading ? (
        <>
          <OrderCardSkeleton tvMode={tvMode} />
          <OrderCardSkeleton tvMode={tvMode} />
        </>
      ) : list.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-xs font-medium">{emptyLabel}</div>
      ) : (
        list.map((order: any) => (
          <OrderCard
            key={order.id}
            order={order}
            busy={busy}
            tvMode={tvMode}
            selected={selected.includes(order.id)}
            onToggleSelect={() => onToggleSelect(order.id)}
            onDragStart={() => onDragStart(order.id)}
            actionLabel={actionLabel}
            actionIcon={actionIcon}
            actionClass={actionClass}
            onAdvance={() => onAdvance(order)}
            onUpdateNotes={onUpdateNotes}
            highlightWaiter={highlightWaiter}
          />
        ))
      )}
    </div>
  </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

export const KitchenKdsPage: React.FC = () => {
  const { tenant, currentUser } = useTenant();
  const queryClient = useQueryClient();
  const companyId = tenant?.id;

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [connected, setConnected] = useState(true);
  const [tvMode, setTvMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Filtro por garçom: a cozinha localiza de quem é cada pedido e o garçom
  // acha os seus. "ALL" = todo mundo.
  const [waiterFilter, setWaiterFilter] = useState<string>('ALL');

  useEverySecond();

  // Destrava o áudio no primeiro gesto: sem isso o navegador veta o som e o
  // "ficou pronto" nunca toca no tablet/celular da cozinha.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        if (ctx.state === 'suspended') void ctx.resume();
        if (ctx.state !== 'closed') void ctx.close?.();
      } catch {}
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const ordersQuery = useQuery({
    queryKey: ['kds-orders', companyId],
    queryFn: () => apiGet('/restaurant/orders?active=1'),
    enabled: !!companyId,
    refetchInterval: 6000,
  });

  const statsQuery = useQuery({
    queryKey: ['kds-stats', companyId],
    queryFn: () => apiGet('/restaurant/orders/stats'),
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  const orders: any[] = ordersQuery.data ?? [];
  const stats: any = statsQuery.data ?? {};

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiPatch(`/restaurant/orders/${orderId}/status`, { status }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      queryClient.invalidateQueries({ queryKey: ['kds-stats'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
      queryClient.invalidateQueries({ queryKey: ['day-closing'] });
      if (soundEnabled) playKitchenChime('status_change');
      toast.success(`Pedido #${updated.orderNumber} atualizado.`);
    },
    onError: () => toast.error('Erro ao atualizar status do pedido'),
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ orderId, notes }: { orderId: string; notes: string }) =>
      apiPatch(`/restaurant/orders/${orderId}/notes`, { notes }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      toast.success(`Observação do pedido #${updated.orderNumber} salva!`);
    },
    onError: () => toast.error('Erro ao salvar observação'),
  });

  /** Avança um passo e oferece desfazer — não apaga nem cria nada. */
  const advance = useCallback(
    (order: any) => {
      const to = nextStatus(order.status);
      const back = prevStatus(to);
      updateStatusMutation.mutate({ orderId: order.id, status: to });
      toast(`Pedido #${order.orderNumber} avançado.`, {
        duration: 6000,
        action: back
          ? {
              label: 'Desfazer',
              onClick: () =>
                updateStatusMutation.mutate({ orderId: order.id, status: back as string }),
            }
          : undefined,
      });
    },
    [updateStatusMutation],
  );

  useEffect(() => {
    if (!companyId) return;

    const socketUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:3001/restaurant'
      : '/restaurant';

    const socket: Socket = io(socketUrl, {
      auth: { companyId },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_restaurant', { companyId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.io.on('reconnect_attempt', () => setConnected(false));

    socket.on('order:new', (newOrder: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      if (soundEnabled) playKitchenChime('new_order');
      toast.success(`Novo pedido #${newOrder.orderNumber} — ${newOrder.table?.label || 'Mesa'}`, {
        duration: 6000,
      });
    });

    socket.on('order:status_update', (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      // Quando fica pronto, o KDS apita diferente e mostra quem busca — e o
      // celular do garçom responsável (mapa de mesas) toca/vibra junto pelo
      // mesmo evento.
      if (updated?.status === 'READY') {
        if (soundEnabled) playKitchenChime('new_order');
        try {
          (navigator as any)?.vibrate?.([150, 80, 150]);
        } catch {}
        const waiter = getWaiterName(updated);
        toast.success(
          `Pronto: pedido #${updated.orderNumber} — ${updated.table?.label || 'mesa'}${waiter ? ` • buscar: ${waiter}` : ''}`,
          { duration: 6000 },
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [companyId, soundEnabled, queryClient]);

  // Som de atraso: uma vez por pedido, e volta a tocar se ele sair e reentrar.
  const alertedLate = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!soundEnabled) return;
    for (const order of orders) {
      const late = waitTier(order.createdAt) === 'late';
      if (late && !alertedLate.current.has(order.id)) {
        alertedLate.current.add(order.id);
        playKitchenChime('late');
      } else if (!late) {
        alertedLate.current.delete(order.id);
      }
    }
  }, [orders, soundEnabled]);

  // Mais antigos no topo: quem espera mais aparece primeiro.
  // Com filtro de garçom ativo, cada um vê só os seus.
  const byOldest = useCallback(
    (status: string) =>
      orders
        .filter((o: any) => o.status === status)
        .filter((o: any) => waiterFilter === 'ALL' || (getWaiterName(o) || '—') === waiterFilter)
        .sort((a: any, b: any) => elapsedMs(b.createdAt) - elapsedMs(a.createdAt)),
    [orders, waiterFilter],
  );

  /** Garçons com pedido ativo, para o filtro (ordem alfabética). */
  const activeWaiters = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const w = getWaiterName(o);
      if (w) set.add(w);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [orders]);

  /** Atalho: o garçom logado vê só os pedidos dele com 1 toque. */
  const myWaiterName = (currentUser?.name || '').trim() || null;

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const bulkAdvance = async () => {
    for (const order of orders.filter((o: any) => selected.includes(o.id))) {
      await updateStatusMutation.mutateAsync({ orderId: order.id, status: nextStatus(order.status) });
    }
    setSelected([]);
  };

  const handleDrop = (status: string, orderId: string) => {
    setDraggingId(null);
    const order = orders.find((o: any) => o.id === orderId);
    if (!order || order.status === status) return;
    // Só avança: arrastar para trás não regride por acidente (use Desfazer).
    if (FLOW.indexOf(status) <= FLOW.indexOf(order.status)) {
      toast.error('Arraste apenas para a frente. Para voltar, use "Desfazer".');
      return;
    }
    advance(order);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setTvMode(true);
      } else {
        await document.exitFullscreen();
        setTvMode(false);
      }
    } catch {
      // Sem gesto do usuário o navegador bloqueia; o visual do modo TV ainda aplica.
      setTvMode((v) => !v);
    }
  };

  const busy = updateStatusMutation.isPending;

  const columns = [
    {
      status: 'PENDING',
      title: 'Novos pedidos',
      accent: 'bg-amber-500',
      emptyLabel: 'Nenhum novo pedido na fila.',
      actionLabel: 'Iniciar preparo',
      actionIcon: <Flame className="w-4 h-4" />,
      actionClass: 'text-zinc-950 bg-amber-400 hover:bg-amber-300',
      list: byOldest('PENDING'),
    },
    {
      status: 'PREPARING',
      title: 'Em preparo',
      accent: 'bg-indigo-500',
      emptyLabel: 'Nenhum prato sendo preparado no momento.',
      actionLabel: 'Marcar como pronto',
      actionIcon: <CheckCircle2 className="w-4 h-4" />,
      actionClass: 'text-white bg-indigo-600 hover:bg-indigo-500',
      list: byOldest('PREPARING'),
    },
    {
      status: 'READY',
      title: 'Prontos (aguardando garçom)',
      accent: 'bg-emerald-500',
      emptyLabel: 'Nenhum pedido pronto aguardando entrega.',
      actionLabel: 'Entregue na mesa',
      actionIcon: <CheckCircle2 className="w-4 h-4" />,
      actionClass: 'text-white bg-emerald-600 hover:bg-emerald-500',
      list: byOldest('READY'),
      highlightWaiter: true,
    },
  ];

  return (
    <div className="flex flex-col space-y-5 font-sans">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 bg-card text-card-foreground p-4 sm:p-5 rounded-3xl border border-border shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`font-black text-foreground ${tvMode ? 'text-2xl' : 'text-lg'}`}>
                KDS — Painel da Cozinha
              </h1>
              {connected ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold"
                >
                  Ao Vivo
                </Badge>
              ) : (
                <Badge
                  variant="destructive"
                  className="text-[10px] font-bold motion-safe:animate-pulse"
                >
                  <WifiOff className="w-3 h-3 mr-1" />
                  Sem conexão
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pedidos transmitidos em tempo real direto dos tablets e QR Codes das mesas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Tempo médio', value: `${stats.averagePrepMinutes ?? 0} min` },
            { label: 'Concluídos hoje', value: stats.completedToday ?? 0 },
            { label: 'Mais demorado', value: `${stats.longestWaitingMinutes ?? 0} min` },
          ].map((m) => (
            <div key={m.label} className="px-3 py-2 rounded-xl bg-muted text-center">
              <div
                className={`font-black text-foreground tabular-nums ${
                  tvMode ? 'text-2xl' : 'text-lg'
                }`}
              >
                {m.value}
              </div>
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">
                {m.label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => ordersQuery.refetch()}
            disabled={ordersQuery.isFetching}
            className="h-8 px-3 text-xs font-bold rounded-xl"
            title="Recarregar pedidos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-8 px-3 text-xs font-bold rounded-xl"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Som ativo</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Som mudo</span>
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            className="h-8 px-3 text-xs font-bold rounded-xl"
            title="Modo TV"
          >
            {tvMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>TV</span>
          </Button>
        </div>
      </div>

      {ordersQuery.isError && (
        <div
          role="alert"
          className="p-4 rounded-2xl border border-destructive/40 bg-destructive/5 flex items-center justify-between gap-3"
        >
          <p className="text-sm text-destructive font-medium">
            Não foi possível carregar os pedidos da cozinha.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => ordersQuery.refetch()}
            className="h-8 text-xs font-bold"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <GroupedItems orders={orders} tvMode={tvMode} />

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-primary text-primary-foreground">
          <span className="text-sm font-bold">{selected.length} pedido(s) selecionado(s)</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={bulkAdvance}
              disabled={busy}
              className="h-8 text-xs font-bold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Avançar selecionados
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected([])}
              className="h-8 text-xs font-bold"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Limpar
            </Button>
          </div>
        </div>
      )}

      {/* Filtro por garçom: a cozinha acha de quem é cada comanda e o garçom
          filtra os seus para buscar. Aparece só quando há nomes registrados. */}
      {activeWaiters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-card border border-border">
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
            <Users className="w-4 h-4" />
            Garçom:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWaiterFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                waiterFilter === 'ALL'
                  ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos ({orders.length})
            </button>
            {activeWaiters.map((w) => {
              const count = orders.filter((o: any) => getWaiterName(o) === w).length;
              const active = waiterFilter === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWaiterFilter(active ? 'ALL' : w)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20'
                  }`}
                >
                  <span className="max-w-[120px] truncate">{w}</span>
                  <span className="tabular-nums opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
          {myWaiterName && activeWaiters.includes(myWaiterName) && waiterFilter !== myWaiterName && (
            <button
              type="button"
              onClick={() => setWaiterFilter(myWaiterName)}
              className="ml-auto px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-500 transition cursor-pointer"
            >
              Meus pedidos
            </button>
          )}
          {waiterFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setWaiterFilter('ALL')}
              className="px-2 py-1.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Limpar
            </button>
          )}
        </div>
      )}

      <div
        className={`grid gap-4 items-start ${tvMode ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}
        aria-live="polite"
      >
        {columns.map((col) => (
          <KdsColumn
            key={col.status}
            title={col.title}
            accent={col.accent}
            status={col.status}
            list={col.list}
            loading={ordersQuery.isLoading}
            emptyLabel={col.emptyLabel}
            actionLabel={col.actionLabel}
            actionIcon={col.actionIcon}
            actionClass={col.actionClass}
            tvMode={tvMode}
            busy={busy}
            selected={selected}
            dragging={Boolean(draggingId)}
            highlightWaiter={(col as any).highlightWaiter}
            onDrop={handleDrop}
            onToggleSelect={toggleSelect}
            onAdvance={advance}
            onUpdateNotes={(orderId, notes) => updateNotesMutation.mutate({ orderId, notes })}
            onDragStart={setDraggingId}
          />
        ))}
      </div>
    </div>
  );
};
export default KitchenKdsPage;
