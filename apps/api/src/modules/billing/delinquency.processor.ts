import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  AUDIT_ACTION,
  INVOICE_STATUS,
  TENANT_STATUS,
} from '@projeto-saas/shared-types';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

@Processor('delinquency')
@Injectable()
export class DelinquencyProcessor extends WorkerHost {
  private readonly logger = new Logger(DelinquencyProcessor.name);

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private notifications: NotificationsService,
    private settings: SettingsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log('Running daily delinquency process');

    const config = await this.settings.getSetting('DELINQUENCY_CONFIG');
    const delinquencyConfig = (config?.value as { suspend_days?: number; cancel_days?: number }) || {
      suspend_days: 7,
      cancel_days: 30,
    };
    const suspendDays = delinquencyConfig.suspend_days || 7;
    const cancelDays = delinquencyConfig.cancel_days || 30;

    const delinquentTenants = await this.prisma.tenant.findMany({
      where: { status: TENANT_STATUS.PAST_DUE },
      include: {
        invoices: {
          where: { status: INVOICE_STATUS.OVERDUE },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
    });

    for (const tenant of delinquentTenants) {
      if (!tenant.invoices || tenant.invoices.length === 0) continue;

      const oldestOverdueInvoice = tenant.invoices[0];
      const dueDate = oldestOverdueInvoice.dueDate;
      if (!dueDate) continue;

      const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);

      try {
        // Ordem deliberada: a condição mais severa primeiro.
        // O código anterior testava `>= suspendDays` antes de `>= cancelDays`,
        // então quando `cancel_days` (30) era atingido o `else if` de suspensão
        // já havia casado (30 >= 7) e o cancelamento NUNCA acontecia — contas
        // inadimplentes ficavam apenas suspensas para sempre.
        if (daysOverdue >= cancelDays && tenant.status !== TENANT_STATUS.CANCELED) {
          await this.prisma.tenant.update({
            where: { id: tenant.id },
            data: { status: TENANT_STATUS.CANCELED },
          });
          await this.logAction(tenant.id, `Account auto-canceled (Day ${cancelDays})`, AUDIT_ACTION.TENANT_CANCEL);
        } else if (daysOverdue >= suspendDays && tenant.status !== TENANT_STATUS.SUSPENDED) {
          await this.prisma.tenant.update({
            where: { id: tenant.id },
            data: { status: TENANT_STATUS.SUSPENDED },
          });
          await this.notifications.sendAccountSuspended(tenant, `Inadimplência de ${daysOverdue} dias`);
          await this.logAction(tenant.id, `Account auto-suspended (Day ${suspendDays})`, AUDIT_ACTION.TENANT_SUSPEND);
        } else if (daysOverdue === 1) {
          await this.notifications.sendPaymentFailed(tenant, oldestOverdueInvoice.amountCents);
          await this.logAction(tenant.id, 'Payment failed reminder sent (Day 1)', AUDIT_ACTION.MANUAL_PAYMENT);
        } else if (daysOverdue === 3) {
          await this.notifications.sendPaymentFailed(tenant, oldestOverdueInvoice.amountCents);
          await this.logAction(tenant.id, 'Second payment reminder sent (Day 3)', AUDIT_ACTION.MANUAL_PAYMENT);
        }
      } catch (error: any) {
        this.logger.error(`Error processing delinquency for tenant ${tenant.id}: ${error?.message || error}`);
      }
    }
  }

  private async logAction(tenantId: string, message: string, action: string) {
    const admin = await this.prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (!admin) return;

    await this.prisma.auditLog.create({
      data: {
        userId: admin.id,
        action,
        targetType: 'Tenant',
        targetId: tenantId,
        metadata: JSON.stringify({ message, automation: 'delinquency' }),
      },
    });
  }
}
