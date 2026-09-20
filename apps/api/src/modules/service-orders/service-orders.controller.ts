import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { canRead, canCreate, canUpdate, canDelete } from '../../common/rbac/policies';
import { ServiceOrdersService } from './service-orders.service';

@Controller('service-orders')
export class ServiceOrdersController {
  constructor(private readonly service: ServiceOrdersService) {}

  private ctx(user: any): { companyId?: string; tenantId?: string; userId: string } {
    const companyId = user?.companyId;
    const tenantId = user?.tenantId;
    if (!companyId && !tenantId) {
      throw new UnauthorizedException('Usuário não vinculado a uma empresa ou estabelecimento.');
    }
    return { companyId, tenantId, userId: user?.id || user?.sub };
  }

  @Get('dashboard')
  @CheckPolicies(canRead('ServiceOrder'))
  async dashboard(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.dashboard(companyId, tenantId);
  }

  @Get('reports')
  @CheckPolicies(canRead('ServiceOrder'))
  async reports(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.reports(companyId, tenantId);
  }

  @Get('technicians')
  @CheckPolicies(canRead('ServiceOrder'))
  async technicians(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.technicians(companyId, tenantId);
  }

  // ─── Equipamentos ───
  @Get('equipment')
  @CheckPolicies(canRead('ServiceEquipment'))
  async listEquipment(@CurrentUser() user: any, @Query('customerId') customerId?: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.listEquipment(companyId, tenantId, customerId);
  }

  @Post('equipment')
  @CheckPolicies(canCreate('ServiceEquipment'))
  async createEquipment(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.createEquipment(companyId, tenantId, dto);
  }

  @Patch('equipment/:id')
  @CheckPolicies(canUpdate('ServiceEquipment'))
  async updateEquipment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.updateEquipment(companyId, tenantId, id, dto);
  }

  @Delete('equipment/:id')
  @CheckPolicies(canDelete('ServiceEquipment'))
  async deleteEquipment(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.deleteEquipment(companyId, tenantId, id);
  }

  // ─── Ordens de serviço ───
  @Get('orders')
  @CheckPolicies(canRead('ServiceOrder'))
  async listOrders(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('technicianId') technicianId?: string,
    @Query('search') search?: string,
  ) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.listOrders(companyId, tenantId, { status, technicianId, search });
  }

  @Get('orders/:id')
  @CheckPolicies(canRead('ServiceOrder'))
  async getOrder(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.getOrder(companyId, tenantId, id);
  }

  @Post('orders')
  @CheckPolicies(canCreate('ServiceOrder'))
  async createOrder(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId, userId } = this.ctx(user);
    return this.service.createOrder(companyId, tenantId, dto, userId);
  }

  @Patch('orders/:id')
  @CheckPolicies(canUpdate('ServiceOrder'))
  async updateOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.updateOrder(companyId, tenantId, id, dto);
  }

  @Patch('orders/:id/status')
  @CheckPolicies(canUpdate('ServiceOrder'))
  async setStatus(@CurrentUser() user: any, @Param('id') id: string, @Body('status') status: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.setStatus(companyId, tenantId, id, status);
  }

  @Post('orders/:id/parts')
  @CheckPolicies(canUpdate('ServiceOrder'))
  async addPart(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId, userId } = this.ctx(user);
    return this.service.addPart(companyId, tenantId, id, dto, userId);
  }

  @Delete('orders/:id/parts/:itemId')
  @CheckPolicies(canUpdate('ServiceOrder'))
  async removePart(@CurrentUser() user: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    const { companyId, tenantId, userId } = this.ctx(user);
    return this.service.removePart(companyId, tenantId, id, itemId, userId);
  }

  // ─── Orçamentos ───
  @Get('quotes')
  @CheckPolicies(canRead('ServiceQuote'))
  async listQuotes(@CurrentUser() user: any, @Query('status') status?: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.listQuotes(companyId, tenantId, status);
  }

  @Post('quotes')
  @CheckPolicies(canCreate('ServiceQuote'))
  async createQuote(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.service.createQuote(companyId, tenantId, dto);
  }

  @Patch('quotes/:id/status')
  @CheckPolicies(canUpdate('ServiceQuote'))
  async setQuoteStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    const status = typeof dto?.status === 'string' ? dto.status : dto;
    return this.service.setQuoteStatus(companyId, tenantId, id, status, {
      scheduledAt: dto?.scheduledAt,
      technicianId: dto?.technicianId,
      technicianName: dto?.technicianName,
    });
  }
}
