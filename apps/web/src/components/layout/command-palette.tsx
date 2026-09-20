import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CornerDownLeft,
  CreditCard,
  FileSpreadsheet,
  Headphones,
  HelpCircle,
  History,
  Keyboard,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  PlusCircle,
  Search as SearchIcon,
  Settings,
  Sliders,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTheme } from '@/providers/theme-provider';
import { useSearch } from '@/providers/search-provider';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ResultKind = 'tenant' | 'ticket' | 'invoice' | 'article';

interface SearchResultItem {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  detail?: string;
  status?: string;
  href: string;
}

interface SearchResponse {
  query: string;
  data: SearchResultItem[];
  total: number;
}

type ActionItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  group: 'navigation' | 'actions';
  shortcut?: string;
  keywords: string[];
  perform: (helpers: CommandHelpers) => void;
};

type RecentItem = {
  id: string;
  label: string;
  href: string;
  icon?: React.ElementType;
  ts: number;
};

interface CommandHelpers {
  navigate: (href: string) => void;
  close: () => void;
  pushRecent: (item: Omit<RecentItem, 'ts'>) => void;
}

const RESULT_META: Record<ResultKind, { icon: React.ElementType; label: string; tone: string; pill: string }> = {
  tenant: { icon: Building2, label: 'Clientes', tone: 'text-sky-700 bg-sky-50 border-sky-200', pill: 'bg-sky-50 text-sky-700 border-sky-200' },
  ticket: { icon: Headphones, label: 'Tickets', tone: 'text-amber-700 bg-amber-50 border-amber-200', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  invoice: { icon: CreditCard, label: 'Faturas', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  article: { icon: BookOpen, label: 'Artigos', tone: 'text-violet-700 bg-violet-50 border-violet-200', pill: 'bg-violet-50 text-violet-700 border-violet-200' },
};

const RECENT_STORAGE_KEY = 'saas-search-recent';
const MAX_RECENT_ITEMS = 6;

function loadRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.href === 'string').slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

function persistRecent(items: RecentItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_ITEMS)));
  } catch {
    // ignore quota issues silently
  }
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safeQuery})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="rounded-sm bg-primary/15 px-0.5 text-primary"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

export const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { open, closeSearch } = useSearch();
  const { logout } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>(() => loadRecent());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus handled by Radix autoFocus on first interactive child
    }
  }, [open]);

  const pushRecent = useCallback((item: Omit<RecentItem, 'ts'>) => {
    setRecent((current) => {
      const next: RecentItem[] = [
        { ...item, ts: Date.now() },
        ...current.filter((entry) => entry.href !== item.href),
      ].slice(0, MAX_RECENT_ITEMS);
      persistRecent(next);
      return next;
    });
  }, []);

  const goTo = useCallback(
    (href: string) => {
      navigate(href);
      closeSearch();
    },
    [navigate, closeSearch],
  );

  const actionItems = useMemo<ActionItem[]>(() => {
    const helpers: CommandHelpers = { navigate: goTo, close: closeSearch, pushRecent };
    return [
      { id: 'nav-dashboard', title: 'Ir para Dashboard', subtitle: 'Visão geral', icon: LayoutDashboard, group: 'navigation', shortcut: 'G D', keywords: ['dashboard', 'inicio', 'home'], perform: () => goTo('/dashboard') },
      { id: 'nav-tenants', title: 'Gerenciar Clientes', subtitle: 'Tenants e assinaturas', icon: Building2, group: 'navigation', shortcut: 'G T', keywords: ['clientes', 'tenants', 'empresas'], perform: () => goTo('/tenants') },
      { id: 'nav-billing', title: 'Visão Financeira', subtitle: 'Faturamento consolidado', icon: LayoutDashboard, group: 'navigation', keywords: ['financeiro', 'faturas', 'billing'], perform: () => goTo('/billing') },
      { id: 'nav-invoices', title: 'Faturas & Cobranças', subtitle: 'Histórico de pagamentos', icon: CreditCard, group: 'navigation', keywords: ['faturas', 'cobranca'], perform: () => goTo('/billing/invoices') },
      { id: 'nav-delinquency', title: 'Inadimplência', subtitle: 'Clientes em risco', icon: Sliders, group: 'navigation', keywords: ['inadimplencia', 'atraso'], perform: () => goTo('/billing/delinquency') },
      { id: 'nav-projection', title: 'Projeção MRR', subtitle: 'Receita recorrente', icon: Terminal, group: 'navigation', keywords: ['projecao', 'mrr'], perform: () => goTo('/billing/projection') },
      { id: 'nav-tickets', title: 'Suporte & Chamados', subtitle: 'Tickets operacionais', icon: Headphones, group: 'navigation', shortcut: 'G S', keywords: ['suporte', 'tickets', 'chamados'], perform: () => goTo('/tickets') },
      { id: 'nav-knowledge', title: 'Base de Conhecimento', subtitle: 'Artigos da KB', icon: BookOpen, group: 'navigation', keywords: ['base', 'conhecimento', 'kb', 'artigos'], perform: () => goTo('/knowledge') },
      { id: 'nav-staff', title: 'Equipe Interna', subtitle: 'Operadores e permissões', icon: PlusCircle, group: 'navigation', keywords: ['equipe', 'staff', 'usuarios internos'], perform: () => goTo('/staff') },
      { id: 'nav-settings', title: 'Configurações Globais', subtitle: 'Ajustes da plataforma', icon: Settings, group: 'navigation', shortcut: 'G ,', keywords: ['configuracoes', 'settings'], perform: () => goTo('/settings') },
      { id: 'nav-audit', title: 'Logs de Auditoria', subtitle: 'Eventos do operador', icon: Terminal, group: 'navigation', keywords: ['auditoria', 'logs', 'historico'], perform: () => goTo('/audit') },
      { id: 'nav-help', title: 'Central de Ajuda', subtitle: 'Documentação rápida', icon: HelpCircle, group: 'navigation', keywords: ['ajuda', 'help', 'documentacao'], perform: () => goTo('/notifications') },

      { id: 'act-theme', title: theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro', subtitle: 'Modo de visualização', icon: theme === 'dark' ? Sun : Moon, group: 'actions', shortcut: '⌘ .', keywords: ['tema', 'claro', 'escuro', 'theme'], perform: () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        toast.success(`Tema ${next === 'dark' ? 'escuro' : 'claro'} ativado`);
        closeSearch();
      } },
      { id: 'act-export', title: 'Exportar relatório CSV', subtitle: 'Snapshot da operação', icon: FileSpreadsheet, group: 'actions', shortcut: '⌘ E', keywords: ['exportar', 'csv', 'relatorio'], perform: () => {
        toast.info('Selecione uma página e use o botão "Exportar CSV" para gerar relatórios específicos.');
        closeSearch();
      } },
      { id: 'act-logout', title: 'Encerrar sessão', subtitle: 'Sair com segurança', icon: LogOut, group: 'actions', keywords: ['logout', 'sair', 'encerrar'], perform: () => {
        helpers.pushRecent({ id: 'logout', label: 'Encerrar sessão', href: '/login', icon: LogOut });
        logout();
        goTo('/login');
      } },
    ];
  }, [theme, setTheme, goTo, closeSearch, pushRecent, logout]);

  const filteredActions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return actionItems;
    return actionItems.filter((item) => {
      const haystack = `${item.title} ${item.subtitle} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [actionItems, query]);

  const trimmedQuery = query.trim();
  const shouldFetchRemote = trimmedQuery.length >= 2;

  const { data: remoteResults, isFetching: isLoadingRemote, isError: isRemoteError } = useQuery<SearchResponse>({
    queryKey: ['global-search', trimmedQuery],
    queryFn: () => apiGet<SearchResponse>('/search', { q: trimmedQuery, limit: 5 }),
    enabled: open && shouldFetchRemote,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 2,
  });

  type FlatItem =
    | { kind: 'action'; item: ActionItem }
    | { kind: 'result'; item: SearchResultItem }
    | { kind: 'recent'; item: RecentItem };

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    filteredActions.forEach((item) => items.push({ kind: 'action', item }));
    if (shouldFetchRemote && remoteResults?.data?.length) {
      remoteResults.data.forEach((item) => items.push({ kind: 'result', item }));
    } else if (!shouldFetchRemote && recent.length) {
      recent.forEach((item) => items.push({ kind: 'recent', item }));
    }
    return items;
  }, [filteredActions, remoteResults, recent, shouldFetchRemote]);

  // Keep active item in range as list changes
  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(flatItems.length - 1, 0)));
  }, [flatItems.length]);

  // Scroll active item into view inside the results list
  useEffect(() => {
    if (!listRef.current) return;
    const element = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const selectEntry = useCallback((entry: FlatItem | undefined) => {
    if (!entry) return;
    if (entry.kind === 'action') {
      entry.item.perform({ navigate: goTo, close: closeSearch, pushRecent });
      return;
    }
    if (entry.kind === 'result') {
      pushRecent({ id: `result-${entry.item.id}`, label: entry.item.title, href: entry.item.href, icon: RESULT_META[entry.item.kind].icon });
      goTo(entry.item.href);
    }
    if (entry.kind === 'recent') {
      goTo(entry.item.href);
    }
  }, [goTo, closeSearch, pushRecent]);

  const selectActive = useCallback(() => {
    selectEntry(flatItems[activeIndex]);
  }, [flatItems, activeIndex, selectEntry]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (flatItems.length === 0 ? 0 : (current + 1) % flatItems.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (flatItems.length === 0 ? 0 : (current - 1 + flatItems.length) % flatItems.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectActive();
    }
  };

  const grouped = useMemo(() => {
    const sections: Array<{
      key: 'navigation' | 'actions' | 'remote' | 'recent';
      title: string;
      icon?: React.ElementType;
      items: Array<{ index: number; entry: FlatItem }>;
    }> = [];

    let cursor = 0;

    const navigation = filteredActions.filter((item) => item.group === 'navigation');
    const actions = filteredActions.filter((item) => item.group === 'actions');

    if (navigation.length) {
      sections.push({
        key: 'navigation',
        title: 'Navegação',
        icon: LayoutDashboard,
        items: navigation.map((item) => {
          const index = cursor++;
          return { index, entry: { kind: 'action', item } };
        }),
      });
    }

    if (actions.length) {
      sections.push({
        key: 'actions',
        title: 'Ações rápidas',
        icon: Keyboard,
        items: actions.map((item) => {
          const index = cursor++;
          return { index, entry: { kind: 'action', item } };
        }),
      });
    }

    if (shouldFetchRemote && remoteResults?.data?.length) {
      sections.push({
        key: 'remote',
        title: `Resultados para "${trimmedQuery}"`,
        icon: SearchIcon,
        items: remoteResults.data.map((item) => {
          const index = cursor++;
          return { index, entry: { kind: 'result', item } };
        }),
      });
    } else if (!shouldFetchRemote && recent.length) {
      sections.push({
        key: 'recent',
        title: 'Recentes',
        icon: History,
        items: recent.map((item) => {
          const index = cursor++;
          return { index, entry: { kind: 'recent', item } };
        }),
      });
    }

    return sections;
  }, [filteredActions, remoteResults, recent, shouldFetchRemote, trimmedQuery]);

  const totalCount = flatItems.length;
  const showSkeleton = shouldFetchRemote && isLoadingRemote && !remoteResults;
  const showRemoteError = shouldFetchRemote && isRemoteError && !isLoadingRemote;

  const renderEntry = (index: number, entry: FlatItem, children: React.ReactNode) => {
    const isActive = index === activeIndex;
    return (
      <button
        type="button"
        data-cmd-index={index}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectEntry(entry)}
        className={cn(
          'group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
          isActive
            ? 'bg-secondary text-foreground ring-1 ring-border'
            : 'text-foreground/90 hover:bg-secondary/70',
        )}
      >
        {children}
      </button>
    );
  };

  const renderActionRow = (index: number, item: ActionItem) => {
    const Icon = item.icon;
    return renderEntry(
      index,
      { kind: 'action', item },
      <>
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              <HighlightedText text={item.title} query={query.trim()} />
            </p>
            <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.shortcut && (
            <kbd className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
              {item.shortcut}
            </kbd>
          )}
          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 text-muted-foreground" />
        </div>
      </>,
    );
  };

  const renderResultRow = (index: number, item: SearchResultItem) => {
    const meta = RESULT_META[item.kind];
    const Icon = meta.icon;
    return renderEntry(
      index,
      { kind: 'result', item },
      <>
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg border', meta.tone)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              <HighlightedText text={item.title} query={trimmedQuery} />
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {item.subtitle ? <HighlightedText text={item.subtitle} query={trimmedQuery} /> : meta.label}
              {item.detail && (
                <>
                  <span className="mx-1 text-muted-foreground/60">·</span>
                  <span>{item.detail}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.08em]', meta.pill)}>
            {meta.label}
          </span>
          <CornerDownLeft className="h-3.5 w-3.5 opacity-0 transition-all group-hover:opacity-100 text-muted-foreground" />
        </div>
      </>,
    );
  };

  const renderRecentRow = (index: number, item: RecentItem) => {
    const Icon = item.icon || History;
    return renderEntry(
      index,
      { kind: 'recent', item },
      <>
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{item.label}</p>
            <p className="truncate text-xs text-muted-foreground font-mono">{item.href}</p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Recente</span>
      </>,
    );
  };

  const hasAnyContent = grouped.length > 0;
  const showEmpty = !showSkeleton && !hasAnyContent;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeSearch())}>
      <DialogContent
        className="p-0 max-w-xl overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-elevated sm:mt-[12vh] sm:top-0 sm:translate-y-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, tickets, faturas ou executar comandos…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
            aria-label="Buscar no painel"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {showSkeleton && (
            <div className="space-y-2 px-1 py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-secondary" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-secondary" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-secondary/70" />
                  </div>
                </div>
              ))}
              <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] font-mono text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando em clientes, tickets e faturas…
              </p>
            </div>
          )}

          {!showSkeleton && hasAnyContent && (
            <div className="space-y-3">
              {grouped.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <div key={section.key}>
                    <div className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {SectionIcon && <SectionIcon className="h-3 w-3" />}
                      <span>{section.title}</span>
                    </div>
                    <div className="space-y-0.5">
                      {section.items.map(({ index, entry }) => {
                        if (entry.kind === 'action') return <React.Fragment key={entry.item.id}>{renderActionRow(index, entry.item)}</React.Fragment>;
                        if (entry.kind === 'result') return <React.Fragment key={`${entry.item.kind}-${entry.item.id}`}>{renderResultRow(index, entry.item)}</React.Fragment>;
                        return <React.Fragment key={`recent-${entry.item.id}`}>{renderRecentRow(index, entry.item)}</React.Fragment>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showRemoteError && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600">
                <SearchIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">A busca está indisponível</p>
                <p className="mt-1 text-xs text-muted-foreground">Não foi possível sincronizar os dados agora. Tente novamente em alguns segundos.</p>
              </div>
            </div>
          )}

          {showEmpty && !showRemoteError && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground">
                <SearchIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Nada encontrado por aqui</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tente outro termo ou navegue pelas categorias acima. Use <kbd className="rounded bg-secondary px-1">↑</kbd> <kbd className="rounded bg-secondary px-1">↓</kbd> e <kbd className="rounded bg-secondary px-1">↵</kbd> para interagir.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="rounded bg-card px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">↑↓</kbd>
            <span>navegar</span>
            <kbd className="ml-2 rounded bg-card px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">↵</kbd>
            <span>abrir</span>
            <kbd className="ml-2 rounded bg-card px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">ESC</kbd>
            <span>fechar</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span>{totalCount > 0 ? `${totalCount} resultado${totalCount === 1 ? '' : 's'}` : 'Pronto para buscar'}</span>
            <span className="flex items-center gap-1">
              <Keyboard className="h-3 w-3" /> Orbyshox v2.4
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
