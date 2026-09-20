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
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { canCreate, canDelete, canRead, canUpdate } from '../../common/rbac/policies';

@Controller('tenant-app/:slug/suppliers')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @CheckPolicies(canRead('Supplier'))
  @Get()
  list(@Param('slug') slug: string, @Body() query: any) {
    return this.suppliersService.list(slug, query || {});
  }

  @CheckPolicies(canRead('Supplier'))
  @Get(':id')
  get(@Param('slug') slug: string, @Param('id') id: string) {
    return this.suppliersService.get(slug, id);
  }

  @CheckPolicies(canCreate('Supplier'))
  @Post()
  create(@Param('slug') slug: string, @Body() data: any, @CurrentUser() user: any) {
    return this.suppliersService.create(slug, data);
  }

  @CheckPolicies(canUpdate('Supplier'))
  @Patch(':id')
  update(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.suppliersService.update(slug, id, data);
  }

  @CheckPolicies(canUpdate('Supplier'))
  @Post(':id/toggle')
  toggle(@Param('slug') slug: string, @Param('id') id: string) {
    return this.suppliersService.toggleActive(slug, id);
  }

  // Exclusão irreversível: só TENANT_ADMIN (H6/M7 da auditoria).
  @CheckPolicies(canDelete('Supplier'))
  @Delete(':id')
  remove(@Param('slug') slug: string, @Param('id') id: string) {
    return this.suppliersService.remove(slug, id);
  }

  @CheckPolicies(canUpdate('Supplier'))
  @Post(':id/products')
  linkProduct(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.suppliersService.linkProduct(slug, id, data);
  }

  // Desvincular produto não destrói o fornecedor nem o produto: é edição.
  @CheckPolicies(canUpdate('Supplier'))
  @Delete(':id/products/:linkId')
  unlinkProduct(@Param('slug') slug: string, @Param('id') id: string, @Param('linkId') linkId: string) {
    return this.suppliersService.unlinkProduct(slug, id, linkId);
  }
}
