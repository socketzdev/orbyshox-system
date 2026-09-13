import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsModule } from './notifications.module';

/**
 * Comunicações de ciclo de vida do trial + expiração.
 *
 * `TrialCommunicationProcessor` (fila `trial-communication`) estava declarado
 * mas sem `providers`, sem fila registrada e sem produtor — o resultado era
 * que trials NUNCA expiravam: inquilinos ficavam em TRIAL indefinidamente,
 * sem cobrança e sem suspensão. Aqui a fila é registrada, o worker provido e o
 * job diário agendado de forma idempotente.
 *
 * Este módulo só é importado quando `REDIS_HOST` está definido (ver app.module).
 */
@Module({
  imports: [
    NotificationsModule,
    require('@nestjs/bullmq').BullModule.registerQueue({ name: 'trial-communication' }),
  ],
  providers: [require('./trial-communication.processor').TrialCommunicationProcessor],
})
export class TrialCommunicationModule implements OnModuleInit {
  private readonly logger = new Logger(TrialCommunicationModule.name);

  constructor(@InjectQueue('trial-communication') private readonly trialQueue: Queue) {}

  async onModuleInit() {
    try {
      await this.trialQueue.add(
        'daily-trial-check',
        {},
        {
          repeat: { pattern: '0 8 * * *' }, // 08:00 todos os dias
          jobId: 'daily-trial-check',
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      this.logger.log('Rotina diária de trial agendada (08:00).');
    } catch (error: any) {
      // Redis indisponível não pode impedir a API de subir.
      this.logger.warn(`Não foi possível agendar a rotina de trial: ${error?.message || error}`);
    }
  }
}
