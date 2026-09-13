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

@Controller('tenant-app/:slug/purchase-orders')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  list(@Param('slug') slug: string, @Query() query: any) {
    return this.purchaseOrdersService.list(slug, query);
  }

  @Get('suggestions')
  suggestions(@Param('slug') slug: string) {
    return this.purchaseOrdersService.suggestions(slug);
  }

  @Get(':id')
  get(@Param('slug') slug: string, @Param('id') id: string) {
    return this.purchaseOrdersService.get(slug, id);
  }

  @Post()
  create(@Param('slug') slug: string, @Body() data: any, @CurrentUser() user: any) {
    return this.purchaseOrdersService.create(slug, data, user?.sub);
  }

  @Patch(':id')
  update(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.purchaseOrdersService.update(slug, id, data);
  }

  @Post(':id/send')
  send(@Param('slug') slug: string, @Param('id') id: string) {
    return this.purchaseOrdersService.send(slug, id);
  }

  @Post(':id/cancel')
  cancel(@Param('slug') slug: string, @Param('id') id: string) {
    return this.purchaseOrdersService.cancel(slug, id);
  }

  @Post(':id/receive')
  receive(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.purchaseOrdersService.receive(slug, id, data);
  }
}
