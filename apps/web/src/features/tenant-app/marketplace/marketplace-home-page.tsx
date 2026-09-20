import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Truck,
  ShoppingCart,
  FileText,
  Calendar,
  Sparkles,
  ArrowRight,
  Plus,
  Package,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '../context/tenant-context';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  ACCENT,
  DataTable,
  EmptyBlock,
  InteractiveRow,
  ListSkeleton,
  SectionCard,
  SectionHeader,
  SectionLink,
  StatCard,
  StatusBadge,
  StockMeter,
  type DataColumn,
  type Tone,
} from './marketplace-ui';
import { OrdersStatusChart, SpendTrendChart } from './marketplace-charts';

interface BatchStats {
  critical: number;
  warning: number;
  total: number;
  active: number;
}

interface Suggestion {
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  suggestedQty: number;
  preferredSupplier?: { id: string; name: string; costCents: number };
}

interface Supplier {
  id: string;
  isActive: boolean;
  tradeName?: string | null;
  legalName?: string | null;
  _count: { products: number; orders: number };
}

interface PurchaseOrder {
  id: string;
  status: string;
  totalCents: number;
  expectedDate: string | null;
  createdAt: string;
  supplier: { id: string; tradeName: string | null; legalName: string };
  _count: { items: number };
}

interface Nfe {
  id: string;
  status: string;
  totalCents: number;
  issueDate: string;
  nfeNumber: string;
}

const OPEN_STATUSES = ['DRAFT', 'SENT', 'CONFIRMED', 'RECEIVING'];

const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  SENT: { label: 'Enviado', tone: 'info' },
  CONFIRMED: { label: 'Confirmado', tone: 'info' },
  RECEIVING: { label: 'Recebendo', tone: 'warning' },
  RECEIVED: { label: 'Recebido', tone: 'success' },
  CANCELED: { label: 'Cancelado', tone: 'neutral' },
};

const NFE_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_RECONCILE: { label: 'Pendente', tone: 'warning' },
  RECONCILED: { label: 'Conciliada', tone: 'info' },
  STOCKED: { label: 'Estocada', tone: 'success' },
};

const MONTHS_WINDOW = 6;

export const MarketplaceHomePage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();

  const { data: stats, isLoading: loadingStats } = useQuery<BatchStats>({
    queryKey: ['batches-stats', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/batches/stats`),
    refetchInterval: 30000,
  });

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/suppliers`),
    refetchInterval: 30000,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', slug, 'home'],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-orders`),
    refetchInterval: 30000,
  });

  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery<Suggestion[]>({
    queryKey: ['purchase-suggestions', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/purchase-orders/suggestions`),
    refetchInterval: 30000,
  });

  const { data: nfes = [], isLoading: loadingNfe } = useQuery<Nfe[]>({
    queryKey: ['nfe-home', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/nfe`),
    refetchInterval: 30000,
  });

  const go = (path: string) => navigate(`${base}/marketplace${path}`);

  const openOrders = useMemo(
    () => orders.filter((o) => OPEN_STATUSES.includes(o.status)),
    [orders],
  );
  const pendingNfe = nfes.filter((n) => n.status === 'PENDING_RECONCILE').length;

  /**
   * Série mensal derivada dos pedidos existentes — nenhum dado novo é buscado e
   * nenhum valor é inventado: meses sem pedidos entram com zero.
   */
  const monthly = useMemo(() => {
    const buckets: Array<{ label: string; total: number; count: number }> = [];
    const now = new Date();

    for (let i = MONTHS_WINDOW - 1; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        total: 0,
        count: 0,
      });
    }

    const indexOf = (value: string) => {
      const date = new Date(value);
      const diff =
        (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      const index = MONTHS_WINDOW - 1 - diff;
      return index >= 0 && index < MONTHS_WINDOW ? index : -1;
    };

    for (const order of orders) {
      const index = indexOf(order.createdAt);
      if (index === -1) continue;
      buckets[index].total += order.totalCents / 100;
      buckets[index].count += 1;
    }

    return buckets;
  }, [orders]);

  const statusSeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    }

    const palette: Record<string, 'sky' | 'amber' | 'emerald' | 'slate' | 'rose'> = {
      DRAFT: 'slate',
      SENT: 'sky',
      CONFIRMED: 'sky',
      RECEIVING: 'amber',
      RECEIVED: 'emerald',
      CANCELED: 'rose',
    };

    return [...counts.entries()]
      .map(([status, value]) => ({
        label: ORDER_STATUS[status]?.label ?? status,
        value,
        colorToken: (palette[status] ?? 'slate') as 'sky' | 'amber' | 'emerald' | 'slate' | 'rose',
      }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  const openOrdersTotal = openOrders.reduce((acc, o) => acc + o.totalCents, 0);
  const isLoading = loadingStats || loadingSuppliers || loadingOrders || loadingNfe;

  const orderColumns: DataColumn<PurchaseOrder>[] = [
    {
      key: 'supplier',
      header: 'Fornecedor',
      render: (o) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border">
            <Truck className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-semibold text-foreground">
            {o.supplier?.tradeName || o.supplier?.legalName || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Criado',
      hideBelow: 'md',
      render: (o) => <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>,
    },
    {
      key: 'items',
      header: 'Itens',
      align: 'center',
      hideBelow: 'sm',
      render: (o) => <span className="tabular-nums">{o._count?.items ?? 0}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => (
        <span className="font-semibold tabular-nums">{formatCurrency(o.totalCents)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (o) => {
        const status = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'neutral' as Tone };
        return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
      },
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-12">
      {/* Cabeçalho ---------------------------------------------------------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
              Central de Compras
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Fornecedores, pedidos, lotes e NF-e em um só lugar.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => go('/batches')}
            className="h-9 rounded-xl"
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Lotes
          </Button>
          <Button size="sm" onClick={() => go('/purchase-orders/new')} className="h-9 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo pedido
          </Button>
        </div>
      </header>

      {/* KPIs ---------------------------------------------------------------- */}
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Fornecedores"
          value={suppliers.length}
          icon={<Truck className="h-[17px] w-[17px]" />}
          accent="violet"
          sub={`${suppliers.filter((s) => s.isActive).length} ativos`}
          onClick={() => go('/suppliers')}
          isLoading={isLoading}
        />
        <StatCard
          label="Pedidos abertos"
          value={openOrders.length}
          icon={<ShoppingCart className="h-[17px] w-[17px]" />}
          accent="amber"
          sub={formatCurrency(openOrdersTotal)}
          sparkline={monthly.map((m) => m.count)}
          onClick={() => go('/purchase-orders')}
          isLoading={isLoading}
        />
        <StatCard
          label="Lotes ativos"
          value={stats?.active ?? 0}
          icon={<Package className="h-[17px] w-[17px]" />}
          accent={stats?.critical ? 'rose' : 'emerald'}
          sub={`${stats?.critical ?? 0} vencem em 7 dias`}
          onClick={() => go('/batches')}
          isLoading={isLoading}
        />
        <StatCard
          label="NF-e pendentes"
          value={pendingNfe}
          icon={<FileText className="h-[17px] w-[17px]" />}
          accent={pendingNfe ? 'amber' : 'emerald'}
          sub={`${nfes.length} no total`}
          onClick={() => go('/nfe')}
          isLoading={isLoading}
        />
      </section>

      {/* Gráficos ------------------------------------------------------------ */}
      <section
        aria-label="Análise de compras"
        className="grid grid-cols-1 gap-3 lg:grid-cols-5"
      >
        <SectionCard className="lg:col-span-3">
          <SectionHeader
            title="Gasto em compras"
            description={`Últimos ${MONTHS_WINDOW} meses`}
            icon={<TrendingUp className="h-4 w-4" />}
            action={
              <span className="hidden text-[11.5px] font-semibold text-muted-foreground sm:inline">
                {/* `Math.round` corrige o desvio de ponto flutuante ao somar
                    valores convertidos de centavos para reais e voltar. */}
                {formatCurrency(Math.round(monthly.reduce((acc, m) => acc + m.total, 0) * 100))}
              </span>
            }
          />
          <div className="p-4 sm:p-5">
            {loadingOrders ? (
              <div
                className="w-full animate-pulse rounded-xl bg-muted"
                style={{ height: 212 }}
                aria-busy="true"
              />
            ) : (
              <SpendTrendChart data={monthly} accent="indigo" height={212} />
            )}
          </div>
        </SectionCard>

        <SectionCard className="lg:col-span-2">
          <SectionHeader
            title="Pedidos por status"
            description={orders.length ? `${orders.length} no total` : 'Sem pedidos ainda'}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <div className="p-4 sm:p-5">
            {loadingOrders ? (
              <div className="space-y-3" aria-busy="true">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted" />
                    <div
                      className="h-3.5 animate-pulse rounded-full bg-muted"
                      style={{ width: `${80 - index * 15}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : statusSeries.length === 0 ? (
              <EmptyBlock
                icon={<ShoppingCart className="h-5 w-5" />}
                title="Nenhum pedido"
                description="Ao criar pedidos, a distribuição por status aparece aqui."
              />
            ) : (
              <OrdersStatusChart data={statusSeries} />
            )}
          </div>
        </SectionCard>
      </section>

      {/* Reposição sugerida -------------------------------------------------- */}
      {loadingSuggestions ? (
        <SectionCard className="p-5">
          <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
          <div className="mt-4 h-16 animate-pulse rounded-xl bg-muted" />
        </SectionCard>
      ) : (
        suggestions.length > 0 && (
          <SectionCard className="overflow-hidden border-amber-300/60 dark:border-amber-500/25">
            <div className="flex flex-col gap-3 border-b border-amber-200/70 bg-amber-50/70 px-4 py-3.5 dark:border-amber-500/20 dark:bg-amber-500/[0.07] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${ACCENT.amber.icon}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13.5px] font-semibold tracking-tight text-foreground">
                    Reposição sugerida
                  </h3>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {suggestions.length} produto(s) abaixo do estoque mínimo.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => go('/purchase-orders/new')}
                className="h-9 shrink-0 rounded-xl"
              >
                Gerar pedido
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {suggestions.slice(0, 6).map((s) => (
                <div
                  key={s.productId}
                  className="rounded-xl border border-border bg-background p-3 transition-colors duration-150 hover:border-foreground/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-foreground">
                        {s.productName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {s.preferredSupplier
                          ? s.preferredSupplier.name
                          : 'Sem fornecedor preferido'}
                      </p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        {s.currentStock}/{s.minStock}
                      </span>
                      <span className="block text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">
                        +{s.suggestedQty} un.
                      </span>
                    </span>
                  </div>
                  <StockMeter current={s.currentStock} min={s.minStock} className="mt-2.5" />
                </div>
              ))}
            </div>
          </SectionCard>
        )
      )}

      {/* Listas -------------------------------------------------------------- */}
      <section aria-label="Atividade recente" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard>
          <SectionHeader
            title="Top fornecedores"
            icon={<Truck className="h-4 w-4" />}
            action={<SectionLink onClick={() => go('/suppliers')} />}
          />
          <div className="p-2 sm:p-2.5">
            {loadingSuppliers ? (
              <ListSkeleton rows={4} />
            ) : suppliers.length === 0 ? (
              <EmptyBlock
                icon={<Truck className="h-5 w-5" />}
                title="Sem fornecedores"
                description="Cadastre seus primeiros distribuidores para começar a comprar."
                action={
                  <Button size="sm" onClick={() => go('/suppliers')} className="h-9 rounded-xl">
                    Cadastrar
                  </Button>
                }
              />
            ) : (
              <div className="space-y-0.5">
                {suppliers.slice(0, 5).map((s) => (
                  <InteractiveRow
                    key={s.id}
                    icon={<Truck className="h-3.5 w-3.5" />}
                    title={s.tradeName || s.legalName || 'Fornecedor'}
                    meta={`${s._count?.products ?? 0} SKUs cadastrados`}
                    trailing={
                      <>
                        <StatusBadge tone="neutral">{s._count?.orders ?? 0} POs</StatusBadge>
                        {!s.isActive && <StatusBadge tone="danger">Inativo</StatusBadge>}
                      </>
                    }
                    onClick={() => go(`/suppliers/${s.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader
            title="NF-e recentes"
            icon={<FileText className="h-4 w-4" />}
            action={<SectionLink label="Ver todas" onClick={() => go('/nfe')} />}
          />
          <div className="p-2 sm:p-2.5">
            {loadingNfe ? (
              <ListSkeleton rows={4} />
            ) : nfes.length === 0 ? (
              <EmptyBlock
                icon={<FileText className="h-5 w-5" />}
                title="Nenhuma NF-e"
                description="Importe um XML para começar a controlar as entradas."
              />
            ) : (
              <div className="space-y-0.5">
                {nfes.slice(0, 5).map((n) => {
                  const status = NFE_STATUS[n.status] ?? {
                    label: n.status,
                    tone: 'neutral' as Tone,
                  };
                  return (
                    <InteractiveRow
                      key={n.id}
                      icon={
                        <span className="font-mono text-[10px] font-semibold">
                          #{n.nfeNumber}
                        </span>
                      }
                      title={formatDate(n.issueDate)}
                      meta={formatCurrency(n.totalCents)}
                      trailing={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                      onClick={() => go('/nfe')}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>
      </section>

      {/* Pedidos recentes ----------------------------------------------------- */}
      <SectionCard>
        <SectionHeader
          title="Pedidos recentes"
          description={orders.length ? `${orders.length} pedido(s) no histórico` : undefined}
          icon={<ShoppingCart className="h-4 w-4" />}
          action={<SectionLink onClick={() => go('/purchase-orders')} />}
        />
        <DataTable
          columns={orderColumns}
          rows={orders.slice(0, 6)}
          rowKey={(o) => o.id}
          onRowClick={(o) => go(`/purchase-orders/${o.id}`)}
          isLoading={loadingOrders}
          skeletonRows={4}
          empty={
            <EmptyBlock
              icon={<ShoppingCart className="h-5 w-5" />}
              title="Nenhum pedido de compra"
              description="Crie pedidos para seus fornecedores e acompanhe o ciclo completo: cotação, envio, recebimento e estoque."
              action={
                <Button
                  size="sm"
                  onClick={() => go('/purchase-orders/new')}
                  className="h-9 rounded-xl"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Criar primeiro pedido
                </Button>
              }
            />
          }
        />
      </SectionCard>
    </div>
  );
};
