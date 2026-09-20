import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  TriggerType,
  normalizeTriggerTypes,
  pickPrimaryTrigger,
  serializeTriggerTypes,
  readTriggerTypes,
} from './task-triggers';

export interface CreateTaskDto {
  title: string;
  description?: string;
  assignedRole?: string; // 'Garçom' | 'Cozinha' | 'Caixa' | 'Estoque' | 'Limpeza' | 'Todos'
  assignedToId?: string;
  frequency?: 'TODAY' | 'DAILY' | 'WEEKLY' | 'CUSTOM_DAYS';
  repeatDays?: string[]; // e.g. ['SEG', 'TER', 'QUA', 'QUI', 'SEX']
  triggerType?: TriggerType;
  // Vários momentos de execução. Quando informado, tem prioridade sobre
  // `triggerType` (que passa a ser derivado como o principal).
  triggerTypes?: TriggerType[];
  dueTime?: string; // e.g. "22:30", "15:00", "08:00"
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requireConfirmation?: boolean;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  assignedRole?: string;
  assignedToId?: string;
  dueTime?: string;
  triggerType?: TriggerType;
  triggerTypes?: TriggerType[];
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requireConfirmation?: boolean;
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  notes?: string;
}

const DAY_MAP = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

@Injectable()
export class TasksService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private getTodayBounds(): { todayStart: Date; todayEnd: Date; todayDayStr: string; currentTimeStr: string } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayDayStr = DAY_MAP[now.getDay()];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    return { todayStart, todayEnd, todayDayStr, currentTimeStr };
  }

  /**
   * Garante que tarefas recorrentes (Templates) gerem uma instância para o dia de hoje,
   * caso hoje seja um dos dias configurados e a instância de hoje ainda não exista.
   */
  async ensureDailyInstances(companyId?: string, tenantId?: string) {
    const { todayStart, todayEnd, todayDayStr } = this.getTodayBounds();

    const scopeConditions: any[] = [];
    if (companyId) scopeConditions.push({ companyId });
    if (tenantId) scopeConditions.push({ tenantId });

    if (scopeConditions.length === 0) return;

    // Buscar templates ativos
    const templates = await this.prisma.task.findMany({
      where: {
        isTemplate: true,
        OR: scopeConditions,
      },
    });

    for (const template of templates) {
      let shouldRunToday = false;

      if (template.frequency === 'DAILY') {
        shouldRunToday = true;
      } else if (template.repeatDays) {
        try {
          const days: string[] = JSON.parse(template.repeatDays);
          if (Array.isArray(days) && days.includes(todayDayStr)) {
            shouldRunToday = true;
          }
        } catch {
          // ignore json parse error
        }
      }

      if (!shouldRunToday) continue;

      // Verificar se já existe uma instância desta tarefa para a data de hoje
      const existingToday = await this.prisma.task.findFirst({
        where: {
          templateId: template.id,
          dueDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });

      if (!existingToday) {
        await this.prisma.task.create({
          data: {
            tenantId: template.tenantId,
            companyId: template.companyId,
            title: template.title,
            description: template.description,
            assignedRole: template.assignedRole,
            assignedToId: template.assignedToId,
            createdById: template.createdById,
            frequency: template.frequency,
            repeatDays: template.repeatDays,
            triggerType: template.triggerType,
            triggerTypes: template.triggerTypes,
            dueTime: template.dueTime,
            dueDate: new Date(),
            priority: template.priority,
            requireConfirmation: template.requireConfirmation,
            status: 'PENDING',
            isTemplate: false,
            templateId: template.id,
          },
        });
      }
    }
  }

  /**
   * Lista tarefas com métricas calculadas em tempo real.
   */
  async listTasks(
    companyId?: string,
    tenantId?: string,
    query?: {
      status?: string;
      role?: string;
      assignedToId?: string;
      mode?: 'employee' | 'manager';
      currentUserId?: string;
      currentUserRole?: string;
    },
  ) {
    // 1. Assegurar instâncias de hoje
    await this.ensureDailyInstances(companyId, tenantId);

    const { todayStart, todayEnd, currentTimeStr } = this.getTodayBounds();

    const scopeConditions: any[] = [];
    if (companyId) scopeConditions.push({ companyId });
    if (tenantId) scopeConditions.push({ tenantId });

    // Buscar todas as tarefas operacionais de hoje (não templates)
    const baseWhere: any = {
      isTemplate: false,
      OR: scopeConditions,
      dueDate: {
        gte: todayStart,
        lte: todayEnd,
      },
    };

    // Buscar tarefas de hoje
    const tasks = await this.prisma.task.findMany({
      where: baseWhere,
      include: {
        assignedTo: { select: { id: true, name: true, role: true, position: true } },
        createdBy: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { dueTime: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Processar status atrasado dinâmico
    const processedTasks = tasks.map((t) => {
      let isOverdue = false;
      if (t.status === 'PENDING' && t.dueTime) {
        // Se já passou do horário previsto
        if (currentTimeStr > t.dueTime) {
          isOverdue = true;
        }
      }
      return {
        ...t,
        isOverdue,
        computedStatus: isOverdue ? 'OVERDUE' : t.status,
      };
    });

    // Calcular métricas de hoje
    const totalToday = processedTasks.length;
    const completedToday = processedTasks.filter((t) => t.status === 'COMPLETED').length;
    const overdueToday = processedTasks.filter((t) => t.computedStatus === 'OVERDUE').length;
    const pendingToday = processedTasks.filter((t) => t.status === 'PENDING').length;
    const completionRate = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

    // Filtrar de acordo com a consulta do frontend
    let filteredTasks = processedTasks;

    if (query?.status && query.status !== 'ALL') {
      if (query.status === 'OVERDUE') {
        filteredTasks = filteredTasks.filter((t) => t.computedStatus === 'OVERDUE');
      } else if (query.status === 'PENDING') {
        filteredTasks = filteredTasks.filter((t) => t.status === 'PENDING' && !t.isOverdue);
      } else {
        filteredTasks = filteredTasks.filter((t) => t.status === query.status);
      }
    }

    if (query?.role && query.role !== 'ALL') {
      filteredTasks = filteredTasks.filter(
        (t) => t.assignedRole === query.role || t.assignedRole === 'Todos',
      );
    }

    if (query?.assignedToId) {
      filteredTasks = filteredTasks.filter((t) => t.assignedToId === query.assignedToId);
    }

    // Modo funcionário: Se especificado, pode priorizar tarefas atribuídas a ele ou ao cargo dele
    if (query?.mode === 'employee' && query?.currentUserId) {
      filteredTasks = filteredTasks.filter((t) => {
        if (!t.assignedToId && (!t.assignedRole || t.assignedRole === 'Todos')) return true;
        if (t.assignedToId === query.currentUserId) return true;
        if (query.currentUserRole && t.assignedRole?.toLowerCase().includes(query.currentUserRole.toLowerCase())) {
          return true;
        }
        return false;
      });
    }

    return {
      metrics: {
        totalToday,
        completedToday,
        pendingToday,
        overdueToday,
        completionRate,
      },
      tasks: filteredTasks,
    };
  }

  /**
   * Lista rotinas cadastradas (templates de tarefas recorrentes).
   */
  async listTemplates(companyId?: string, tenantId?: string) {
    const scopeConditions: any[] = [];
    if (companyId) scopeConditions.push({ companyId });
    if (tenantId) scopeConditions.push({ tenantId });

    return this.prisma.task.findMany({
      where: {
        isTemplate: true,
        OR: scopeConditions,
      },
      include: {
        assignedTo: { select: { id: true, name: true, role: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cria uma nova tarefa ou rotina recorrente.
   */
  async createTask(
    companyId?: string,
    tenantId?: string,
    userId?: string,
    dto?: CreateTaskDto,
  ) {
    if (!dto?.title?.trim()) {
      throw new BadRequestException('O título da tarefa é obrigatório.');
    }

    const isRecurring = dto.frequency && dto.frequency !== 'TODAY';
    const repeatDaysStr = dto.repeatDays ? JSON.stringify(dto.repeatDays) : null;

    // Varios momentos podem ser marcados (ex: "antes da abertura" + "horario
    // fixo"). O principal continua indo em `triggerType` para nao quebrar
    // listagens/filtros; a lista completa vai em `triggerTypes`.
    const triggers = normalizeTriggerTypes(dto.triggerTypes, dto.triggerType);
    const primaryTrigger = pickPrimaryTrigger(triggers);
    const triggersStr = serializeTriggerTypes(triggers);

    if (isRecurring) {
      // 1. Criar o template da rotina recorrente
      const template = await this.prisma.task.create({
        data: {
          tenantId,
          companyId,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          assignedRole: dto.assignedRole || 'Todos',
          assignedToId: dto.assignedToId || null,
          createdById: userId || null,
          frequency: dto.frequency,
          repeatDays: repeatDaysStr,
          triggerType: primaryTrigger,
          triggerTypes: triggersStr,
          dueTime: dto.dueTime || null,
          priority: dto.priority || 'NORMAL',
          requireConfirmation: !!dto.requireConfirmation,
          isTemplate: true,
          status: 'PENDING',
        },
      });

      // 2. Gerar a instância de hoje se aplicável
      const { todayDayStr } = this.getTodayBounds();
      let shouldRunToday = false;
      if (dto.frequency === 'DAILY') {
        shouldRunToday = true;
      } else if (dto.repeatDays && dto.repeatDays.includes(todayDayStr)) {
        shouldRunToday = true;
      }

      if (shouldRunToday) {
        await this.prisma.task.create({
          data: {
            tenantId,
            companyId,
            title: template.title,
            description: template.description,
            assignedRole: template.assignedRole,
            assignedToId: template.assignedToId,
            createdById: userId || null,
            frequency: template.frequency,
            repeatDays: template.repeatDays,
            triggerType: template.triggerType,
            triggerTypes: template.triggerTypes,
            dueTime: template.dueTime,
            dueDate: new Date(),
            priority: template.priority,
            requireConfirmation: template.requireConfirmation,
            status: 'PENDING',
            isTemplate: false,
            templateId: template.id,
          },
        });
      }

      return template;
    } else {
      // Tarefa única de hoje
      const task = await this.prisma.task.create({
        data: {
          tenantId,
          companyId,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          assignedRole: dto.assignedRole || 'Todos',
          assignedToId: dto.assignedToId || null,
          createdById: userId || null,
          frequency: 'TODAY',
          repeatDays: null,
          triggerType: primaryTrigger,
          triggerTypes: triggersStr,
          dueTime: dto.dueTime || null,
          dueDate: new Date(),
          priority: dto.priority || 'NORMAL',
          requireConfirmation: !!dto.requireConfirmation,
          status: 'PENDING',
          isTemplate: false,
        },
      });

      return task;
    }
  }

  /**
   * Marca tarefa como concluída.
   */
  async completeTask(taskId: string, user: { id: string; name: string }, notes?: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: user.id,
        completedByName: user.name,
        notes: notes !== undefined ? notes : task.notes,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Reabre tarefa concluída.
   */
  async reopenTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'PENDING',
        completedAt: null,
        completedById: null,
        completedByName: null,
      },
    });
  }

  /**
   * Atualiza dados de uma tarefa.
   */
  async updateTask(taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    // Se a lista de momentos foi enviada, ela manda: recalculamos tambem o
    // momento principal para manter `triggerType` e `triggerTypes` coerentes
    // (sem isso, `triggerType` ficaria apontando para um momento removido).
    const triggersPatch =
      dto.triggerTypes !== undefined
        ? (() => {
            const triggers = normalizeTriggerTypes(dto.triggerTypes, task.triggerType);
            return {
              triggerType: pickPrimaryTrigger(triggers),
              triggerTypes: serializeTriggerTypes(triggers),
            };
          })()
        : dto.triggerType !== undefined
          ? { triggerType: dto.triggerType, triggerTypes: null }
          : {};

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.assignedRole !== undefined && { assignedRole: dto.assignedRole }),
        ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId || null }),
        ...(dto.dueTime !== undefined && { dueTime: dto.dueTime || null }),
        ...triggersPatch,
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.requireConfirmation !== undefined && { requireConfirmation: dto.requireConfirmation }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  /**
   * Exclui uma tarefa ou rotina.
   */
  async deleteTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    // Se for template, apagar também as instâncias não concluídas geradas por ele
    if (task.isTemplate) {
      await this.prisma.task.deleteMany({
        where: { templateId: taskId, status: 'PENDING' },
      });
    }

    return this.prisma.task.delete({
      where: { id: taskId },
    });
  }

  /**
   * Retorna cargos padrão e lista de membros da equipe (para dropdown de responsáveis).
   */
  async getRolesAndStaff(companyId?: string, tenantId?: string) {
    const scopeConditions: any[] = [];
    if (companyId) scopeConditions.push({ companyId });
    if (tenantId) scopeConditions.push({ tenantId });

    const standardRoles = [
      'Garçom',
      'Cozinha',
      'Caixa',
      'Estoquista',
      'Limpeza',
      'Gerente',
      'Todos',
    ];

    const staffMembers = await this.prisma.user.findMany({
      where: {
        OR: scopeConditions,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
        position: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      standardRoles,
      staffMembers,
    };
  }
}
