import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Safety nets at startup
process.on('unhandledRejection', (reason: any) => {
  new Logger('Bootstrap').error(`Unhandled rejection: ${reason?.stack || reason}`);
});

process.on('uncaughtException', (err: Error) => {
  new Logger('Bootstrap').error(`Uncaught exception: ${err?.stack || err}`);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Registrado globalmente: sem isto, erros não tratados vazavam o stack trace
  // do Nest (e detalhes internos) para o cliente.
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Orbyshox Admin API')
    .setDescription('Orbyshox Super Admin Panel API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  const url = await app.getUrl();
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: ${url}`);

  // Rede de segurança: dependências externas (Redis/BullMQ, Stripe) podem
  // emitir erros assíncronos sem handler. Sem estes listeners o Node encerra o
  // processo, tirando a API do ar — antes, um Redis indisponível derrubava o
  // servidor poucos segundos após o boot. Registramos e seguimos servindo; uma
  // dependência quebrada degrada apenas os recursos que dependem dela.
  process.on('unhandledRejection', (reason: any) => {
    logger.error(`Unhandled rejection: ${reason?.stack || reason}`);
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error(`Uncaught exception: ${err?.stack || err}`);
  });
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Falha ao inicializar a aplicação', err?.stack || err);
  process.exit(1);
});
