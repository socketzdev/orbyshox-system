import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  MoreHorizontal,
  Power,
  Trash2,
  ExternalLink,
  Filter,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CossPanel,
  CossInput,
  CossLabel,
  CossInputGroup,
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
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Supplier {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  leadTimeDays: number;
  isActive: boolean;
  _count?: { products: number; orders: number; nfeEntries: number };
}

const formatCnpj = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

export const SuppliersListPage: React.FC = () => {
  const { slug, base } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierToRemove, setSupplierToRemove] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', slug, statusFilter],
    queryFn: () => apiGet(`/tenant-app/${slug}/suppliers`, { active: statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : undefined }),
  });

  const filtered = suppliers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.legalName.toLowerCase().includes(q) ||
      (s.tradeName || '').toLowerCase().includes(q) ||
      (s.cnpj || '').includes(q)
    );
  });

  const toggle = useMutation({
    mutationFn: (id: string) => apiPatch(`/tenant-app/${slug}/suppliers/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
      toast.success('Status do fornecedor atualizado');
    },
    onError: () => toast.error('Falha ao atualizar status'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
      toast.success('Fornecedor removido');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Falha ao remover'),
  });

  return (
    <div className="space-y-5 font-sans pb-12">
      <CossPanel className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
                <Truck className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900 tracking-tight">Fornecedores</h2>
                <p className="text-xs text-zinc-500">
                  Cadastre distribuidores e atacadistas para gerar pedidos de compra automatizados.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CossBadge variant="neutral">{suppliers.length} no total</CossBadge>
            <Button
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo fornecedor
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <CossInputGroup
            prefixAddon={<Search className="w-3.5 h-3.5 text-zinc-500" />}
            className="flex-1"
          >
            <input
              type="text"
              placeholder="Buscar por razão social, nome fantasia ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 h-full px-2 bg-transparent text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </CossInputGroup>
          <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-0.5">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativos' },
              { id: 'inactive', label: 'Inativos' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id as any)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === opt.id
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CossPanel>

      {isLoading ? (
        <PageLoader label="Carregando fornecedores..." />
      ) : filtered.length === 0 ? (
        <CossPanel>
          <CossEmpty
            icon={<Truck className="w-5 h-5" />}
            title="Nenhum fornecedor cadastrado"
            description="Cadastre seus distribuidores, atacadistas ou representantes para começar a gerar pedidos de compra automáticos com base em estoque mínimo e curva ABC."
            action={
              <Button
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar primeiro fornecedor
              </Button>
            }
          />
        </CossPanel>
      ) : (
        <CossPanel className="p-0 overflow-hidden">
          <CossTable>
            <CossTableHeader>
              <tr>
                <CossTableHead>Fornecedor</CossTableHead>
                <CossTableHead>CNPJ</CossTableHead>
                <CossTableHead>Contato</CossTableHead>
                <CossTableHead className="text-center">Catálogo</CossTableHead>
                <CossTableHead className="text-center">Pedidos</CossTableHead>
                <CossTableHead className="text-center">Lead Time</CossTableHead>
                <CossTableHead className="text-center">Status</CossTableHead>
                <CossTableHead className="text-right">Ações</CossTableHead>
              </tr>
            </CossTableHeader>
            <CossTableBody>
              {filtered.map((s) => (
                <CossTableRow key={s.id}>
                  <CossTableCell>
                    <button
                      type="button"
                      onClick={() => navigate(`${base}/marketplace/suppliers/${s.id}`)}
                      className="flex items-center gap-3 group text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-600 border border-zinc-200/80 flex items-center justify-center shrink-0 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-900 text-sm truncate group-hover:text-zinc-700">
                          {s.tradeName || s.legalName}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{s.legalName}</p>
                      </div>
                    </button>
                  </CossTableCell>
                  <CossTableCell>
                    <span className="font-mono text-[11px] text-zinc-600">{s.cnpj ? formatCnpj(s.cnpj) : '—'}</span>
                  </CossTableCell>
                  <CossTableCell>
                    <div className="flex flex-col gap-0.5 text-[11px] text-zinc-600">
                      {s.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-zinc-400" /> {s.phone}
                        </span>
                      )}
                      {s.email && (
                        <span className="flex items-center gap-1 truncate max-w-[180px]">
                          <Mail className="w-3 h-3 text-zinc-400 shrink-0" /> {s.email}
                        </span>
                      )}
                    </div>
                  </CossTableCell>
                  <CossTableCell className="text-center">
                    <span className="font-mono font-bold text-zinc-800">{s._count?.products || 0}</span>
                  </CossTableCell>
                  <CossTableCell className="text-center">
                    <span className="font-mono font-bold text-zinc-800">{s._count?.orders || 0}</span>
                  </CossTableCell>
                  <CossTableCell className="text-center">
                    <CossBadge variant="neutral">{s.leadTimeDays}d</CossBadge>
                  </CossTableCell>
                  <CossTableCell className="text-center">
                    {s.isActive ? (
                      <CossBadge variant="success">Ativo</CossBadge>
                    ) : (
                      <CossBadge variant="outline">Inativo</CossBadge>
                    )}
                  </CossTableCell>
                  <CossTableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-xl p-1 bg-white shadow-elevated border-zinc-200">
                        <DropdownMenuItem
                          onClick={() => navigate(`${base}/marketplace/suppliers/${s.id}`)}
                          className="text-xs gap-2 rounded-lg cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggle.mutate(s.id)}
                          className="text-xs gap-2 rounded-lg cursor-pointer"
                        >
                          <Power className="w-3.5 h-3.5" />
                          {s.isActive ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setSupplierToRemove(s)}
                          className="text-xs gap-2 rounded-lg cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CossTableCell>
                </CossTableRow>
              ))}
            </CossTableBody>
          </CossTable>
        </CossPanel>
      )}

      <SupplierFormDialog
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={() => {
          setIsModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
        }}
      />

      <ConfirmDialog
        open={!!supplierToRemove}
        onOpenChange={(v) => !v && setSupplierToRemove(null)}
        title="Remover fornecedor?"
        description={
          supplierToRemove
            ? `"${supplierToRemove.tradeName || supplierToRemove.legalName}" será removido. Produtos e pedidos vinculados podem ser afetados.`
            : undefined
        }
        confirmLabel="Remover fornecedor"
        tone="destructive"
        onConfirm={async () => {
          if (supplierToRemove) await remove.mutateAsync(supplierToRemove.id);
        }}
      />
    </div>
  );
};

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const SupplierFormDialog: React.FC<SupplierFormDialogProps> = ({ open, onOpenChange, onSuccess }) => {
  const { slug } = useTenant();
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState(3);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!legalName.trim()) {
      toast.error('Razão social é obrigatória');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiPost(`/tenant-app/${slug}/suppliers`, {
        legalName: legalName.trim(),
        tradeName: tradeName.trim() || undefined,
        cnpj: cnpj.replace(/\D/g, '') || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        leadTimeDays,
        notes: notes.trim() || undefined,
      });
      toast.success('Fornecedor cadastrado');
      setLegalName('');
      setTradeName('');
      setCnpj('');
      setEmail('');
      setPhone('');
      setLeadTimeDays(3);
      setNotes('');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Falha ao cadastrar fornecedor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white rounded-3xl p-6 border-zinc-200">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-zinc-600" />
            Cadastrar fornecedor
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-2">
          <div className="space-y-1.5">
            <CossLabel required>Razão Social</CossLabel>
            <CossInput value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Distribuidora XPTO LTDA" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <CossLabel>Nome Fantasia</CossLabel>
              <CossInput value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="XPTO Atacado" />
            </div>
            <div className="space-y-1.5">
              <CossLabel>CNPJ</CossLabel>
              <CossInput value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0001-00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <CossLabel>E-mail</CossLabel>
              <CossInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@fornecedor.com" />
            </div>
            <div className="space-y-1.5">
              <CossLabel>Telefone / WhatsApp</CossLabel>
              <CossInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-8888" />
            </div>
          </div>
          <div className="space-y-1.5">
            <CossLabel>Lead Time (dias)</CossLabel>
            <CossInput
              type="number"
              min={1}
              max={90}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1.5">
            <CossLabel>Observações</CossLabel>
            <CossInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Atacado de bebidas, atende toda SP..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs rounded-xl">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={isSubmitting}
            className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
          >
            {isSubmitting ? 'Salvando...' : 'Cadastrar fornecedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
