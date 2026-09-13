import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const logger = new Logger('JwtSecret');

/** Mínimo aceitável para um HMAC-SHA256 resistente a força bruta offline. */
const MIN_SECRET_LENGTH = 32;

const PLACEHOLDER_VALUES = new Set([
  'dev-secret',
  'secret',
  'changeme',
  'change-me',
  'your-secret',
  'supersegredo',
  'test',
]);

/** Valores conhecidos que aparecem apenas em desenvolvimento. */
function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || normalized.startsWith('change');
}

/**
 * Resolve o segredo de assinatura do JWT.
 *
 * Antes, cada ponto que precisava do segredo fazia
 * `config.get('JWT_SECRET') || 'dev-secret'`. O efeito: se a variável
 * faltasse em produção, a aplicação **subia normalmente** e passava a assinar
 * tokens com um valor público e conhecido — qualquer pessoa podia forjar um
 * token de SUPER_ADMIN. Era uma falha silenciosa, o pior tipo.
 *
 * Agora a ausência é um erro de inicialização em produção (falha explícita,
 * ruidosa, imediata) e um aviso em desenvolvimento, onde um default local é
 * conveniente para não travar o trabalho.
 *
 * `JWT_SECRET` tem precedência; `JWT_ACCESS_SECRET` é o nome legado aceito
 * como alternativa, já que os dois convivem nos `.env` do projeto.
 */
export function resolveJwtSecret(config: ConfigService, context: string): string {
  const raw =
    config.get<string>('JWT_SECRET') || config.get<string>('JWT_ACCESS_SECRET') || '';
  const value = raw.trim();
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  if (!value) {
    if (isProduction) {
      throw new Error(
        `[${context}] JWT_SECRET (ou JWT_ACCESS_SECRET) não definido. ` +
          'A aplicação recusa iniciar em produção sem um segredo de assinatura.',
      );
    }
    logger.warn(
      `[${context}] JWT_SECRET ausente — gerando segredo efêmero de desenvolvimento. ` +
        'Tokens serão invalidados a cada reinício.',
    );
    // Segredo aleatório por processo: nunca é um valor adivinhável, e o fato de
    // reiniciar invalidar sessões torna o ambiente de dev barulhento o bastante
    // para ninguém confundir com produção.
    return crypto.randomBytes(48).toString('hex');
  }

  if (isPlaceholder(value)) {
    if (isProduction) {
      throw new Error(
        `[${context}] JWT_SECRET está com um valor placeholder ("${value}"). ` +
          'Defina um segredo único e aleatório antes de subir em produção.',
      );
    }
    logger.warn(
      `[${context}] JWT_SECRET usa um valor placeholder ("${value}"). Aceitável só em dev.`,
    );
  }

  if (value.length < MIN_SECRET_LENGTH) {
    if (isProduction) {
      throw new Error(
        `[${context}] JWT_SECRET tem ${value.length} caracteres; o mínimo é ${MIN_SECRET_LENGTH}. ` +
          'Use um segredo mais longo (ex.: `openssl rand -hex 32`).',
      );
    }
    logger.warn(
      `[${context}] JWT_SECRET curto (${value.length} caracteres). Recomendado: ${MIN_SECRET_LENGTH}+.`,
    );
  }

  return value;
}
