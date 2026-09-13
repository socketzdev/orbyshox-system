import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { ExportService } from '../../common/services/export.service';
import { SlugService } from '../../common/services/slug.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, ExportService, SlugService],
  exports: [TenantsService, SlugService],
})
export class TenantsModule {}
