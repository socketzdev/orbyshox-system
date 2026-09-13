import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TenantAppController } from './tenant-app.controller';
import { TenantAppAuthController } from './tenant-app-auth.controller';
import { TenantAppService } from './tenant-app.service';
import { resolveJwtSecret } from '../../common/config/jwt-secret';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Mesmo segredo do AuthModule (o JwtStrategy valida os dois fluxos com
        // a mesma chave) e sem o fallback `'secret'`, que era diferente do
        // `'dev-secret'` usado no resto do projeto — os tokens de um lado não
        // validavam do outro.
        secret: resolveJwtSecret(config, 'TenantAppModule'),
        // `expiresIn` aqui é o default do módulo; o service sempre passa
        // ACCESS_TTL ('15m') explicitamente ao assinar. Os 30 dias que estavam
        // nesta linha nunca se aplicavam ao access token e davam a impressão
        // errada de sessão longa.
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [TenantAppAuthController, TenantAppController],
  providers: [TenantAppService],
  exports: [TenantAppService],
})
export class TenantAppModule {}
