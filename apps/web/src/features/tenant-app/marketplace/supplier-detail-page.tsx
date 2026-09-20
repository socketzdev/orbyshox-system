import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Calendar,
  Package,
  ShoppingCart,
  Receipt,
  Power,
  Truck,
  FileText,
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
import { apiGet, apiPatch } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';

interface SupplierDetail {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  leadTimeDays: number;
  minOrderCents: number;
  isActive: boolean;
  notes: string | null;
  products: Array<{
    id: string;
    supplierSku: string | null;
    costCents: number;
    packSize: number;
    isPreferred: boolean;
    product: {
      id: string;
      name: string;
      salePriceCents: number;
      stockQuantity: number;
      unit: string;
    };
  }>;
  _count: { products: number; orders: number; nfeEntries: number };
}

export const SupplierDetailPage: React.FC = () => {
  const { supplierId } = useParams<{ supplierId: string }>();
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: supplier, isLoading } = useQuery<SupplierDetail>({
    queryKey: ['supplier', slug, supplierId],
    queryFn: () => apiGet(`/tenant-app/${slug}/suppliers/${supplierId}`),
    enabled: !!supplierId,
    refetchInterval: 30000,
  });

  const toggle = useMutation({
    mutationFn: () => apiPatch(`/tenant-app/${slug}/suppliers/${supplierId}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', slug, supplierId] });
      toast.success('Status atualizado');
    },
  });

  if (isLoading) return <PageLoader label="Carregando fornecedor..." />;
  if (!supplier) {
    return (
      <CossPanel>
        <CossEmpty
          icon={<Building2 className="w-5 h-5" />}
          title="Fornecedor não encontrado"
          description="O fornecedor pode ter sido removido ou o link está incorreto."
          action={
            <Button size="sm" onClick={() => navigate(`${base}/marketplace/suppliers`)} className="rounded-xl">
              Voltar à lista
            </Button>
          }
        />
      </CossPanel>
    );
  }

  const margin = (cost: number, sale: number) => (sale > 0 ? (((sale - cost) / sale) * 100).toFixed(1) : '—');

  return (
    <div className="space-y-5 font-sans pb-12">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`${base}/marketplace/suppliers`)}
          className="h-9 w-9 p-0 rounded-xl border-zinc-200"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{supplier.tradeName || supplier.legalName}</h1>
            {supplier.isActive ? (
              <CossBadge variant="success">Ativo</CossBadge>
            ) : (
              <CossBadge variant="outline">Inativo</CossBadge>
            )}
          </div>
          <p className="text-xs text-zinc-500">{supplier.legalName}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggle.mutate()}
          className="h-9 px-3.5 text-xs font-bold rounded-xl border-zinc-200 gap-1.5"
        >
          <Power className="w-3.5 h-3.5" />
          {supplier.isActive ? 'Desativar' : 'Ativar'}
        </Button>
        <Button
          size="sm"
          onClick={() => navigate(`${base}/marketplace/purchase-orders/new?supplierId=${supplier.id}`)}
          className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Novo pedido
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CossPanel className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Contato</span>
            <Building2 className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="space-y-1.5 text-xs">
            {supplier.cnpj && (
              <div>
                <span className="text-[10px] text-zinc-400 block">CNPJ</span>
                <span className="font-mono font-semibold text-zinc-800">{supplier.cnpj}</span>
              </div>
            )}
            {supplier.email && (
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                <span className="text-zinc-700 truncate">{supplier.email}</span>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-zinc-400" />
                <span className="text-zinc-700">{supplier.phone}</span>
              </div>
            )}
          </div>
        </CossPanel>

        <CossPanel className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Operacional</span>
            <Truck className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Lead time</span>
              <CossBadge variant="neutral">{supplier.leadTimeDays} dias</CossBadge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Pedido mínimo</span>
              <span className="font-mono font-bold text-zinc-800">{formatCurrency(supplier.minOrderCents)}</span>
            </div>
          </div>
        </CossPanel>

        <CossPanel className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Atividade</span>
            <Receipt className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-2xl font-extrabold text-zinc-900 block">{supplier._count.products}</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">SKUs</span>
            </div>
            <div>
              <span className="text-2xl font-extrabold text-zinc-900 block">{supplier._count.orders}</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Pedidos</span>
            </div>
            <div>
              <span className="text-2xl font-extrabold text-zinc-900 block">{supplier._count.nfeEntries}</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">NF-e</span>
            </div>
          </div>
        </CossPanel>
      </div>

      <CossPanel className="p-0 overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-zinc-500" />
              Catálogo do Fornecedor
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Produtos vinculados a este fornecedor com custo e margem.
            </p>
          </div>
        </div>
        {supplier.products.length === 0 ? (
          <CossEmpty
            icon={<Package className="w-5 h-5" />}
            title="Nenhum produto vinculado"
            description="Vincule produtos do seu catálogo a este fornecedor para controlar custo, lead time e pedidos automáticos."
            action={
              <Link
                to={`${base}/products`}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition"
              >
                Ir para Produtos
              </Link>
            }
          />
        ) : (
          <CossTable>
            <CossTableHeader>
              <tr>
                <CossTableHead>Produto</CossTableHead>
                <CossTableHead>SKU Fornecedor</CossTableHead>
                <CossTableHead className="text-right">Custo</CossTableHead>
                <CossTableHead className="text-right">Venda</CossTableHead>
                <CossTableHead className="text-center">Margem</CossTableHead>
                <CossTableHead className="text-center">Estoque</CossTableHead>
                <CossTableHead className="text-center">Preferido</CossTableHead>
              </tr>
            </CossTableHeader>
            <CossTableBody>
              {supplier.products.map((ps) => (
                <CossTableRow key={ps.id}>
                  <CossTableCell>
                    <p className="font-bold text-zinc-900 text-sm">{ps.product.name}</p>
                    <p className="text-[11px] text-zinc-500">{ps.product.unit}</p>
                  </CossTableCell>
                  <CossTableCell>
                    <span className="font-mono text-[11px] text-zinc-600">{ps.supplierSku || '—'}</span>
                  </CossTableCell>
                  <CossTableCell className="text-right font-mono font-semibold text-zinc-800">
                    {formatCurrency(ps.costCents)}
                  </CossTableCell>
                  <CossTableCell className="text-right font-mono font-semibold text-zinc-800">
                    {formatCurrency(ps.product.salePriceCents)}
                  </CossTableCell>
                  <CossTableCell className="text-center">
                    <CossBadge variant={Number(margin(ps.costCents, ps.product.salePriceCents)) >= 30 ? 'success' : 'neutral'}>
                      {margin(ps.costCents, ps.product.salePriceCents)}%
                    </CossBadge>
                  </CossTableCell>
                  <CossTableCell className="text-center font-mono font-bold">
                    {ps.product.stockQuantity} {ps.product.unit}
                  </CossTableCell>
                  <CossTableCell className="text-center">
                    {ps.isPreferred ? (
                      <CossBadge variant="success">★ Preferido</CossBadge>
                    ) : (
                      <span className="text-[10px] text-zinc-400">—</span>
                    )}
                  </CossTableCell>
                </CossTableRow>
              ))}
            </CossTableBody>
          </CossTable>
        )}
      </CossPanel>

      {supplier.notes && (
        <CossPanel className="space-y-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Observações
          </span>
          <p className="text-xs text-zinc-700 leading-relaxed">{supplier.notes}</p>
        </CossPanel>
      )}
    </div>
  );
};
