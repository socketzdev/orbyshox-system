import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ClientSitesService } from './client-sites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuditLog } from '../../common/interceptors/audit.interceptor';

@Controller('client-sites')
export class ClientSitesController {
  constructor(private readonly clientSitesService: ClientSitesService) {}

  @Public()
  @Get('public/:slug')
  getPublic(@Param('slug') slug: string) {
    return this.clientSitesService.getPublic(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get('templates')
  getTemplates(@Query('niche') niche?: string) {
    return this.clientSitesService.getTemplates(niche);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':tenantId')
  getForAdmin(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.clientSitesService.getForAdmin(tenantId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':tenantId')
  @AuditLog('SETTINGS_UPDATE', 'TenantSite')
  save(@Param('tenantId') tenantId: string, @Body() payload: any, @CurrentUser() user: any) {
    return this.clientSitesService.save(tenantId, payload, user);
  }
}
