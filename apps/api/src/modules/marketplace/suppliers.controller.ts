import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantOwnershipGuard } from '../../common/guards/tenant-ownership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('tenant-app/:slug/suppliers')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list(@Param('slug') slug: string, @Body() query: any) {
    return this.suppliersService.list(slug, query || {});
  }

  @Get(':id')
  get(@Param('slug') slug: string, @Param('id') id: string) {
    return this.suppliersService.get(slug, id);
  }

  @Post()
  create(@Param('slug') slug: string, @Body() data: any, @CurrentUser() user: any) {
    return this.suppliersService.create(slug, data);
  }

  @Patch(':id')
  update(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.suppliersService.update(slug, id, data);
  }

  @Post(':id/toggle')
  toggle(@Param('slug') slug: string, @Param('id') id: string) {
    return this.suppliersService.toggleActive(slug, id);
  }

  @Delete(':id')
  remove(@Param('slug') slug: string, @Param('id') id: string) {
    return this.suppliersService.remove(slug, id);
  }

  @Post(':id/products')
  linkProduct(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.suppliersService.linkProduct(slug, id, data);
  }

  @Delete(':id/products/:linkId')
  unlinkProduct(@Param('slug') slug: string, @Param('id') id: string, @Param('linkId') linkId: string) {
    return this.suppliersService.unlinkProduct(slug, id, linkId);
  }
}
