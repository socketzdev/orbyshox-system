import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Clock,
  DollarSign,
  User,
  CheckCircle2,
  Receipt,
  Search,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

export const OrdersKanbanPage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();

  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['tenant-orders', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/orders`),
    refetchInterval: 10000,
  });

  const filteredOrders = useMemo(() => {
    return orders.filter((order: any) => {
      const matchesMethod = filterMethod === 'ALL' || order.paymentMethod === filterMethod;
      const matchesSearch =
        search === '' ||
        String(order.orderNumber).includes(search) ||
        (order.customer?.name && order.customer.name.toLowerCase().includes(search.toLowerCase())) ||
        order.items?.some((i: any) => i.product?.name?.toLowerCase().includes(search.toLowerCase()));
      return matchesMethod && matchesSearch;
    });
  }, [orders, filterMethod, search]);

  // Calculations
  const totalRevenueCents = orders.reduce((sum: number, o: any) => sum + (o.totalCents || 0), 0);
  const avgTicketCents = orders.length > 0 ? Math.round(totalRevenueCents / orders.length) : 0;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner with Quick Metrics */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-zinc-700" />
              Histórico de Vendas & Comandas
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-zinc-50">
              {orders.length} vendas registradas
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">
            Acompanhe em tempo real todas as vendas e recibos processados no PDV.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="p-2.5 px-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block">
              Total Faturado
            </span>
            <span className="text-sm font-bold text-zinc-900 font-mono">
              R$ {(totalRevenueCents / 100).toFixed(2)}
            </span>
          </div>

          <div className="p-2.5 px-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block">
              Ticket Médio
            </span>
            <span className="text-sm font-bold text-zinc-900 font-mono">
              R$ {(avgTicketCents / 100).toFixed(2)}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => navigate(`${base}/pos`)}
            className="h-9 px-3 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-sm flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Nova Venda</span>
          </Button>
        </div>
      </div>

      {/* Filter and Orders List */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar por número do pedido, cliente ou item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl border-zinc-200 bg-zinc-50/50"
            />
          </div>

          {/* Payment Method Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'ALL', label: 'Todas as Vendas' },
              { id: 'PIX', label: 'Pix' },
              { id: 'CASH', label: 'Dinheiro' },
              { id: 'CREDIT_CARD', label: 'Crédito' },
              { id: 'DEBIT_CARD', label: 'Débito' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMethod(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                  filterMethod === tab.id
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-zinc-100 bg-zinc-50 animate-pulse h-16" />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <ErpEmptyState
            icon={ClipboardList}
            title="Nenhum pedido encontrado"
            description="Nenhuma venda corresponde aos filtros selecionados. Abra o PDV para realizar atendimentos."
            actionLabel="Frente de Caixa (PDV)"
            onAction={() => navigate(`${base}/pos`)}
          />
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredOrders.map((order: any) => (
              <div
                key={order.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-zinc-50/60 px-3 rounded-xl transition"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white font-mono font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    #{order.orderNumber}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 text-sm">
                        Pedido #{order.orderNumber}
                      </span>
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Concluído
                      </Badge>
                    </div>

                    <p className="text-zinc-600 mt-1 truncate max-w-xl">
                      {order.items?.map((item: any) => `${item.quantity}x ${item.product?.name}`).join(', ')}
                    </p>

                    <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {new Date(order.createdAt).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {order.customer ? order.customer.name : 'Consumidor Final'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:text-right shrink-0">
                  <div>
                    <Badge variant="outline" className="text-[10px] font-bold uppercase mb-1 bg-zinc-50">
                      {order.paymentMethod}
                    </Badge>
                    <p className="text-base font-bold text-zinc-900 font-mono">
                      R$ {(order.totalCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
