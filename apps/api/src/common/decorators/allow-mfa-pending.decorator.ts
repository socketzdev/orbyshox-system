import { SetMetadata } from '@nestjs/common';

/**
 * Marca uma rota como acessível mesmo quando o 2FA da sessão ainda não foi
 * concluído. Usado pelo endpoint que CONCLUI o 2FA (ou o descarta, no caso do
 * `2fa/setup` do primeiro cadastro), que obviamente não pode exigir o fator
 * que ele próprio está verificando.
 */
export const ALLOW_MFA_PENDING_KEY = 'allowMfaPending';
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING_KEY, true);
