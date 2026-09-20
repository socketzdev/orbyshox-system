import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BatchesService } from './batches.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantOwnershipGuard } from '../../common/guards/tenant-ownership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { canDelete, canRead, canUpdate } from '../../common/rbac/policies';

@Controller('tenant-app/:slug/batches')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @CheckPolicies(canRead('StockBatch'))
  @Get()
  list(@Param('slug') slug: string, @Query() query: any) {
    return this.batchesService.list(slug, query);
  }

  @CheckPolicies(canRead('StockBatch'))
  @Get('stats')
  stats(@Param('slug') slug: string) {
    return this.batchesService.stats(slug);
  }

  // O guard libera (o estoquista pode editar validade/status); a restrição de
  // QUANTIDADE é aplicada no serviço, que a converte em movimento de estoque
  // rastreado em vez de edição livre do campo (achado C8).
  @CheckPolicies(canUpdate('StockBatch'))
  @Patch(':id')
  update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser() user: any,
  ) {
    return this.batchesService.update(slug, id, data, user?.sub || user?.id);
  }

  // Exclusão irreversível: só TENANT_ADMIN.
  @CheckPolicies(canDelete('StockBatch'))
  @Delete(':id')
  remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.batchesService.remove(slug, id, user?.sub || user?.id);
  }
}
