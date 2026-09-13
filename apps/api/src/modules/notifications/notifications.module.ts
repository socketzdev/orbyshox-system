import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';

const hasRedis = process.env.REDIS_ENABLED === 'true';

@Module({
  imports: [
    ...(hasRedis
      ? [require('@nestjs/bullmq').BullModule.registerQueue({ name: 'billing-communication' })]
      : []),
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    ...(hasRedis ? [require('./billing-communication.processor').BillingCommunicationProcessor] : []),
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
