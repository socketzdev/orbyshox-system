import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { InvoiceController } from './invoice.controller';
import { BillingMetricsService } from './billing-metrics.service';
import { RevenueProjectionService } from './revenue-projection.service';
import { ExportService } from '../../common/services/export.service';
import { STRIPE_CLIENT } from './stripe.constants';

/**
 * O cliente do Stripe agora vive num provider compartilhado.
 *
 * Antes, o controller instanciava seu próprio `new Stripe(...)` com fallback `''`
 * e o serviço não tinha acesso ao SDK — daí a assinatura referenciada pelo
 * `checkout.session.completed` nunca ser sincronizada. Uma única instância evita
 * dois clientes concorrentes e mantém a chave num só lugar.
 */
export { STRIPE_CLIENT };

@Module({
  controllers: [StripeWebhookController, InvoiceController],
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secretKey = config.get<string>('STRIPE_SECRET_KEY');
        if (!secretKey) return null;
        return new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
      },
    },
    BillingService,
    BillingMetricsService,
    RevenueProjectionService,
    ExportService,
  ],
  exports: [BillingService, RevenueProjectionService, BillingMetricsService, STRIPE_CLIENT],
})
export class BillingModule {}
