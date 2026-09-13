import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Package,
  AlertTriangle,
  AlertCircle,
  Filter,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CossPanel,
  CossBadge,
  CossTable,
  CossTableHeader,
  CossTableBody,
  CossTableRow,
  CossTableHead,
  CossTableCell,
  CossEmpty,
} from '@/components/coss-ui';
import { PageLoader } from '@/components/ui/page-loader';
import { useTenant } from '../context/tenant-context';
import { apiDelete, apiGet, apiPatch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Batch {
  id: string;
  lotNumber: string;
  quantity: number;
  costCents: number;
  expiryDate: string | null;
  receivedAt: string;
  status: string;
  product: { id: string; name: string; unit: string; sku: string | null; salePriceCents: number };
  nfeEntry: { id: string; nfeNumber: string; issueDate: string } | null;
  purchaseOrder: { id: string; status: string } | null;
}

interface BatchStats {
  critical: number;
  warning: number;
  total: number;
  active: number;
}

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
};

export const BatchesListPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'expiring30' | 'expiring7'>('all');
  const [batchToRemove, setBatchToRemove] = useState<Batch | null>(null);

  const { data: batches = [], isLoading } = useQuery<Batch[]>({
    queryKey: ['batches', slug, filter],
    queryFn: () => {
      const params: any = {};
      if (filter === 'expiring30') params.expiringDays = 30;
      if (filter === 'expiring7') params.expiringDays = 7;
      if (filter === 'all') params.status = 'ACTIVE';
      return apiGet(`/tenant-app/${slug}/batches`, params);
    },
  });

  const { data: stats } = useQuery<BatchStats>({
    queryKey: ['batches-stats', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/batches/stats`),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiPatch(`/tenant-app/${slug}/batches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches', slug] });
      queryClient.invalidateQueries({ queryKey: ['batches-stats', slug] });
      toast.success('Lote atualizado');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/batches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches', slug] });
      queryClient.invalidateQueries({ queryKey: ['batches-stats', slug] });
      toast.success('Lote removido');
    },
  });

  return (
    <div className="space-y-5 font-sans pb-12">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard icon={<Package className="w-4 h-4" />} label="Total de Lotes" value={stats?.total ?? 0} accent="zinc" />
        <StatCard icon={<Calendar className="w-4 h-4" />} label="Ativos" value={stats?.active ?? 0} accent="emerald" />
        <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Vencem em 7 dias" value={stats?.critical ?? 0} accent="rose" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Vencem em 30 dias" value={stats?.warning ?? 0} accent="amber" />
      </div>

      <CossPanel className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">Lotes & Validades</h2>
              <p className="text-xs text-zinc-500">Controle FEFO com alertas de vencimento.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-0.5">
            {[
              { id: 'all', label: 'Todos ativos' },
              { id: 'expiring30', label: 'Até 30 dias' },
              { id: 'expiring7', label: 'Até 7 dias' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id as any)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                  filter === opt.id ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CossPanel>

      {isLoading ? (
        <PageLoader label="Carregando lotes..." />
      ) : batches.length === 0 ? (
        <CossPanel>
          <CossEmpty
            icon={<Calendar className="w-5 h-5" />}
            title="Nenhum lote cadastrado"
            description="Os lotes são criados automaticamente ao receber mercadorias via XML de NF-e ou pedidos de compra."
          />
        </CossPanel>
      ) : (
        <CossPanel className="p-0 overflow-hidden">
          <CossTable>
            <CossTableHeader>
              <tr>
                <CossTableHead>Produto</CossTableHead>
                <CossTableHead>Lote</CossTableHead>
                <CossTableHead className="text-center">Quantidade</CossTableHead>
                <CossTableHead className="text-right">Custo</CossTableHead>
                <CossTableHead className="text-center">Validade</CossTableHead>
                <CossTableHead className="text-center">Origem</CossTableHead>
                <CossTableHead className="text-right">Ações</CossTableHead>
              </tr>
            </CossTableHeader>
            <CossTableBody>
              {batches.map((b) => {
                const days = daysUntil(b.expiryDate);
                const expired = days !== null && days < 0;
                const critical = days !== null && days >= 0 && days <= 7;
                const warning = days !== null && days > 7 && days <= 30;

                return (
                  <CossTableRow key={b.id}>
                    <CossTableCell>
                      <p className="font-bold text-zinc-900 text-sm">{b.product.name}</p>
                      <p className="text-[11px] text-zinc-500">{b.product.unit}</p>
                    </CossTableCell>
                    <CossTableCell>
                      <span className="font-mono text-[11px] text-zinc-700">{b.lotNumber}</span>
                    </CossTableCell>
                    <CossTableCell className="text-center font-mono font-bold text-zinc-800">
                      {b.quantity}
                    </CossTableCell>
                    <CossTableCell className="text-right font-mono font-semibold text-zinc-800">
                      {formatCurrency(b.costCents)}
                    </CossTableCell>
                    <CossTableCell className="text-center">
                      {expired ? (
                        <CossBadge variant="default" className="bg-rose-100 text-rose-800 border-rose-200">
                          Vencido há {Math.abs(days || 0)}d
                        </CossBadge>
                      ) : critical ? (
                        <CossBadge variant="default" className="bg-rose-50 text-rose-700 border-rose-200">
                          <AlertCircle className="w-3 h-3" /> Vence em {days}d
                        </CossBadge>
                      ) : warning ? (
                        <CossBadge variant="default" className="bg-amber-50 text-amber-800 border-amber-200">
                          <AlertTriangle className="w-3 h-3" /> {days}d
                        </CossBadge>
                      ) : (
                        <span className="font-mono text-xs text-zinc-600">{formatDate(b.expiryDate)}</span>
                      )}
                    </CossTableCell>
                    <CossTableCell className="text-center">
                      {b.nfeEntry ? (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          NF-e #{b.nfeEntry.nfeNumber}
                        </span>
                      ) : b.purchaseOrder ? (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          PO {b.purchaseOrder.id.slice(0, 6)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400">Manual</span>
                      )}
                    </CossTableCell>
                    <CossTableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {b.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => update.mutate({ id: b.id, data: { status: 'BLOCKED' } })}
                            className="text-[10px] font-bold text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-lg transition"
                          >
                            Bloquear
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => update.mutate({ id: b.id, data: { status: 'ACTIVE' } })}
                            className="text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition"
                          >
                            Reativar
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Remover lote ${b.lotNumber}`}
                          onClick={() => setBatchToRemove(b)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </CossTableCell>
                  </CossTableRow>
                );
              })}
            </CossTableBody>
          </CossTable>
        </CossPanel>
      )}

      <ConfirmDialog
        open={!!batchToRemove}
        onOpenChange={(v) => !v && setBatchToRemove(null)}
        title="Remover lote?"
        description={
          batchToRemove
            ? `O lote "${batchToRemove.lotNumber}" será excluído permanentemente do estoque. Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Remover lote"
        tone="destructive"
        onConfirm={async () => {
          if (batchToRemove) await remove.mutateAsync(batchToRemove.id);
        }}
      />
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'zinc' | 'emerald' | 'amber' | 'rose';
}
const StatCard: React.FC<StatCardProps> = ({ icon, label, value, accent }) => {
  const colors = {
    zinc: 'bg-zinc-100 text-zinc-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <CossPanel className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${colors[accent]} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <span className="text-2xl font-extrabold text-zinc-900 block leading-none">{value}</span>
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>
      </div>
    </CossPanel>
  );
};
