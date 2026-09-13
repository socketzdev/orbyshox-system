import { Controller, Get, Post, Patch, Param, Body, Delete } from '@nestjs/common';
import { StaffService } from './staff.service';
import { AuditLog } from '../../common/interceptors/audit.interceptor';
import { Roles } from '../../common/guards/roles.guard';

/**
 * Gestão dos usuários internos da plataforma (painel Super Admin).
 * Criar/editar/desativar contas administrativas é uma operação de alto
 * privilégio — restrita a SUPER_ADMIN/ADMIN. A leitura fica aberta a quem já
 * está autenticado no painel (SUPPORT precisa listar para dar atendimento).
 */
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}
  @Get() findAll() { return this.staffService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.staffService.findOne(id); }

  @Post()
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('CREATE_STAFF', 'Staff')
  create(@Body() data: any) { return this.staffService.create(data); }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('UPDATE_STAFF', 'Staff')
  update(@Param('id') id: string, @Body() data: any) { return this.staffService.update(id, data); }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('DEACTIVATE_STAFF', 'Staff')
  deactivate(@Param('id') id: string) { return this.staffService.deactivate(id); }
}
