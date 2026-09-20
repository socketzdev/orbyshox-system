import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { AllowMfaPending } from '../../common/decorators/allow-mfa-pending.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const ACCESS_COOKIE = 'saas_access';
const REFRESH_COOKIE = 'saas_refresh';
// O painel do inquilino (/app) renova a sessão pelos cookies `ta_*`. Como todo
// mundo entra pela mesma tela de login, o /auth/login também precisa gravá-los
// quando o usuário pertence a um tenant — sem isso, o refresh do painel falhava
// sempre e a sessão caía a cada 15 min (o deslogamento em massa).
const TENANT_ACCESS_COOKIE = 'ta_access';
const TENANT_REFRESH_COOKIE = 'ta_refresh';

/** Deve espelhar o TTL real do refresh token em `auth.service.ts`. */
const ACCESS_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove o `refreshToken` antes de serializar a resposta.
 *
 * O refresh token é uma credencial de longa duração entregue em
 * cookie `httpOnly`. Devolvê-lo também no corpo JSON tornava o `httpOnly`
 * inútil: qualquer script injetado na página lia a resposta do XHR e obtinha
 * o token. O cookie é o único canal legítimo para o navegador.
 */
function stripRefreshToken<T extends Record<string, any>>(result: T): Omit<T, 'refreshToken'> {
  if (!result || typeof result !== 'object' || !('refreshToken' in result)) return result;
  const { refreshToken: _omit, ...safe } = result;
  return safe;
}

function setAuthCookies(res: Response, accessToken: string, refreshToken?: string, refreshMaxAgeMs: number = REFRESH_COOKIE_MAX_AGE_MS) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
  });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: refreshMaxAgeMs,
    });
  }
}

/** Espelha os cookies do painel do inquilino para quem tem tenant. */
function setTenantCookies(res: Response, accessToken: string, refreshToken?: string) {
  const opts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
  res.cookie(TENANT_ACCESS_COOKIE, accessToken, { ...opts, maxAge: ACCESS_COOKIE_MAX_AGE_MS });
  if (refreshToken) {
    res.cookie(TENANT_REFRESH_COOKIE, refreshToken, { ...opts, maxAge: REFRESH_COOKIE_MAX_AGE_MS });
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('login')
  async login(@Body() loginDto: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(loginDto);
    if ('mfaRequired' in result && result.mfaRequired) {
      // Sessão ainda não emitida: nada para gravar em cookie.
      return result;
    }
    if ('accessToken' in result && result.accessToken) {
      const rememberMe = (result as any).rememberMe === true;
      setAuthCookies(
        res,
        result.accessToken,
        (result as any).refreshToken,
        rememberMe ? REFRESH_COOKIE_MAX_AGE_MS : 14 * 24 * 60 * 60 * 1000,
      );
      // Quem tem tenant usa o painel /app, que renova por `ta_*`.
      if ((result as any)?.user?.tenantId) {
        setTenantCookies(res, result.accessToken, (result as any).refreshToken);
      }
    }
    // O refreshToken vai apenas no cookie httpOnly — nunca no corpo.
    // Antes ele era devolvido no JSON, o que anulava o httpOnly: um XSS podia
    // ler a resposta e exfiltrar uma sessão de 14 dias.
    return stripRefreshToken(result);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // O cookie é a fonte primária. O corpo continua aceito para clientes
    // não-browser (que não têm cookie), mas o valor nunca é devolvido.
    const token =
      (req as any).cookies?.[REFRESH_COOKIE] || body?.refreshToken || '';
    const result = await this.authService.refresh(token);
    if ('accessToken' in result && result.accessToken) {
      setAuthCookies(res, result.accessToken, (result as any).refreshToken);
    }
    // Exceção deliberada: se o chamador mandou o token pelo CORPO (cliente sem
    // cookie), precisa recebê-lo de volta — não há outro canal para ele.
    const cameFromCookie = Boolean((req as any).cookies?.[REFRESH_COOKIE]);
    return cameFromCookie ? stripRefreshToken(result) : result;
  }

  @Post('logout')
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    if (user?.id) await this.authService.logout(user.id);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  }

  @Post('2fa/setup')
  @AllowMfaPending()
  async setup2fa(@CurrentUser() user: any) { return this.authService.setup2fa(user.id); }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('2fa/verify')
  async verify2fa(
    @Body() body: { tempToken?: string; code?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.tempToken || !body?.code) {
      throw new BadRequestException('tempToken e code são obrigatórios');
    }
    const result = await this.authService.verifyTemp2fa(body.tempToken, body.code);
    if (result?.accessToken) {
      setAuthCookies(res, result.accessToken, (result as any).refreshToken);
      if ((result as any)?.user?.tenantId) {
        setTenantCookies(res, result.accessToken, (result as any).refreshToken);
      }
    }
    return stripRefreshToken(result);
  }

  @Post('2fa/recovery')
  @AllowMfaPending()
  async recovery2fa(
    @CurrentUser() user: any,
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.recovery2fa(user.id, code);
    if (result?.accessToken) {
      setAuthCookies(res, result.accessToken, (result as any).refreshToken);
      if ((result as any)?.user?.tenantId) {
        setTenantCookies(res, result.accessToken, (result as any).refreshToken);
      }
    }
    return stripRefreshToken(result);
  }

  @Get('me')
  async getMe(@CurrentUser() user: any) {
    if (!user) return null;
    // Whitelist em vez de blacklist: o user vem do JwtStrategy com TODAS as
    // colunas (inclui passwordHash e twoFactorSecret). Remover dois campos
    // específicos deixa qualquer coluna futura vazar automaticamente.
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug ?? null,
      is2faEnabled: user.is2faEnabled,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
