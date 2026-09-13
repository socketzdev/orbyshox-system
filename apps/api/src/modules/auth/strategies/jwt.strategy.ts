import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { resolveJwtSecret } from '../../../common/config/jwt-secret';

function extractFromCookieOrHeader(req: Request): string | null {
  const auth = req.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.substring(7);

  const cookies = (req as any)?.cookies || {};
  const isTenantApp = (req as any)?.originalUrl?.includes('/tenant-app') || (req as any)?.url?.includes('/tenant-app');

  if (isTenantApp) {
    if (cookies.ta_access) return cookies.ta_access;
    if (cookies.saas_access) return cookies.saas_access;
  }

  const cookieToken = cookies.saas_access || cookies.ta_access;
  if (cookieToken) return cookieToken;
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject('PRISMA') private prisma: PrismaClient,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractFromCookieOrHeader]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService, 'JwtStrategy'),
    });
  }
  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: { select: { slug: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return {
      ...user,
      sub: user.id,
      tenantSlug: payload.tenantSlug || user.tenant?.slug || null,
      isTwoFactorAuthenticated: payload.is2faAuthenticated,
    };
  }
}
