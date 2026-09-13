import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TwoFactorGuard } from './common/guards/two-factor.guard';

import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PlansModule } from './modules/plans/plans.module';
import { BillingModule } from './modules/billing/billing.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { StaffModule } from './modules/staff/staff.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ClientSitesModule } from './modules/client-sites/client-sites.module';
import { SearchModule } from './modules/search/search.module';
import { TenantAppModule } from './modules/tenant-app/tenant-app.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';

const hasRedis = process.env.REDIS_ENABLED === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    ...(hasRedis
      ? [
          (require('@nestjs/bullmq').BullModule.forRoot({
            connection: {
              host: process.env.REDIS_HOST,
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              enableReadyCheck: false,
              // BullMQ exige `null` para não abortar comandos em blips de rede.
              maxRetriesPerRequest: null,
              lazyConnect: true,
              // Sem isto, uma indisponibilidade do Redis emite um evento `error`
              // sem listener no ioredis, que vira exceção não tratada e DERRUBA
              // o processo — a API respondia e morria segundos depois.
              retryStrategy: (times: number) => Math.min(times * 500, 5000),
            },
          })),
        ]
      : []),
    DatabaseModule,
    AuthModule,
    TenantsModule,
    PlansModule,
    BillingModule,
    DashboardModule,
    TicketsModule,
    StaffModule,
    AuditModule,
    SettingsModule,
    NotificationsModule,
    ...(hasRedis ? [require('./modules/billing/delinquency.module').DelinquencyModule] : []),
    ...(hasRedis ? [require('./modules/notifications/trial-communication.module').TrialCommunicationModule] : []),
    KnowledgeModule,
    ClientSitesModule,
    SearchModule,
    TenantAppModule,
    MarketplaceModule,
    RestaurantModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // ThrottlerModule já estava configurado mas o guard nunca era registrado,
    // deixando o rate limit global inativo. Roda antes dos demais para limitar
    // também tentativas de login/refresh (rotas @Public).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Aplica os @Roles(...) declarados nos controllers. Sem este registro os
    // decoradores seriam metadata inerte e as rotas ficariam sem checagem.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Por ÚLTIMO: depende de `request.user`, populado pelo JwtAuthGuard acima.
    // Sem este registro o 2FA era apenas decorativo — nenhuma rota exigia a
    // conclusão do segundo fator.
    { provide: APP_GUARD, useClass: TwoFactorGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
