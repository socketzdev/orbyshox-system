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

@Controller('tenant-app/:slug/batches')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get()
  list(@Param('slug') slug: string, @Query() query: any) {
    return this.batchesService.list(slug, query);
  }

  @Get('stats')
  stats(@Param('slug') slug: string) {
    return this.batchesService.stats(slug);
  }

  @Patch(':id')
  update(@Param('slug') slug: string, @Param('id') id: string, @Body() data: any) {
    return this.batchesService.update(slug, id, data);
  }

  @Delete(':id')
  remove(@Param('slug') slug: string, @Param('id') id: string) {
    return this.batchesService.remove(slug, id);
  }
}
