import { Controller, Get, Query, Header } from '@nestjs/common';
import { BillingService } from './billing.service';
import { ExportService } from '../../common/services/export.service';

@Controller('billing')
export class InvoiceController {
  constructor(
    private billingService: BillingService,
    private exportService: ExportService
  ) {}

  @Get('invoices/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="invoices-export.csv"')
  async exportInvoices(@Query() q: any) {
    const invoices = await this.billingService.getInvoices(q);
    const columns = [
      { key: 'id', header: 'ID' },
      { key: 'amount', header: 'Amount' },
      { key: 'status', header: 'Status' },
      { key: 'dueDate', header: 'Due Date' }
    ];
    const { stream } = this.exportService.createCSVResponse(invoices.data || invoices, columns, 'invoices-export.csv');
    return stream;
  }

  @Get('invoices') getInvoices(@Query() q: any) { return this.billingService.getInvoices(q); }
  @Get('overview') getOverview() { return this.billingService.getOverview(); }
  @Get('delinquency') getDelinquent() { return this.billingService.getDelinquent(); }
}
