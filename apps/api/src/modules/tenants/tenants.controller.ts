import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Header, StreamableFile, BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { SlugService } from '../../common/services/slug.service';
import { AuditLog } from '../../common/interceptors/audit.interceptor';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExportService } from '../../common/services/export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Endpoints de gestão de empresas (criar, suspender, cancelar, estender trial,
 * impersonar). São operações destrutivas ou sensíveis a nível de plataforma —
 * por isso exigem perfil administrativo. Antes desta mudança, qualquer usuário
 * autenticado (inclusive um VIEWER de um tenant) podia suspendê-las/cancelá-las
 * apenas informando o id, pois só `create` tinha checagem de papel.
 */
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly exportService: ExportService,
    private readonly slugService: SlugService,
  ) {}

  @Public()
  @Get('validate-slug')
  async validateSlug(@Query('slug') slug: string, @Query('excludeId') excludeId?: string) {
    return this.slugService.validateForCreate(slug || '');
  }

  @Public()
  @Get('validate-phone')
  async validatePhone(@Query('phone') phone: string, @CurrentUser() user?: any) {
    return this.tenantsService.validatePhone(phone || '', user);
  }

  @Get('export')
  @Roles('SUPER_ADMIN', 'DEV', 'FINANCE')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="tenants-export.csv"')
  async exportTenants(@Query() query: any) {
    const tenants = await this.tenantsService.findAll(query);
    const columns = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      { key: 'status', header: 'Status' },
      { key: 'createdAt', header: 'Created At' }
    ];
    const { stream } = this.exportService.createCSVResponse(tenants.data || tenants, columns, 'tenants-export.csv');
    return stream;
  }

  @Get()
  findAll(@Query() query: any) { return this.tenantsService.findAll(query); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.tenantsService.findOne(id); }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('SUPER_ADMIN', 'DEV')
  create(@Body() data: any, @CurrentUser() user: any) { return this.tenantsService.create(data, user); }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('UPDATE_TENANT', 'Tenant')
  async update(@Param('id') id: string, @Body() data: any) {
    if (data.slug) {
      const normalized = this.slugService.normalize(data.slug);
      const current = await this.tenantsService['prisma'].tenant.findUnique({ where: { id } });
      if (!current) throw new BadRequestException('Tenant not found');
      const result = await this.slugService.validateForCreate(normalized);
      if (!result.available && result.slug !== current.slug) {
        throw new BadRequestException(result.reason || 'Slug indisponível');
      }
      data.slug = result.slug;
    }
    return this.tenantsService.update(id, data);
  }

  @Post(':id/suspend')
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('SUSPEND_TENANT', 'Tenant')
  suspend(@Param('id') id: string, @Body('reason') reason: string) { return this.tenantsService.suspend(id, reason); }

  @Post(':id/reactivate')
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('REACTIVATE_TENANT', 'Tenant')
  reactivate(@Param('id') id: string) { return this.tenantsService.reactivate(id); }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'DEV')
  @AuditLog('CANCEL_TENANT', 'Tenant')
  cancel(@Param('id') id: string) { return this.tenantsService.cancel(id); }

  @Post(':id/extend-trial')
  @Roles('SUPER_ADMIN', 'DEV', 'FINANCE')
  @AuditLog('EXTEND_TRIAL', 'Tenant')
  extendTrial(@Param('id') id: string) { return this.tenantsService.extendTrial(id); }

  @Post(':id/view-as')
  @Roles('SUPER_ADMIN', 'SUPPORT_MANAGER')
  @AuditLog('VIEW_AS_TENANT', 'Tenant')
  viewAs(@Param('id') id: string, @CurrentUser() user: any) { return this.tenantsService.viewAs(id, user.id); }

  @Get(':id/notes')
  @Roles('SUPER_ADMIN', 'SUPPORT_MANAGER', 'SUPPORT_AGENT')
  getNotes(@Param('id') id: string) { return this.tenantsService.getNotes(id); }

  @Post(':id/notes')
  @Roles('SUPER_ADMIN', 'SUPPORT_MANAGER', 'SUPPORT_AGENT')
  createNote(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('content') content: string
  ) {
    return this.tenantsService.createNote(id, user?.id || 'admin', content);
  }
}
