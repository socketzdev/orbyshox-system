import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { CossBadge } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  MoreVertical,
  ExternalLink,
  RefreshCw,
  XCircle,
  CheckCircle2,
  CalendarClock,
  Building2,
  ArrowLeft,
  Receipt,
  LifeBuoy,
  MessageSquare,
  Users,
  Package,
  ShoppingCart,
  Calendar,
  Layers,
  ChevronRight,
  Send,
  Loader2,
} from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusLabels: Record<string, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Ativo',
  PAST_DUE: 'Em atraso',
  SUSPENDED: 'Suspenso',
  CANCELED: 'Cancelado',
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return <CossBadge variant="success">Ativo</CossBadge>;
    case 'TRIAL':
      return <CossBadge variant="info">Trial</CossBadge>;
    case 'PAST_DUE':
      return <CossBadge variant="warning">Em atraso</CossBadge>;
    case 'SUSPENDED':
      return <CossBadge variant="danger">Suspenso</CossBadge>;
    case 'CANCELED':
      return <CossBadge variant="danger">Cancelado</CossBadge>;
    default:
      return <CossBadge variant="neutral">{status}</CossBadge>;
  }
};

const getInvoiceBadge = (status: string) => {
  switch (status) {
    case 'PAID':
      return <CossBadge variant="success">Paga</CossBadge>;
    case 'PENDING':
      return <CossBadge variant="warning">Pendente</CossBadge>;
    case 'OVERDUE':
      return <CossBadge variant="danger">Vencida</CossBadge>;
    case 'CANCELED':
      return <CossBadge variant="neutral">Cancelada</CossBadge>;
    default:
      return <CossBadge variant="neutral">{status}</CossBadge>;
  }
};

export const TenantDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [suspendReason, setSuspendReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [extendDays, setExtendDays] = useState('7');

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiGet('/plans'),
  });

  const plansList = Array.isArray(plans) ? plans : plans?.data || [];

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => apiGet(`/tenants/${id}`),
    enabled: !!id,
  });

  const { data: invoices } = useQuery({
    queryKey: ['tenant', id, 'invoices'],
    queryFn: () => apiGet(`/billing/invoices?tenantId=${id}&limit=20`),
    enabled: !!id,
  });

  const { data: notes } = useQuery({
    queryKey: ['tenant', id, 'notes'],
    queryFn: () => apiGet(`/tenants/${id}/notes`),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenant', id] });
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
  };

  const suspendMutation = useMutation({
    mutationFn: (reason: string) => apiPost(`/tenants/${id}/suspend`, { reason }),
    onSuccess: () => {
      toast.success('Cliente suspenso com sucesso');
      setSuspendOpen(false);
      setSuspendReason('');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Falha ao suspender'),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiPost(`/tenants/${id}/reactivate`, {}),
    onSuccess: () => {
      toast.success('Cliente reativado com sucesso');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Falha ao reativar'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiPost(`/tenants/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Contrato do cliente cancelado');
      setCancelOpen(false);
      setCancelReason('');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Falha ao cancelar'),
  });

  const extendMutation = useMutation({
    mutationFn: (days: number) => apiPost(`/tenants/${id}/extend-trial`, { days }),
    onSuccess: () => {
      toast.success('Período de trial estendido com sucesso');
      setExtendOpen(false);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Falha ao estender trial'),
  });

  const changePlanMutation = useMutation({
    mutationFn: (planId: string) => apiPost(`/tenants/${id}/change-plan`, { planId }),
    onSuccess: () => {
      toast.success('Plano alterado com sucesso');
      setChangePlanOpen(false);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Falha ao alterar plano'),
  });

  const subscription = useMemo(() => tenant?.subscriptions?.[0], [tenant]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-xs text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mb-2" />
        Carregando cliente...
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-12 text-center text-xs text-rose-600 shadow-2xs">
        Cliente não encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <button
            onClick={() => navigate('/tenants')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para lista de clientes
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              {tenant.tradeName || tenant.companyName}
            </h1>
            {getStatusBadge(tenant.status)}
            <CossBadge variant="neutral">{tenant.niche}</CossBadge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>Cadastrado em {formatDate(tenant.createdAt)}</span>
            {subscription?.plan && (
              <>
                <span>•</span>
                <span>
                  Plano: <strong className="text-zinc-900">{subscription.plan.name}</strong> ·{' '}
                  <span className="font-mono">{formatCurrency(subscription.plan.price)}</span>/
                  {subscription.plan.billingPeriod === 'MONTHLY' ? 'mês' : 'ano'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs"
            onClick={() => window.open('/app/dashboard', '_blank')}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-zinc-500" /> Abrir painel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs"
            onClick={() => navigate(`/tenants/${id}/site`)}
          >
            <Building2 className="mr-1.5 h-3.5 w-3.5 text-zinc-500" /> Site público
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 shadow-2xs">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-xl text-xs">
              {tenant.status === 'SUSPENDED' || tenant.status === 'CANCELED' ? (
                <DropdownMenuItem
                  onClick={() => reactivateMutation.mutate()}
                  className="rounded-xl px-3 py-2 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reativar cliente
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => setSuspendOpen(true)}
                  className="rounded-xl px-3 py-2 text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                >
                  <XCircle className="mr-2 h-3.5 w-3.5 text-amber-500" /> Suspender cliente
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setExtendOpen(true)}
                className="rounded-xl px-3 py-2 text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                <CalendarClock className="mr-2 h-3.5 w-3.5 text-blue-500" /> Estender Período de Trial
              </DropdownMenuItem>
              {tenant.status !== 'CANCELED' && (
                <DropdownMenuItem
                  onClick={() => setCancelOpen(true)}
                  className="rounded-xl px-3 py-2 text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <XCircle className="mr-2 h-3.5 w-3.5" /> Cancelar contrato
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dados" className="space-y-5">
        <TabsList className="bg-zinc-100/80 p-1 rounded-2xl border border-zinc-200/60">
          <TabsTrigger value="dados" className="rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-2xs">
            Dados Cadastrais
          </TabsTrigger>
          <TabsTrigger value="plano" className="rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-2xs">
            Plano & Assinatura
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-2xs">
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="uso" className="rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-2xs">
            Métricas de Uso
          </TabsTrigger>
          <TabsTrigger value="suporte" className="rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-2xs">
            Suporte
          </TabsTrigger>
          <TabsTrigger value="notas" className="rounded-xl text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-2xs">
            Notas Internas
          </TabsTrigger>
        </TabsList>

        {/* Tab Dados */}
        <TabsContent value="dados" className="space-y-4">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Identificação da Empresa
              </h3>
              <dl className="divide-y divide-zinc-100 text-xs">
                <Row label="Razão Social" value={tenant.companyName} />
                <Row label="Nome Fantasia" value={tenant.tradeName || '—'} />
                <Row label="CNPJ" value={tenant.cnpj || '—'} mono />
                <Row label="Subdomínio / Slug" value={tenant.slug || '—'} mono />
                <Row label="Nicho de Atuação" value={tenant.niche} />
                <Row label="Status Atual" value={statusLabels[tenant.status] || tenant.status} />
              </dl>
            </div>
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Informações de Contato & Cobrança
              </h3>
              <dl className="divide-y divide-zinc-100 text-xs">
                <Row label="E-mail Principal" value={tenant.email} />
                <Row label="Telefone / WhatsApp" value={tenant.phone || '—'} />
                <Row label="Endereço Comercial" value={tenant.address || '—'} />
                <Row label="Expiração do Trial" value={formatDate(tenant.trialEndsAt)} />
                <Row label="ID Stripe Customer" value={tenant.stripeCustomerId || '—'} mono />
              </dl>
            </div>
          </div>
        </TabsContent>

        {/* Tab Plano */}
        <TabsContent value="plano" className="space-y-4">
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Assinatura Ativa</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Detalhes do plano contratado pelo cliente.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs"
                onClick={() => setChangePlanOpen(true)}
              >
                Trocar de Plano
              </Button>
            </div>

            {subscription ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase">Plano</p>
                  <p className="text-base font-bold text-zinc-900 mt-1">{subscription.plan?.name || '—'}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase">Valor Recorrente</p>
                  <p className="text-base font-bold font-mono text-zinc-900 mt-1">
                    {formatCurrency(subscription.plan?.price || 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase">Status</p>
                  <p className="mt-1">{getStatusBadge(subscription.status)}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase">Próximo Vencimento</p>
                  <p className="text-base font-bold text-zinc-900 mt-1">
                    {subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Nenhuma assinatura ativa no momento.</p>
            )}
          </div>
        </TabsContent>

        {/* Tab Financeiro */}
        <TabsContent value="financeiro" className="space-y-4">
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Histórico de Faturas</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Cobranças emitidas para esta conta.</p>
              </div>
              <CossBadge variant="neutral">
                {(invoices?.data || []).length} faturas
              </CossBadge>
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-200/80">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200/80 text-[11px] uppercase font-semibold text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Vencimento</th>
                    <th className="px-4 py-3 text-left">Valor</th>
                    <th className="px-4 py-3 text-left">Método</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {(invoices?.data || []).slice(0, 10).map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-900">{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 font-mono font-bold text-zinc-900">
                        {formatCurrency(inv.amountCents)}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{inv.paymentMethod || 'Cartão'}</td>
                      <td className="px-4 py-3">{getInvoiceBadge(inv.status)}</td>
                    </tr>
                  ))}
                  {(!invoices?.data || invoices.data.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                        Nenhuma fatura encontrada para este cliente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab Uso */}
        <TabsContent value="uso" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="Usuários Ativos" value={tenant._count?.users || 0} icon={Users} />
            <Stat label="Produtos Cadastrados" value={tenant._count?.products || 0} icon={Package} />
            <Stat label="Pedidos Criados" value={tenant._count?.orders || 0} icon={ShoppingCart} />
            <Stat label="Clientes da Empresa" value={tenant._count?.customers || 0} icon={Users} />
            <Stat label="Agendamentos" value={tenant._count?.appointments || 0} icon={Calendar} />
            <Stat label="Chamados Abertos" value={tenant._count?.tickets || 0} icon={LifeBuoy} />
          </div>
        </TabsContent>

        {/* Tab Suporte */}
        <TabsContent value="suporte" className="space-y-4">
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Tickets de Suporte</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Histórico de solicitações enviadas pela equipe do cliente.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs"
                onClick={() => navigate('/tickets')}
              >
                Abrir Central
              </Button>
            </div>

            <div className="space-y-2">
              {(tenant.tickets || []).map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="group flex w-full items-center justify-between rounded-2xl border border-zinc-200/80 bg-zinc-50/40 px-4 py-3 text-left text-xs hover:border-zinc-300 hover:bg-white transition-all shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-zinc-200/80 text-zinc-600">
                      <LifeBuoy className="h-4 w-4" />
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-zinc-900 group-hover:text-zinc-950 truncate">{t.subject}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">Criado em {formatDate(t.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <CossBadge variant={t.status === 'OPEN' ? 'warning' : t.status === 'RESOLVED' ? 'success' : 'info'}>
                      {t.status}
                    </CossBadge>
                    <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              ))}
              {(!tenant.tickets || tenant.tickets.length === 0) && (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-400">
                  Nenhum ticket de suporte registrado para este cliente.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab Notas Internas */}
        <TabsContent value="notas" className="space-y-4">
          <NotesPanel tenantId={id!} initialNotes={notes || []} onCreated={invalidate} />
        </TabsContent>
      </Tabs>

      {/* Modal Suspender */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl text-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">Suspender cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-zinc-500">
              Esta ação bloqueia temporariamente o acesso de todos os operadores da empresa. Você poderá restabelecer o acesso a qualquer momento.
            </p>
            <Textarea
              placeholder="Descreva o motivo da suspensão (mínimo 5 caracteres)..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="rounded-xl border-zinc-200 text-xs min-h-[90px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSuspendOpen(false)} className="rounded-xl border-zinc-200 text-xs">
              Cancelar
            </Button>
            <Button
              disabled={suspendReason.trim().length < 5 || suspendMutation.isPending}
              onClick={() => suspendMutation.mutate(suspendReason)}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-xs text-white shadow-2xs"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Confirmar suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cancelar */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl text-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600">Cancelar contrato do cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-zinc-500">
              A assinatura será encerrada e o status mudará para CANCELADO. Faturas futuras não serão geradas.
            </p>
            <Textarea
              placeholder="Motivo formal do cancelamento..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="rounded-xl border-zinc-200 text-xs min-h-[90px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelOpen(false)} className="rounded-xl border-zinc-200 text-xs">
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelReason.trim().length < 5 || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              className="rounded-xl text-xs shadow-2xs"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Confirmar cancelamento definitivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Trocar Plano */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-lg bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl text-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">Alterar plano do cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-zinc-500">
              Selecione o novo plano contratado para <strong>{tenant?.tradeName || tenant?.companyName}</strong>.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {plansList.length === 0 ? (
                <p className="text-zinc-400 text-center py-6">Nenhum plano disponível cadastrado.</p>
              ) : (
                plansList.map((plan: any) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                      selectedPlanId === plan.id
                        ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
                        : 'border-zinc-200/80 bg-zinc-50/50 hover:border-zinc-300 text-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-bold text-xs ${selectedPlanId === plan.id ? 'text-white' : 'text-zinc-900'}`}>
                          {plan.name}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${selectedPlanId === plan.id ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {plan.description}
                        </p>
                      </div>
                      <span className={`text-xs font-mono font-bold ${selectedPlanId === plan.id ? 'text-white' : 'text-zinc-900'}`}>
                        R$ {((plan.price || 0) / 100).toFixed(2)}/{plan.billingPeriod === 'MONTHLY' ? 'mês' : 'ano'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setChangePlanOpen(false)} className="rounded-xl border-zinc-200 text-xs">
              Cancelar
            </Button>
            <Button
              disabled={!selectedPlanId || changePlanMutation.isPending}
              onClick={() => changePlanMutation.mutate(selectedPlanId)}
              className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs shadow-2xs"
            >
              {changePlanMutation.isPending ? 'Alterando...' : 'Confirmar alteração'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Estender Trial */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent className="max-w-sm bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl text-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900">Estender período de trial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-zinc-500">Informe quantos dias adicionais conceder ao cliente (1 a 90 dias).</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={90}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="h-10 text-xs font-bold text-center rounded-xl bg-zinc-50 border-zinc-200 w-24"
              />
              <span className="text-xs text-zinc-600 font-medium">dias adicionais</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setExtendOpen(false)} className="rounded-xl border-zinc-200 text-xs">
              Voltar
            </Button>
            <Button
              disabled={Number(extendDays) < 1 || Number(extendDays) > 90 || extendMutation.isPending}
              onClick={() => extendMutation.mutate(Number(extendDays))}
              className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs shadow-2xs"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Row({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-zinc-500 font-medium">{label}</dt>
      <dd className={`text-right font-bold text-zinc-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-2xs">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200/60 text-zinc-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-zinc-900 font-mono">{value}</p>
    </div>
  );
}

const NotesPanel: React.FC<{ tenantId: string; initialNotes: any[]; onCreated: () => void }> = ({
  tenantId,
  initialNotes,
  onCreated,
}) => {
  const [content, setContent] = useState('');
  const createMutation = useMutation({
    mutationFn: () => apiPost(`/tenants/${tenantId}/notes`, { content }),
    onSuccess: () => {
      setContent('');
      onCreated();
      toast.success('Nota interna registrada com sucesso');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Falha ao registrar nota'),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-2xs space-y-3">
        <Textarea
          placeholder="Escreva uma observação interna sigilosa sobre o cliente..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="rounded-2xl border-zinc-200 text-xs min-h-[80px]"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!content.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="h-8 rounded-xl bg-zinc-900 text-xs font-semibold text-white hover:bg-zinc-800 shadow-2xs"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Registrar nota
          </Button>
        </div>
      </div>
      <div className="space-y-2.5">
        {initialNotes.map((note) => (
          <div key={note.id} className="rounded-2xl border border-zinc-200/80 bg-white p-4 text-xs shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-900">{note.author?.name || 'Operador'}</span>
              <span className="text-[10px] text-zinc-400 font-mono">{formatDate(note.createdAt)}</span>
            </div>
            <p className="mt-1.5 text-zinc-700 leading-relaxed">{note.content}</p>
          </div>
        ))}
        {initialNotes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-400">
            Nenhuma observação interna registrada para este cliente.
          </div>
        )}
      </div>
    </div>
  );
};
