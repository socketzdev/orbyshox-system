import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantOwnershipGuard } from '../../common/guards/tenant-ownership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { canCreate, canRead, canUpdate } from '../../common/rbac/policies';

@Controller('tenant-app/:slug/purchase-orders')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @CheckPolicies(canRead('PurchaseOrder'))
  @Get()
  list(@Param('slug') slug: string, @Query() query: any) {
    return this.purchaseOrdersService.list(slug, query);
  }

  @CheckPolicies(canRead('PurchaseOrder'))
  @Get('suggestions')
  suggestions(@Param('slug') slug: string) {
    return this.purchaseOrdersService.suggestions(slug);
  }

  @CheckPolicies(canRead('PurchaseOrder'))
  @Get(':id')
  get(@Param('slug') slug: string, @Param('id') id: string) {
    return this.purchaseOrdersService.get(slug, id);
  }

  @CheckPolicies(canCreate('PurchaseOrder'))
  @Post()
  create(@Param('slug') slug: string, @Body() data: any, @CurrentUser() user: any) {
    return this.purchaseOrdersService.create(slug, data, user?.sub);
  }

  @CheckPolicies(canUpdate('PurchaseOrder'))
  @Patch(':id')
  update(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.purchaseOrdersService.update(slug, id, data);
  }

  @CheckPolicies(canUpdate('PurchaseOrder'))
  @Post(':id/send')
  send(@Param('slug') slug: string, @Param('id') id: string) {
    return this.purchaseOrdersService.send(slug, id);
  }

  @CheckPolicies(canUpdate('PurchaseOrder'))
  @Post(':id/cancel')
  cancel(@Param('slug') slug: string, @Param('id') id: string) {
    return this.purchaseOrdersService.cancel(slug, id);
  }

  // Recebimento gera lote + movimento de estoque: estoquista e acima.
  @CheckPolicies(canUpdate('PurchaseOrder'))
  @Post(':id/receive')
  receive(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.purchaseOrdersService.receive(slug, id, data);
  }
}
