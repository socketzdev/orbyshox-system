import { Controller, Get, Query, Header } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ExportService } from '../../common/services/export.service';

@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly exportService: ExportService
  ) {}

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-export.csv"')
  async exportAuditLogs(@Query() q: any) {
    const logs = await this.auditService.findAll(q);
    const columns = [
      { key: 'id', header: 'ID' },
      { key: 'action', header: 'Action' },
      { key: 'entity', header: 'Entity' },
      { key: 'userId', header: 'User ID' },
      { key: 'createdAt', header: 'Created At' }
    ];
    const { stream } = this.exportService.createCSVResponse(logs.data || logs, columns, 'audit-export.csv');
    return stream;
  }

  @Get() findAll(@Query() q: any) { return this.auditService.findAll(q); }
}
