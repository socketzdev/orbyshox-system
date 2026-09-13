import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Primitivos visuais do módulo de Compras (marketplace).
 *
 * Motivação: o dashboard original repetia classes utilitárias inline
 * (`text-zinc-900`, `bg-zinc-100`) sem variante `dark:`, então o tema escuro
 * renderizava superfícies claras sobre fundo escuro. Além disso cada card
 * reinventava padding, raio e hierarquia tipográfica.
 *
 * Tudo aqui usa tokens semânticos (`bg-card`, `text-muted-foreground`) que já
 * alternam claro/escuro via `index.css`, e concentra hover/foco/acessibilidade
 * num único lugar — os estados passam a ser consistentes em todas as telas.
 */

// ─── Tema resolvido ──────────────────────────────────────────────────────────

/**
 * `useTheme()` devolve a preferência ("system"), não o tema aplicado. Gráficos
 * em SVG precisam da cor final, então lemos a classe real do `<html>` — que é
 * onde o ThemeProvider escreve o resultado já resolvido.
 */
export function useResolvedTheme(): 'dark' | 'light' {
  const [resolved, setResolved] = React.useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  );

  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setResolved(root.classList.contains('dark') ? 'dark' : 'light');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return resolved;
}

// ─── Acentos ─────────────────────────────────────────────────────────────────

export type Accent = 'sky' | 'violet' | 'emerald' | 'amber' | 'rose';

export const ACCENT: Record<
  Accent,
  { icon: string; spark: string; bar: string; soft: string }
> = {
  sky: {
    icon: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400',
    spark: '#0ea5e9',
    bar: 'bg-sky-500',
    soft: 'bg-sky-50 dark:bg-sky-500/10',
  },
  violet: {
    icon: 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:bg-violet-500/15 dark:text-violet-400',
    spark: '#8b5cf6',
    bar: 'bg-violet-500',
    soft: 'bg-violet-50 dark:bg-violet-500/10',
  },
  emerald: {
    icon: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400',
    spark: '#10b981',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50 dark:bg-emerald-500/10',
  },
  amber: {
    icon: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400',
    spark: '#f59e0b',
    bar: 'bg-amber-500',
    soft: 'bg-amber-50 dark:bg-amber-500/10',
  },
  rose: {
    icon: 'bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:bg-rose-500/15 dark:text-rose-400',
    spark: '#f43f5e',
    bar: 'bg-rose-500',
    soft: 'bg-rose-50 dark:bg-rose-500/10',
  },
};

// ─── Sparkline ───────────────────────────────────────────────────────────────

export const Sparkline: React.FC<{ data: number[]; color: string; className?: string }> = ({
  data,
  color,
  className,
}) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 26 - ((value - min) / range) * 22;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const gradientId = `mk-spark-${color.replace('#', '')}`;

  return (
    <svg
      viewBox="0 0 100 28"
      className={cn('h-8 w-20 overflow-visible', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,28 ${points} 100,28`} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

// ─── StatCard (KPI) ──────────────────────────────────────────────────────────

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: React.ReactNode;
  accent?: Accent;
  sparkline?: number[];
  onClick?: () => void;
  isLoading?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  sub,
  accent = 'sky',
  sparkline = [],
  onClick,
  isLoading,
  className,
}) => {
  const tone = ACCENT[accent];

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-border bg-card p-4 shadow-soft',
          className,
        )}
        aria-hidden="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-7 w-16 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="mt-4 h-2.5 w-24 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  const interactive = typeof onClick === 'function';
  const Comp: any = interactive ? 'button' : 'div';

  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={interactive ? `${label}: ${value}. Abrir.` : undefined}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-soft',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:border-foreground/20 hover:shadow-elevated hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-[1.6rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
            {value}
          </p>
        </div>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
            'transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100',
            tone.icon,
          )}
        >
          {icon}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        {sub ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">{sub}</span>
        ) : (
          <span />
        )}
        <Sparkline data={sparkline} color={tone.spark} className="shrink-0" />
      </div>
    </Comp>
  );
};

// ─── SectionCard ─────────────────────────────────────────────────────────────

export const SectionCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      'rounded-2xl border border-border bg-card text-card-foreground shadow-soft',
      'transition-shadow duration-200',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  icon,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5',
      className,
    )}
  >
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/** Link "Ver todos" com seta que desliza no hover — feedback direcional claro. */
export const SectionLink: React.FC<{
  label?: string;
  onClick: () => void;
  className?: string;
}> = ({ label = 'Ver todos', onClick, className }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'group inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 text-[11.5px] font-semibold text-muted-foreground',
      'transition-colors hover:text-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      className,
    )}
  >
    {label}
    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
  </button>
);

// ─── StatusBadge ─────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral:
    'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/30',
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  warning:
    'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  danger:
    'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/30',
};

export const StatusBadge: React.FC<{
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
      TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

// ─── InteractiveRow ──────────────────────────────────────────────────────────

export interface InteractiveRowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * Linha de lista clicável. Renderiza `<button>` quando há `onClick` — antes
 * usava-se `<div onClick>`, que não recebe foco por teclado nem é anunciado
 * como controle por leitores de tela.
 */
export const InteractiveRow: React.FC<InteractiveRowProps> = ({
  icon,
  title,
  meta,
  trailing,
  onClick,
  className,
}) => {
  const Comp: any = onClick ? 'button' : 'div';

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left',
        'transition-colors duration-150',
        onClick &&
          'hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        className,
      )}
    >
      {icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-foreground">{title}</span>
        {meta && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{meta}</span>
        )}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-1.5">{trailing}</span>}
    </Comp>
  );
};

// ─── StockMeter ──────────────────────────────────────────────────────────────

/**
 * Barra de proporção estoque/mínimo. Inclui `role="progressbar"` para que a
 * informação não dependa apenas da cor — antes era um par de números soltos.
 */
export const StockMeter: React.FC<{
  current: number;
  min: number;
  className?: string;
}> = ({ current, min, className }) => {
  const ratio = min > 0 ? Math.min(current / min, 1) : 1;
  const percent = Math.round(ratio * 100);
  const critical = ratio < 0.5;

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Estoque em ${percent}% do mínimo`}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          critical ? 'bg-rose-500' : 'bg-amber-500',
        )}
        style={{ width: `${Math.max(percent, 4)}%` }}
      />
    </div>
  );
};

// ─── DataTable ───────────────────────────────────────────────────────────────

export interface DataColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Oculta a coluna em telas pequenas para priorizar o essencial no mobile. */
  hideBelow?: 'sm' | 'md' | 'lg';
  render: (row: T) => React.ReactNode;
}

const HIDE_CLASS: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

const ALIGN_CLASS = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  isLoading = false,
  skeletonRows = 4,
  className,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  isLoading?: boolean;
  skeletonRows?: number;
  className?: string;
}) {
  // Durante o carregamento a lista chega vazia; sem este ramo a tabela
  // mostraria "nenhum pedido" por um instante e só depois os dados reais.
  if (isLoading) {
    return (
      <div className={cn('w-full', className)} aria-busy="true" aria-live="polite">
        <div className="border-b border-border bg-muted/50 px-4 py-2.5">
          <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted-foreground/20" />
        </div>
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
            <div className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded-full bg-muted" />
            <div className="hidden h-3 w-20 animate-pulse rounded-full bg-muted sm:block" />
            <div className="h-3 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
                  ALIGN_CLASS[col.align ?? 'left'],
                  col.hideBelow && HIDE_CLASS[col.hideBelow],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'border-b border-border/60 last:border-0 transition-colors duration-150',
                onRowClick &&
                  'cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3 align-middle text-[12.5px] text-foreground',
                    ALIGN_CLASS[col.align ?? 'left'],
                    col.hideBelow && HIDE_CLASS[col.hideBelow],
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Skeleton de lista ───────────────────────────────────────────────────────

/** Placeholder de linhas enquanto uma lista carrega. */
export const ListSkeleton: React.FC<{ rows?: number; className?: string }> = ({
  rows = 4,
  className,
}) => (
  <div className={cn('space-y-0.5', className)} aria-busy="true">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center gap-3 px-2.5 py-2">
        <div className="h-8 w-8 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-2/5 animate-pulse rounded-full bg-muted" />
          <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-5 w-12 animate-pulse rounded-md bg-muted" />
      </div>
    ))}
  </div>
);

// ─── EmptyBlock ──────────────────────────────────────────────────────────────

export const EmptyBlock: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    {icon && (
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
        {icon}
      </span>
    )}
    <p className="text-[13px] font-semibold text-foreground">{title}</p>
    {description && (
      <p className="mt-1 max-w-[22rem] text-[11.5px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
