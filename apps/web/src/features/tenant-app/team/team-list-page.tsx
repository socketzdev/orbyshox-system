import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  UserPlus,
  Mail,
  Phone,
  ShieldCheck,
  User as UserIcon,
  Search,
  Power,
  Trash2,
  Pencil,
  KeyRound,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

type Employee = {
  id: string;
  name: string;
  email: string;
  role: 'TENANT_ADMIN' | 'TENANT_EMPLOYEE';
  phone: string | null;
  position: string | null;
  isActive: boolean;
  is2faEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

export const TeamListPage: React.FC = () => {
  const { slug, base, currentUser } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);

  const { data, isLoading } = useQuery<{ employees: Employee[] }>({
    queryKey: ['tenant-employees', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/employees`),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive
        ? apiPatch(`/tenant-app/${slug}/employees/${id}/activate`)
        : apiPatch(`/tenant-app/${slug}/employees/${id}/deactivate`),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-employees', slug] });
      toast.success(vars.isActive ? 'Funcionário reativado' : 'Funcionário desativado');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Não foi possível alterar o status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/tenant-app/${slug}/employees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-employees', slug] });
      toast.success('Funcionário removido com sucesso');
      setConfirmDelete(null);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Erro ao remover funcionário'),
  });

  const employees = data?.employees || [];
  const totals = useMemo(() => {
    const active = employees.filter((e) => e.isActive).length;
    const admins = employees.filter((e) => e.role === 'TENANT_ADMIN' && e.isActive).length;
    return { total: employees.length, active, admins };
  }, [employees]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (statusFilter === 'ACTIVE' && !e.isActive) return false;
      if (statusFilter === 'INACTIVE' && e.isActive) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        e.name?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        (e.position || '').toLowerCase().includes(q) ||
        (e.phone || '').includes(q)
      );
    });
  }, [employees, search, statusFilter]);

  const currentUserId = currentUser?.id;
  const isCurrentUserAdmin = currentUser?.role === 'TENANT_ADMIN';

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-zinc-700" />
              Equipe & Funcionários
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-zinc-50">
              {totals.total} cadastrados
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">
            Gerencie quem acessa este painel. Crie usuários para atendentes, garçons, barbeiros ou auxiliares.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <Badge variant="emerald" className="text-[10px] font-bold uppercase tracking-wider">
              {totals.active} ativos
            </Badge>
            <Badge variant="amber" className="text-[10px] font-bold uppercase tracking-wider">
              {totals.admins} admins
            </Badge>
            <Badge variant="sky" className="text-[10px] font-bold uppercase tracking-wider">
              {totals.total - totals.active} inativos
            </Badge>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => navigate(`${base}/team/new`)}
          className="h-10 px-4 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-amber-400" />
          <span>Novo Funcionário</span>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, cargo ou telefone..."
            className="pl-9 h-10 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-zinc-50 rounded-xl p-1 border border-zinc-200/70">
          {(
            [
              { key: 'ALL', label: 'Todos' },
              { key: 'ACTIVE', label: 'Ativos' },
              { key: 'INACTIVE', label: 'Inativos' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              className={`px-3 h-8 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === opt.key
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <ErpEmptyState
            icon={Users}
            title={employees.length === 0 ? 'Nenhum funcionário cadastrado' : 'Nenhum resultado encontrado'}
            description={
              employees.length === 0
                ? 'Cadastre seu primeiro funcionário para liberar acessos ao painel.'
                : 'Tente ajustar os filtros ou a busca para localizar um funcionário.'
            }
            actionLabel={employees.length === 0 ? 'Cadastrar Funcionário' : undefined}
            onAction={() => navigate(`${base}/team/new`)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50/60 border-b border-zinc-200/80 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  <th className="text-left px-6 py-3">Funcionário</th>
                  <th className="text-left px-4 py-3">Cargo / Contato</th>
                  <th className="text-left px-4 py-3">Perfil</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Último acesso</th>
                  <th className="text-right px-6 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const isMe = emp.id === currentUserId;
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition-colors ${
                        !emp.isActive ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                              emp.role === 'TENANT_ADMIN'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            {initials(emp.name) || 'FU'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-900 truncate">
                                {emp.name}
                              </span>
                              {isMe && (
                                <Badge
                                  variant="emerald"
                                  className="text-[9px] font-bold uppercase px-1.5 py-0"
                                >
                                  Você
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-zinc-500 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" />
                              {emp.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="text-xs">
                          <span className="font-semibold text-zinc-800">
                            {emp.position || '—'}
                          </span>
                          {emp.phone && (
                            <span className="block text-zinc-500 mt-0.5 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {emp.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {emp.role === 'TENANT_ADMIN' ? (
                          <Badge
                            variant="amber"
                            className="text-[10px] font-bold uppercase tracking-wider"
                          >
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge
                            variant="zinc"
                            className="text-[10px] font-bold uppercase tracking-wider"
                          >
                            <UserIcon className="w-3 h-3 mr-1" />
                            Operador
                          </Badge>
                        )}
                        {emp.is2faEnabled && (
                          <Badge
                            variant="emerald"
                            className="text-[9px] font-bold ml-1.5 px-1.5 py-0"
                          >
                            2FA
                          </Badge>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={emp.isActive}
                            disabled={isMe && emp.role === 'TENANT_ADMIN' && emp.isActive}
                            onCheckedChange={(checked) =>
                              toggleActive.mutate({ id: emp.id, isActive: checked })
                            }
                          />
                          {emp.isActive ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-xs text-zinc-500">
                        {emp.lastLoginAt
                          ? format(new Date(emp.lastLoginAt), "dd 'de' MMM, HH:mm", { locale: ptBR })
                          : 'Nunca acessou'}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Editar"
                            onClick={() => navigate(`${base}/team/${emp.id}/edit`)}
                            className="h-8 w-8 p-0 hover:bg-zinc-100"
                          >
                            <Pencil className="w-3.5 h-3.5 text-zinc-600" />
                          </Button>
                          {!isMe && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Redefinir senha"
                              onClick={() =>
                                navigate(`${base}/team/${emp.id}/edit?reset=1`)
                              }
                              className="h-8 w-8 p-0 hover:bg-zinc-100"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-zinc-600" />
                            </Button>
                          )}
                          {!isMe && isCurrentUserAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Remover"
                              onClick={() => setConfirmDelete(emp)}
                              className="h-8 w-8 p-0 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Delete */}
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900">
              <Trash2 className="w-5 h-5 text-rose-600" />
              Remover funcionário
            </DialogTitle>
            <DialogDescription>
              Esta ação é permanente e removerá <strong>{confirmDelete?.name}</strong> do painel.
              O histórico de vendas e agendamentos feitos por este usuário será mantido.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(null)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
            >
              <Power className="w-3.5 h-3.5 mr-1.5" />
              {deleteMutation.isPending ? 'Removendo...' : 'Remover definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamListPage;
