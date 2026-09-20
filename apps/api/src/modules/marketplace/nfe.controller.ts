import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NfeService } from './nfe.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantOwnershipGuard } from '../../common/guards/tenant-ownership.guard';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { canCreate, canFinalize, canRead, canUpdate } from '../../common/rbac/policies';

@Controller('tenant-app/:slug/nfe')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class NfeController {
  constructor(private readonly nfeService: NfeService) {}

  @CheckPolicies(canRead('Nfe'))
  @Get()
  list(@Param('slug') slug: string) {
    return this.nfeService.list(slug);
  }

  @CheckPolicies(canRead('Nfe'))
  @Get(':id')
  get(@Param('slug') slug: string, @Param('id') id: string) {
    return this.nfeService.get(slug, id);
  }

  @CheckPolicies(canCreate('Nfe'))
  @Post('import')
  import(@Param('slug') slug: string, @Body() body: { xml: string }) {
    return this.nfeService.import(slug, body?.xml || '');
  }

  // Reconciliar é revisar item a item — o estoquista pode.
  @CheckPolicies(canUpdate('Nfe'))
  @Patch(':id/reconcile/:itemId')
  reconcile(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() data: any,
  ) {
    return this.nfeService.reconcile(slug, id, itemId, data);
  }

  // Finalizar lança estoque E contas a pagar de uma vez. Ação `finalize`,
  // distinta de `update`: o estoquista reconcilia mas não finaliza.
  @CheckPolicies(canFinalize('Nfe'))
  @Post(':id/finalize')
  finalize(@Param('slug') slug: string, @Param('id') id: string) {
    return this.nfeService.finalize(slug, id);
  }
}
