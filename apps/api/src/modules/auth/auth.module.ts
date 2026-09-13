import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../../common/config/jwt-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Sem fallback silencioso: em produção, segredo ausente/placeholder
        // impede a inicialização em vez de assinar tokens com valor público.
        secret: resolveJwtSecret(config, 'AuthModule'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN') || '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
