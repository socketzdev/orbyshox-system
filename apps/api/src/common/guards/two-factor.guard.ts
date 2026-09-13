import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_MFA_PENDING_KEY } from '../decorators/allow-mfa-pending.decorator';

/**
 * Impede o uso de uma sessão que ainda não concluiu o 2FA.
 *
 * O fluxo de login emite, para usuários com 2FA ativo, um `tempToken` com o
 * claim `mfa_pending: true` — e não um access token. Ainda assim, a checagem
 * no servidor é necessária por dois motivos:
 *
 *  1. `is2faEnabled` pode ser ligado DEPOIS que o token foi emitido. Sem esta
 *     checagem, um token de 15 min emitido antes da ativação continuaria dando
 *     acesso total, ignorando o 2FA recém-habilitado.
 *  2. Defesa em profundidade: se qualquer caminho futuro emitir um access token
 *     antes da verificação do segundo fator, o guard o contém.
 *
 * Registrado como APP_GUARD **depois** do JwtAuthGuard, para que `request.user`
 * já esteja populado. Rotas marcadas com `@AllowMfaPending()` são liberadas.
 *
 * IMPORTANTE: o campo do payload é `isTwoFactorAuthenticated` (singular em
 * "Factor"), como definido em `JwtStrategy.validate`. O código anterior lia
 * `user.isTwoFactorEnabled` — campo que não existe no objeto — e portanto
 * nunca bloqueava nada, mesmo se tivesse sido registrado.
 */
@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowPending) return true;

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    if (!user) return true; // rota sem autenticação; o JwtAuthGuard já decidiu

    // `is2faEnabled` vem da linha recarregada do banco (JwtStrategy.validate),
    // então reflete o estado ATUAL, não o do momento da emissão do token.
    if (user.is2faEnabled && !user.isTwoFactorAuthenticated) {
      throw new ForbiddenException('Verificação em duas etapas necessária');
    }

    return true;
  }
}
