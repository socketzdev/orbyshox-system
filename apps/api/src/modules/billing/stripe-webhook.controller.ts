import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { Public } from '../../common/decorators/public.decorator';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { STRIPE_CLIENT } from './stripe.constants';

/**
 * Endpoint de webhook do Stripe.
 *
 * Endereço público por natureza (o Stripe não carrega JWT), então a autenticação
 * É a assinatura HMAC verificada por `constructEvent`. Três cuidados que antes
 * não existiam e que tornavam este endpoint forjável:
 *
 *  1. Nenhum fallback silencioso para `''` no secret. Um secret vazio faz o
 *     `constructEvent` lançar, mas o erro era mascarado por um `catch` genérico;
 *     pior, qualquer valor aceito ampliava a superfície. Agora ausente = 503.
 *  2. Exigimos `stripe-signature` antes de tocar no corpo.
 *  3. Métodos de pagamento são reprocessados a partir do objeto REAL buscado
 *     na API do Stripe (`retrieve`) em vez de confiar no payload recebido.
 *     Um atacante que descubra o secret (ou uma versão antiga dele) não consegue
 *     mais injetar valores arbitrários: o que vai para o banco é o que o Stripe
 *     tem registrado. Isso também protege contra payloads truncados/replays
 *     parciais de SDKs desatualizados.
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | null;
  /** Eventos cujo valor financeiro precisa vir da fonte (Stripe), não do payload. */
  private static readonly EVENTS_REQUIRING_REFETCH = new Set([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'invoice.paid',
  ]);

  constructor(
    private billingService: BillingService,
    private config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly injectedStripe: Stripe | null,
  ) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    // Reusa a instância compartilhada do módulo; cria uma local apenas se o
    // provider não foi resolvido (ex.: testes unitários do controller).
    this.stripe =
      this.injectedStripe ??
      (this.config.get<string>('STRIPE_SECRET_KEY')
        ? new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') as string, {
            apiVersion: '2023-10-16' as any,
          })
        : null);
    this.webhookSecret = webhookSecret || null;

    if (!this.stripe || !this.webhookSecret) {
      this.logger.warn(
        'Stripe não configurado (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET ausentes). ' +
          'O endpoint de webhook responderá 503 até serem definidos.',
      );
    }
  }

  @Public()
  @Post()
  async handleWebhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    if (!this.stripe || !this.webhookSecret) {
      // Falha explícita: nunca processamos um evento sem poder verificar a origem.
      throw new ServiceUnavailableException('Stripe webhook não configurado');
    }
    if (!sig) {
      throw new BadRequestException('Webhook Error: assinatura ausente');
    }
    if (!req.rawBody) {
      // `rawBody: true` no bootstrap é pré-requisito da verificação HMAC.
      this.logger.error('rawBody indisponível — verifique `rawBody: true` no NestFactory.create');
      throw new BadRequestException('Webhook Error: corpo bruto indisponível');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(req.rawBody, sig, this.webhookSecret);
    } catch (err: any) {
      // Não vazamos detalhes internos do erro de assinatura para o chamador.
      this.logger.warn(`Assinatura de webhook inválida: ${err?.message || err}`);
      throw new BadRequestException('Webhook Error: assinatura inválida');
    }

    const payload = await this.resolveTrustedPayload(event);
    await this.billingService.processStripeEvent({ ...event, data: { object: payload } });
    return { received: true };
  }

  /**
   * Rebusca o objeto na API do Stripe. Se a busca falhar, ABORTA o evento
   * (propaga o erro) — é preferível o Stripe reenviar do que gravar dados
   * não verificados no banco.
   */
  private async resolveTrustedPayload(event: Stripe.Event): Promise<any> {
    if (!StripeWebhookController.EVENTS_REQUIRING_REFETCH.has(event.type)) {
      return event.data.object;
    }

    const incoming = event.data.object as any;
    const objectId: string | undefined = incoming?.id;
    if (!objectId) {
      throw new BadRequestException('Webhook Error: evento sem id de objeto');
    }

    try {
      if (event.type.startsWith('checkout.session')) {
        return await this.stripe!.checkout.sessions.retrieve(objectId);
      }
      if (event.type.startsWith('customer.subscription')) {
        return await this.stripe!.subscriptions.retrieve(objectId);
      }
      if (event.type.startsWith('invoice.')) {
        return await this.stripe!.invoices.retrieve(objectId);
      }
    } catch (err: any) {
      this.logger.error(
        `Falha ao rebuscar ${event.type} (${objectId}) no Stripe: ${err?.message || err}`,
      );
      throw new ServiceUnavailableException('Não foi possível confirmar o objeto no Stripe');
    }

    return incoming;
  }
}
