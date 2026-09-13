import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

/**
 * Rotina diária de inadimplência.
 *
 * O processador (`DelinquencyProcessor`, fila `delinquency`) existia mas NUNCA
 * era registrado como provider, nem a fila era registrada, nem havia produtor —
 * ou seja, a automação de suspender/cancelar inquilinos inadimplentes jamais
 * rodou. Aqui a fila é registrada, o worker é provido e um job repetível diário
 * é agendado no boot (idempotente: `jobId` fixo evita duplicar o agendamento
 * a cada restart/redeploy).
 *
 * Este módulo só é importado quando `REDIS_HOST` está definido (ver app.module),
 * então o `InjectQueue` sempre resolve em runtime.
 */
@Module({
  imports: [
    NotificationsModule,
    SettingsModule,
    require('@nestjs/bullmq').BullModule.registerQueue({ name: 'delinquency' }),
  ],
  providers: [require('./delinquency.processor').DelinquencyProcessor],
})
export class DelinquencyModule implements OnModuleInit {
  private readonly logger = new Logger(DelinquencyModule.name);

  constructor(@InjectQueue('delinquency') private readonly delinquencyQueue: Queue) {}

  async onModuleInit() {
    try {
      await this.delinquencyQueue.add(
        'daily-delinquency-check',
        {},
        {
          repeat: { pattern: '0 3 * * *' }, // 03:00 todos os dias
          jobId: 'daily-delinquency-check',
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      this.logger.log('Rotina diária de inadimplência agendada (03:00).');
    } catch (error: any) {
      // Redis indisponível não pode impedir a API de subir.
      this.logger.warn(
        `Não foi possível agendar a rotina de inadimplência: ${error?.message || error}`,
      );
    }
  }
}
