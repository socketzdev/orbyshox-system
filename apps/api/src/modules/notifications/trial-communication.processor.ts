import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from './notifications.service';

@Processor('trial-communication')
@Injectable()
export class TrialCommunicationProcessor extends WorkerHost {
  private readonly logger = new Logger(TrialCommunicationProcessor.name);

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log('Running daily trial communications process');
    
    const trialing = await this.prisma.tenant.findMany({ 
      where: { status: 'TRIAL' } 
    });

    for (const tenant of trialing) {
      const daysInTrial = Math.floor((Date.now() - tenant.createdAt.getTime()) / 86400000);
      const daysUntilEnd = tenant.trialEndsAt ? Math.floor((tenant.trialEndsAt.getTime() - Date.now()) / 86400000) : 0;
      
      try {
        if (daysInTrial === 1) {
          await this.notifications.sendWelcome(tenant);
        } else if (daysInTrial === 7) {
          await this.notifications.sendEmail(
            tenant.email,
            'trial-engagement',
            { name: tenant.companyName }
          );
        } else if (daysUntilEnd === 2) {
          await this.notifications.sendTrialEnding(tenant, 2);
        } else if (daysUntilEnd === 0) {
          await this.notifications.sendEmail(
            tenant.email,
            'trial-final-reminder',
            { name: tenant.companyName }
          );
        }
      } catch (error: any) {
        this.logger.error(`Error sending trial communication for tenant ${tenant.id}: ${error?.message || error}`);
      }
    }

    // Handle expired trials
    const expiredTrials = await this.prisma.tenant.findMany({
      where: { 
        status: 'TRIAL',
        trialEndsAt: { lt: new Date() }
      }
    });

    for (const tenant of expiredTrials) {
      try {
        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: { status: 'SUSPENDED' }
        });

        await this.notifications.sendAccountSuspended(tenant, 'Período de teste expirado');
      } catch (error: any) {
        this.logger.error(`Error handling expired trial for tenant ${tenant.id}: ${error?.message || error}`);
      }
    }
  }
}
