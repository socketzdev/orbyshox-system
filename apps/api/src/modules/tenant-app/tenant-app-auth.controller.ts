import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { TenantAppService } from './tenant-app.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const ACCESS_COOKIE = 'ta_access';
const REFRESH_COOKIE = 'ta_refresh';
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function stripRefreshToken<T extends Record<string, any>>(result: T) {
  if (!result || typeof result !== 'object') return result;
  return { ...result, refreshToken: null };
}

@Controller('tenant-app/auth')
export class TenantAppAuthController {
  constructor(private readonly tenantAppService: TenantAppService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() loginDto: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.tenantAppService.universalAppLogin(loginDto);
    res.cookie(ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/tenant-app',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
    return stripRefreshToken(result);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: any) {
    if (!user?.id && !user?.sub) {
      throw new UnauthorizedException('Sessão expirada');
    }
    const userId = user.id || user.sub;
    return this.tenantAppService.getUniversalMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('setup/complete')
  async completeSetup(
    @CurrentUser() user: any,
    @Body()
    body: {
      tradeName?: string;
      phone?: string;
      category?: string;
      tableCount?: number;
      tableCapacity?: number;
      tableCapacities?: number[];
      capacityDistribution?: any;
      enableQrCode?: boolean;
      enableTablet?: boolean;
      enableWaiterCall?: boolean;
    },
  ) {
    if (!user?.id && !user?.sub) {
      throw new UnauthorizedException('Sessão expirada');
    }
    const userId = user.id || user.sub;
    return this.tenantAppService.completeSetup(userId, body);
  }

  @Public()
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/tenant-app' });
    return { ok: true };
  }
}
