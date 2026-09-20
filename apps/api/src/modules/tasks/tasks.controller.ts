import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import {
  canRead,
  canCreate,
  canUpdate,
  canDelete,
} from '../../common/rbac/policies';
import { TasksService, CreateTaskDto, UpdateTaskDto } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private extractContext(user: any): { companyId?: string; tenantId?: string; userId: string; userName: string; userRole?: string } {
    const companyId = user?.companyId;
    const tenantId = user?.tenantId;
    const userId = user?.id || user?.sub;
    const userName = user?.name || 'Funcionário';
    const userRole = user?.role;

    if (!companyId && !tenantId) {
      throw new UnauthorizedException('Usuário não vinculado a uma empresa ou estabelecimento.');
    }

    return { companyId, tenantId, userId, userName, userRole };
  }

  @Get()
  @CheckPolicies(canRead('Task'))
  async getTasks(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('mode') mode?: 'employee' | 'manager',
  ) {
    const { companyId, tenantId, userId, userRole } = this.extractContext(user);
    return this.tasksService.listTasks(companyId, tenantId, {
      status,
      role,
      assignedToId,
      mode,
      currentUserId: userId,
      currentUserRole: userRole,
    });
  }

  @Get('templates')
  @CheckPolicies(canRead('Task'))
  async getTemplates(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.extractContext(user);
    return this.tasksService.listTemplates(companyId, tenantId);
  }

  @Get('roles')
  @CheckPolicies(canRead('Task'))
  async getRolesAndStaff(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.extractContext(user);
    return this.tasksService.getRolesAndStaff(companyId, tenantId);
  }

  @Post()
  @CheckPolicies(canCreate('Task'))
  async createTask(@CurrentUser() user: any, @Body() dto: CreateTaskDto) {
    const { companyId, tenantId, userId } = this.extractContext(user);
    return this.tasksService.createTask(companyId, tenantId, userId, dto);
  }

  @Patch(':id/complete')
  @CheckPolicies(canUpdate('Task'))
  async completeTask(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('notes') notes?: string,
  ) {
    const { userId, userName } = this.extractContext(user);
    return this.tasksService.completeTask(id, { id: userId, name: userName }, notes);
  }

  @Patch(':id/reopen')
  @CheckPolicies(canUpdate('Task'))
  async reopenTask(@Param('id') id: string) {
    return this.tasksService.reopenTask(id);
  }

  @Patch(':id')
  @CheckPolicies(canUpdate('Task'))
  async updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canDelete('Task'))
  async deleteTask(@Param('id') id: string) {
    return this.tasksService.deleteTask(id);
  }
}
