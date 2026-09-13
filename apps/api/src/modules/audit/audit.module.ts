import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { ExportService } from '../../common/services/export.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, ExportService],
  exports: [AuditService],
})
export class AuditModule {}
