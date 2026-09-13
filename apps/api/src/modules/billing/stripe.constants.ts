/**
 * Token de injeção do cliente do Stripe.
 *
 * Fica num arquivo próprio (e não em `billing.module.ts`) de propósito: o
 * controller importa o token, e se o token morasse no módulo teríamos um ciclo
 * `billing.module → stripe-webhook.controller → billing.module`. Em CommonJS
 * esse ciclo faz o `STRIPE_CLIENT` chegar `undefined` ao `@Inject`, e o Nest
 * falha com "can't resolve dependencies ... at index [2]" só em runtime — o
 * `tsc` não acusa nada.
 */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';
