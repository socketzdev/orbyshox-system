import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  User,
  Users,
  Calendar,
  Filter,
  Sparkles,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  ListTodo,
  ShieldCheck,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { apiGet, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { TaskCreateDrawer } from './task-create-drawer';
import { readTriggerTypes, describeTrigger } from './task-triggers';
import { taskVerticalProfile } from './task-vertical';

export interface TaskItem {
  id: string;
  tenantId?: string | null;
  companyId?: string | null;
  title: string;
  description?: string | null;
  assignedRole?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  frequency: string;
  repeatDays?: string | null;
  triggerType: string;
  triggerTypes?: string | null;
  dueTime?: string | null;
  dueDate: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requireConfirmation: boolean;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  completedAt?: string | null;
  completedById?: string | null;
  completedByName?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string; role?: string; position?: string } | null;
  createdBy?: { id: string; name: string } | null;
  completedBy?: { id: string; name: string } | null;
  isOverdue?: boolean;
  computedStatus?: string;
}

export interface TaskMetrics {
  totalToday: number;
  completedToday: number;
  pendingToday: number;
  overdueToday: number;
  completionRate: number;
}

const getTaskIcon = (title: string, role?: string | null) => {
  const t = title.toLowerCase();
  const r = (role || '').toLowerCase();

  if (t.includes('banheiro') || t.includes('lavar') || t.includes('higien') || t.includes('limp')) return '🧼';
  if (t.includes('mesa') || t.includes('salão') || t.includes('cadeira')) return '🪑';
  if (t.includes('split') || t.includes('ar-condicionado') || t.includes('climatiz') || t.includes('bancada') || t.includes('geladeira') || t.includes('freezer') || r.includes('cozinha')) return '❄️';
  if (t.includes('instalação') || t.includes('instalar') || t.includes('manutenção') || t.includes('visita técnica') || t.includes('técnic')) return '🔧';
  if (t.includes('fibra') || t.includes('roteador') || t.includes('wifi') || t.includes('wi-fi') || t.includes('internet')) return '📡';
  if (t.includes('arte') || t.includes('banner') || t.includes('impress') || t.includes('flyer') || t.includes('logo') || r.includes('design')) return '🎨';
  if (t.includes('cabelo') || t.includes('corte') || t.includes('barba') || t.includes('esmalte') || t.includes('manicure')) return '💈';
  if (t.includes('vitrine') || t.includes('arara') || t.includes('reposição') || t.includes('provador')) return '👕';
  if (t.includes('bebida') || t.includes('repor') || t.includes('estoque') || t.includes('bar')) return '🥤';
  if (t.includes('caixa') || t.includes('fechar') || t.includes('dinheiro') || t.includes('gaveta')) return '💰';
  if (t.includes('varrer') || t.includes('pano') || t.includes('chão') || r.includes('limpeza')) return '🧹';
  if (t.includes('lixo') || t.includes('descarte')) return '🗑️';
  return '📋';
};

const formatTrigger = (task: {
  triggerType: string;
  triggerTypes?: string | null;
  dueTime?: string | null;
}) => {
  // readTriggerTypes/describeTrigger tratam os dois formatos: a tarefa nova
  // (triggerTypes com vários momentos) e a antiga (triggerType único).
  return describeTrigger(readTriggerTypes(task), task.dueTime);
};
export const TasksPage: React.FC = () => {
  const { currentUser, isWaiter, isKitchen, isAdmin, tenant } = useTenant();
  const queryClient = useQueryClient();

  // Perfil vertical: cada segmento vê a SUA cara (títulos e modelos prontos).
  const taskProfile = taskVerticalProfile(
    (tenant as any)?.niche,
    (tenant as any)?.company?.category || (tenant as any)?.category,
  );

  // Mode: Employee View (Minhas Tarefas) vs Manager View (Visão Administrativa)
  const [viewMode, setViewMode] = useState<'employee' | 'manager'>(
    isWaiter || isKitchen ? 'employee' : 'manager'
  );

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [showCompletedCollapsible, setShowCompletedCollapsible] = useState(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Confirmation Modal for completing with notes
  const [taskToConfirm, setTaskToConfirm] = useState<TaskItem | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  // 1. Fetch tasks
  const { data, isLoading, refetch } = useQuery<{ metrics: TaskMetrics; tasks: TaskItem[] }>({
    queryKey: ['tasks', statusFilter, roleFilter, viewMode],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (roleFilter !== 'ALL') params.append('role', roleFilter);
      if (viewMode === 'employee') {
        params.append('mode', 'employee');
      }

      const res = await apiGet(`/tasks?${params.toString()}`);
      return res.data;
    },
    refetchInterval: 6000,
  });

  // 2. Fetch roles and staff
  const { data: rolesData } = useQuery<{ standardRoles: string[]; staffMembers: any[] }>({
    queryKey: ['tasks-roles'],
    queryFn: async () => {
      const res = await apiGet('/tasks/roles');
      return res.data;
    },
  });

  // 3. Complete Task Mutation
  const completeMutation = useMutation({
    mutationFn: async ({ taskId, notes }: { taskId: string; notes?: string }) => {
      return apiPatch(`/tasks/${taskId}/complete`, { notes });
    },
    onSuccess: () => {
      toast.success('Tarefa marcada como concluída! ✓');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTaskToConfirm(null);
      setCompletionNotes('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao concluir tarefa');
    },
  });

  // 4. Reopen Task Mutation
  const reopenMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiPatch(`/tasks/${taskId}/reopen`, {});
    },
    onSuccess: () => {
      toast.success('Tarefa reaberta como pendente');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao reabrir tarefa');
    },
  });

  // 5. Delete Task Mutation
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiDelete(`/tasks/${taskId}`);
    },
    onSuccess: () => {
      toast.success('Tarefa removida');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir tarefa');
    },
  });

  const handleCompleteClick = (task: TaskItem) => {
    if (task.requireConfirmation) {
      setTaskToConfirm(task);
      setCompletionNotes('');
    } else {
      completeMutation.mutate({ taskId: task.id });
    }
  };

  const handleConfirmCompletion = () => {
    if (!taskToConfirm) return;
    completeMutation.mutate({ taskId: taskToConfirm.id, notes: completionNotes.trim() || undefined });
  };

  const metrics = data?.metrics || {
    totalToday: 0,
    completedToday: 0,
    pendingToday: 0,
    overdueToday: 0,
    completionRate: 0,
  };

  const allTasks = data?.tasks || [];

  // Split tasks for employee view (Pending vs Completed)
  const pendingTasks = useMemo(() => allTasks.filter((t) => t.status === 'PENDING'), [allTasks]);
  const completedTasks = useMemo(() => allTasks.filter((t) => t.status === 'COMPLETED'), [allTasks]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-zinc-950 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ─── Top Bar: Title & View Switcher ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🧹</span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {viewMode === 'employee' ? 'Minhas Tarefas' : taskProfile.title}
            </h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {viewMode === 'employee'
              ? `${pendingTasks.length} pendentes • ${completedTasks.length} concluídas hoje`
              : taskProfile.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Switcher: Funcionário vs Dono */}
          <div className="bg-zinc-200/70 dark:bg-zinc-800/80 p-1 rounded-2xl flex items-center shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('employee')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'employee'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <User className="w-3.5 h-3.5 text-orange-600" />
              <span>Minhas Tarefas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('manager')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'manager'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Painel do Dono</span>
            </button>
          </div>

          {/* + Nova Tarefa Button */}
          <Button
            onClick={() => setDrawerOpen(true)}
            className="rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs h-9 px-4 shadow-md shadow-orange-500/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{taskProfile.createLabel}</span>
          </Button>
        </div>
      </div>

      {/* ─── TELA DO FUNCIONÁRIO ("MINHAS TAREFAS") ─── */}
      {viewMode === 'employee' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Progress Bar Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  Progresso do Dia
                </span>
                <span className="text-xs text-zinc-500 font-medium">
                  ({metrics.completedToday} de {metrics.totalToday} concluídas)
                </span>
              </div>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                {metrics.completionRate}%
              </span>
            </div>

            {/* Smooth Progress Track */}
            <div className="w-full h-3.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-200/50 dark:border-zinc-700/50">
              <div
                className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${metrics.completionRate}%` }}
              />
            </div>
          </div>

          {/* Lista de Tarefas Pendentes */}
          <div className="space-y-3.5">
            <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2 px-1">
              <ListTodo className="w-4 h-4 text-orange-600" />
              Tarefas Pendentes ({pendingTasks.length})
            </h2>

            {pendingTasks.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-10 border border-zinc-200/70 dark:border-zinc-800 text-center space-y-3 shadow-2xs">
                <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-2xl">
                  ✨
                </div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Tudo em dia por aqui!
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Você não possui nenhuma tarefa pendente no momento. Excelente trabalho!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingTasks.map((task) => {
                  const icon = getTaskIcon(task.title, task.assignedRole);
                  const isOverdue = task.isOverdue;

                  return (
                    <div
                      key={task.id}
                      className={`relative bg-white dark:bg-zinc-900 rounded-3xl p-5 border transition-all duration-200 flex flex-col justify-between shadow-2xs hover:shadow-md ${
                        isOverdue
                          ? 'border-amber-400 dark:border-amber-600/60 ring-2 ring-amber-400/20'
                          : 'border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      {/* Top Row: Icon, Title, Badges */}
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-start gap-3">
                            <span className="text-3xl shrink-0 p-1 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/50">
                              {icon}
                            </span>
                            <div>
                              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                                {task.title}
                              </h3>
                              {task.description && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Schedule & Metadata Chips */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                          {/* Time / Trigger Badge */}
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                              isOverdue
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {isOverdue && '⏰ '}
                            Hoje · {formatTrigger(task)}
                          </span>

                          {/* Role Badge */}
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border border-orange-200/60">
                            <User className="w-3 h-3" />
                            {task.assignedRole || 'Geral'}
                          </span>

                          {/* Priority */}
                          {task.priority === 'URGENT' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Urgente
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Row: Tactile One-Tap Complete Button */}
                      <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                        <Button
                          onClick={() => handleCompleteClick(task)}
                          disabled={completeMutation.isPending}
                          className="w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-wide shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Marcar como concluída ✓</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seção de Tarefas Concluídas (Colapsável) */}
          {completedTasks.length > 0 && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setShowCompletedCollapsible(!showCompletedCollapsible)}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tarefas Concluídas Hoje ({completedTasks.length})</span>
                </div>
                {showCompletedCollapsible ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>

              {showCompletedCollapsible && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-emerald-50/40 dark:bg-emerald-950/10 rounded-2xl p-4 border border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 line-through opacity-80 truncate">
                            {task.title}
                          </h4>
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium block">
                            Concluído {task.completedAt ? new Date(task.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            {task.completedByName ? ` por ${task.completedByName}` : ''}
                          </span>
                          {task.notes && (
                            <span className="text-[10px] text-zinc-500 italic block mt-0.5">
                              "{task.notes}"
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reopenMutation.mutate(task.id)}
                        disabled={reopenMutation.isPending}
                        className="h-8 px-2.5 rounded-xl text-zinc-500 hover:text-zinc-800 text-[11px] font-semibold shrink-0"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reabrir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── TELA DO DONO / GERENTE ("PAINEL ADMINISTRATIVO") ─── */}
      {viewMode === 'manager' && (
        <div className="space-y-6">
          {/* Executive Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Total Hoje */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-1">
                <span>Total de Hoje</span>
                <Calendar className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {metrics.totalToday}
              </div>
              <div className="text-[11px] text-zinc-400 font-medium mt-1">
                {taskProfile.todaySection}
              </div>
            </div>

            {/* 2. Concluídas */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-1">
                <span>Concluídas</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {metrics.completedToday}
                </span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md">
                  {metrics.completionRate}%
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-medium mt-1">
                Taxa de cumprimento da equipe
              </div>
            </div>

            {/* 3. Pendentes */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-1">
                <span>Pendentes</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {metrics.pendingToday}
              </div>
              <div className="text-[11px] text-zinc-400 font-medium mt-1">
                Aguardando execução no turno
              </div>
            </div>

            {/* 4. Atrasadas */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-1">
                <span>Atrasadas</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {metrics.overdueToday}
              </div>
              <div className="text-[11px] text-zinc-400 font-medium mt-1">
                Passaram do horário limite
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {[
                { key: 'ALL', label: 'Todas' },
                { key: 'PENDING', label: 'Pendentes' },
                { key: 'COMPLETED', label: 'Concluídas' },
                { key: 'OVERDUE', label: 'Atrasadas' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === tab.key
                      ? 'bg-orange-600 text-white shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="ALL">Todos os Cargos</option>
                {rolesData?.standardRoles?.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Executive Tasks Table / List */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden shadow-2xs">
            {allTasks.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <span className="text-3xl">📋</span>
                <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                  Nenhuma tarefa encontrada
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Clique no botão "+ Nova Tarefa" acima para definir as rotinas do seu restaurante.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {allTasks.map((task) => {
                  const icon = getTaskIcon(task.title, task.assignedRole);
                  const isCompleted = task.status === 'COMPLETED';
                  const isOverdue = task.isOverdue;

                  return (
                    <div
                      key={task.id}
                      className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        isCompleted
                          ? 'bg-zinc-50/40 dark:bg-zinc-900/30'
                          : isOverdue
                          ? 'bg-amber-50/20 dark:bg-amber-950/10'
                          : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-850'
                      }`}
                    >
                      {/* Left: Icon & Details */}
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <span className="text-2xl p-2 bg-zinc-100 dark:bg-zinc-800 rounded-2xl shrink-0">
                          {icon}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4
                              className={`text-sm font-bold text-zinc-900 dark:text-zinc-100 ${
                                isCompleted ? 'line-through opacity-70' : ''
                              }`}
                            >
                              {task.title}
                            </h4>

                            {/* Priority */}
                            {task.priority === 'URGENT' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                Urgente
                              </span>
                            )}

                            {/* Status Badge */}
                            {isCompleted ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                ✓ Concluída
                              </span>
                            ) : isOverdue ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                                ⏰ Atrasada
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                Pendente
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xl">
                              {task.description}
                            </p>
                          )}

                          {/* Secondary info: Role, Time, Assignee, Completion */}
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 mt-1.5">
                            <span className="flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-300">
                              <User className="w-3 h-3 text-orange-500" />
                              {task.assignedRole}
                              {task.assignedTo?.name ? ` (${task.assignedTo.name})` : ''}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-zinc-400" />
                              Hoje · {formatTrigger(task)}
                            </span>
                            {isCompleted && task.completedByName && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                  Concluído às {task.completedAt ? new Date(task.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''} por {task.completedByName}
                                </span>
                              </>
                            )}
                            {task.notes && (
                              <>
                                <span>•</span>
                                <span className="text-zinc-600 dark:text-zinc-400 italic">
                                  Obs: "{task.notes}"
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {isCompleted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reopenMutation.mutate(task.id)}
                            disabled={reopenMutation.isPending}
                            className="h-8 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 border-zinc-200"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            Reabrir
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleCompleteClick(task)}
                            disabled={completeMutation.isPending}
                            className="h-8 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Concluir
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm('Excluir esta tarefa permanentemente?')) {
                              deleteMutation.mutate(task.id);
                            }
                          }}
                          className="h-8 w-8 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Drawer Lateral de Criação de Tarefa ─── */}
      <TaskCreateDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreated={() => refetch()}
        standardRoles={rolesData?.standardRoles || taskProfile.roles}
        staffMembers={rolesData?.staffMembers || []}
        presets={taskProfile.presets}
      />

      {/* ─── Modal de Confirmação com Observação ─── */}
      <Dialog open={!!taskToConfirm} onOpenChange={(open) => !open && setTaskToConfirm(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Concluir: {taskToConfirm?.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Esta tarefa solicita uma breve observação antes de finalizar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Observações ou relatório rápido:
            </label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Ex: Tudo higienizado e reposto com sucesso."
              className="min-h-[85px] rounded-xl text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setTaskToConfirm(null)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmCompletion}
              disabled={completeMutation.isPending}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              Confirmar Conclusão ✓
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
