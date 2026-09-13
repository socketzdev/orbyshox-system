import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from './notifications.service';

@Processor('billing-communication')
@Injectable()
export class BillingCommunicationProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingCommunicationProcessor.name);

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const action = job.name;
    const data = job.data;

    this.logger.log(`Processing billing communication: ${action}`);

    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: data.tenantId } });
      if (!tenant) return;

      if (action === 'upcoming-renewal') {
        const ownerEmail = (await this.getTenantOwnerEmail(data.tenantId)) || tenant.email;
        await this.notifications.sendEmail(
          ownerEmail,
          'payment-reminder',
          { invoiceId: data.invoiceId, name: tenant.companyName }
        );
      } else if (action === 'payment-success') {
        const ownerEmail = (await this.getTenantOwnerEmail(data.tenantId)) || tenant.email;
        await this.notifications.sendEmail(
          ownerEmail,
          'payment-success',
          { invoiceId: data.invoiceId, name: tenant.companyName }
        );
      } else if (action === 'payment-failed') {
        await this.notifications.sendPaymentFailed(tenant, data.amountCents || 0);
      }
    } catch (error: any) {
      this.logger.error(`Error processing billing communication ${action}: ${error?.message || error}`);
    }
  }

  private async getTenantOwnerEmail(tenantId: string): Promise<string | null> {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'TENANT_ADMIN' },
      select: { email: true }
    });
    return owner?.email || null;
  }
}
