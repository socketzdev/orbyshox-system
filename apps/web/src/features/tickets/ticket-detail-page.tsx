import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { format, differenceInMilliseconds } from 'date-fns';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { CossBadge, CossSwitch, CossLabel, CossSpinner } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { TicketCategory, TicketPriority, TicketStatus } from '@projeto-saas/shared-types';
import {
  ArrowLeft,
  Send,
  Lock,
  Clock,
  User,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyContent, setReplyContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => apiGet(`/tickets/${id}`),
    enabled: !!id,
  });

  const { data: staffData } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet('/staff'),
  });

  const replyMutation = useMutation({
    mutationFn: (data: any) => apiPost(`/tickets/${id}/messages`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', id] });
      setReplyContent('');
      setIsInternal(false);
      toast.success('Mensagem enviada com sucesso');
    },
    onError: () => toast.error('Falha ao enviar mensagem'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiPatch(`/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success('Ticket atualizado');
    },
    onError: () => toast.error('Falha ao atualizar ticket'),
  });

  if (isLoading || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <CossSpinner className="w-8 h-8 mb-3" />
        <p className="text-xs text-zinc-500">Carregando detalhes do chamado...</p>
      </div>
    );
  }

  const now = new Date();
  const slaDeadline = ticket.slaDeadline ? new Date(ticket.slaDeadline) : null;
  const timeLeftMs = slaDeadline ? differenceInMilliseconds(slaDeadline, now) : 0;
  const isOverdue = slaDeadline ? timeLeftMs < 0 : false;

  const staffList = Array.isArray(staffData?.data)
    ? staffData.data
    : Array.isArray(staffData)
    ? staffData
    : [];

  const getStatusBadge = (s: TicketStatus) => {
    const map: Record<
      TicketStatus,
      { label: string; variant: 'warning' | 'neutral' | 'success' | 'outline' }
    > = {
      OPEN: { label: 'Aberto', variant: 'warning' },
      IN_PROGRESS: { label: 'Em Andamento', variant: 'neutral' },
      WAITING_CUSTOMER: { label: 'Aguardando Cliente', variant: 'outline' },
      RESOLVED: { label: 'Resolvido', variant: 'success' },
      CLOSED: { label: 'Fechado', variant: 'outline' },
    };
    const c = map[s] || { label: s, variant: 'neutral' as const };
    return <CossBadge variant={c.variant}>{c.label}</CossBadge>;
  };

  const getPriorityBadge = (p: TicketPriority) => {
    const map: Record<
      TicketPriority,
      { label: string; variant: 'danger' | 'warning' | 'neutral' | 'outline' }
    > = {
      CRITICAL: { label: 'Crítica', variant: 'danger' },
      HIGH: { label: 'Alta', variant: 'warning' },
      MEDIUM: { label: 'Média', variant: 'neutral' },
      LOW: { label: 'Baixa', variant: 'outline' },
    };
    const c = map[p] || { label: p, variant: 'neutral' as const };
    return <CossBadge variant={c.variant}>{c.label}</CossBadge>;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-zinc-600">
                #{ticket.id?.substring(0, 8).toUpperCase()}
              </span>
              {getStatusBadge(ticket.status)}
              {getPriorityBadge(ticket.priority)}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">{ticket.subject}</h1>
          </div>
        </div>

        {ticket.tenant && (
          <Link
            to={`/tenants/${ticket.tenantId}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors"
          >
            <Building2 className="w-4 h-4 text-zinc-500" />
            <span>{ticket.tenant.companyName}</span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Messages Feed (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-3">
            {(ticket.messages || []).map((msg: any) => {
              const isNote = msg.isInternal;
              return (
                <div
                  key={msg.id}
                  className={`rounded-2xl border p-4 shadow-2xs transition-all ${
                    isNote
                      ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                      : 'bg-white border-zinc-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-100/80">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isNote
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {msg.author?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">
                          {msg.author?.name || 'Membro da Equipe'}
                        </span>
                        <span className="text-[10.5px] text-zinc-600 font-mono">
                          {msg.createdAt
                            ? format(new Date(msg.createdAt), 'dd/MM/yyyy HH:mm')
                            : ''}
                        </span>
                      </div>
                    </div>
                    {isNote && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 text-[10.5px] font-semibold">
                        <Lock className="w-3 h-3" /> Nota Interna
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-zinc-800 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
              Enviar Mensagem
            </h3>
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Digite uma resposta para o cliente ou adicione uma anotação privada..."
              rows={4}
              className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none transition-all resize-y"
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <CossSwitch
                  id="internal-switch"
                  checked={isInternal}
                  onCheckedChange={setIsInternal}
                />
                <label
                  htmlFor="internal-switch"
                  className="text-xs font-semibold text-zinc-700 cursor-pointer flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Nota interna (visível apenas para equipe)</span>
                </label>
              </div>
              <Button
                onClick={() => replyMutation.mutate({ content: replyContent, isInternal })}
                disabled={!replyContent.trim() || replyMutation.isPending}
                className="h-9 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold gap-1.5 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                {replyMutation.isPending ? 'Enviando...' : 'Responder'}
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar Controls (Right 1 col) */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 border-b border-zinc-100 pb-2">
              Status & SLA
            </h3>

            {/* SLA Alert */}
            <div
              className={`p-3.5 rounded-2xl border text-xs ${
                isOverdue
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{isOverdue ? 'SLA Expirado' : 'Dentro do Prazo de SLA'}</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {slaDeadline
                  ? isOverdue
                    ? `Prazo extrapolado em ${format(slaDeadline, 'dd/MM/yyyy HH:mm')}`
                    : `Expira em ${Math.floor(timeLeftMs / (1000 * 60 * 60))}h ${Math.floor(
                        (timeLeftMs / (1000 * 60)) % 60
                      )}m`
                  : 'Sem SLA estipulado'}
              </p>
            </div>

            {/* Status Change */}
            <div className="space-y-1.5">
              <CossLabel>Status do Chamado</CossLabel>
              <select
                value={ticket.status}
                onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                className="h-10 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-xs font-medium text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none"
              >
                <option value="OPEN">Aberto</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="WAITING_CUSTOMER">Aguardando Cliente</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Fechado</option>
              </select>
            </div>

            {/* Priority Change */}
            <div className="space-y-1.5">
              <CossLabel>Prioridade</CossLabel>
              <select
                value={ticket.priority}
                onChange={(e) => updateMutation.mutate({ priority: e.target.value })}
                className="h-10 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-xs font-medium text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none"
              >
                <option value="CRITICAL">Crítica (Urgente)</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Média</option>
                <option value="LOW">Baixa</option>
              </select>
            </div>

            {/* Assignee */}
            <div className="space-y-1.5">
              <CossLabel>Responsável Técnico</CossLabel>
              <select
                value={ticket.assignedToId || 'UNASSIGNED'}
                onChange={(e) =>
                  updateMutation.mutate({
                    assignedToId: e.target.value === 'UNASSIGNED' ? null : e.target.value,
                  })
                }
                className="h-10 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-xs font-medium text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none"
              >
                <option value="UNASSIGNED">Não atribuído</option>
                {staffList.map((staff: any) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-zinc-100 space-y-2 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>Categoria:</span>
                <span className="font-semibold text-zinc-800">{ticket.category}</span>
              </div>
              <div className="flex justify-between">
                <span>Abertura:</span>
                <span className="font-mono text-zinc-700">
                  {format(new Date(ticket.createdAt), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
