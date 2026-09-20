import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
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

  // Limite do corpo JSON: o padrão do Express é 100kb e derrubava upload de
  // logo (base64 de MBs) com 413. 10mb cobre folga. O `verify` preserva o
  // `req.rawBody` exigido pelo webhook do Stripe — sem ele a validação HMAC
  // quebra. Registrado antes das rotas: o parser padrão do Nest pula o que
  // já foi lido (req._body), então não há duplo parse.
  const preserveRawBody = (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.use(json({ limit: '10mb', verify: preserveRawBody }));
  app.use(urlencoded({ limit: '10mb', extended: true, verify: preserveRawBody }));

  // O painel costuma ser acessado por vario enderecos diferentes (localhost, o
  // IP da rede local e o IP do Radmin VPN). Uma lista fixa em FRONTEND_URL
  // derruba o CORS assim que o usuario abre o painel por outro endereco, entao
  // aceitamos QUALQUER origem que aponte para a maquina local/VPN:
  //  - localhost / 127.0.0.1 (uso no proprio PC)
  //  - 192.168.x.x / 10.x.x.x / 172.16-31.x.x (rede local)
  //  - 26.x.x.x, 25.x.x.x e 1.x.x.x (faixas do Radmin VPN / Hamachi)
  // Requisicoes feitas pelo proxy do Vite nao enviam Origin, e tambem passam.
  const allowedOrigin =
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|26\.\d{1,3}\.\d{1,3}\.\d{1,3}|25\.\d{1,3}\.\d{1,3}\.\d{1,3}|1\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

  const extraOrigin = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Sem Origin: chamadas de mesma origem, curl, proxy do Vite, apps nativos.
      if (!origin) return callback(null, true);
      if (allowedOrigin.test(origin) || extraOrigin.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
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
  // '0.0.0.0' faz a API escutar em todas as interfaces de rede. Com o padrao
  // (localhost) ela ficaria acessivel apenas no proprio PC, impedindo o acesso
  // pelo IP do Radmin VPN.
  await app.listen(port, '0.0.0.0');

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
