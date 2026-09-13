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

@Controller('tenant-app/:slug/nfe')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class NfeController {
  constructor(private readonly nfeService: NfeService) {}

  @Get()
  list(@Param('slug') slug: string) {
    return this.nfeService.list(slug);
  }

  @Get(':id')
  get(@Param('slug') slug: string, @Param('id') id: string) {
    return this.nfeService.get(slug, id);
  }

  @Post('import')
  import(@Param('slug') slug: string, @Body() body: { xml: string }) {
    return this.nfeService.import(slug, body?.xml || '');
  }

  @Patch(':id/reconcile/:itemId')
  reconcile(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() data: any,
  ) {
    return this.nfeService.reconcile(slug, id, itemId, data);
  }

  @Post(':id/finalize')
  finalize(@Param('slug') slug: string, @Param('id') id: string) {
    return this.nfeService.finalize(slug, id);
  }
}
