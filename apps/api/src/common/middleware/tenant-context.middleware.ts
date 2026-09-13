import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { resolveJwtSecret } from '../config/jwt-secret';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      // Resolvido uma vez por requisição; em produção lança se o segredo faltar.
      const secret = resolveJwtSecret(this.config, 'TenantContextMiddleware');
      try {
        const decoded: any = jwt.verify(token, secret, { algorithms: ['HS256'] });
        if (decoded?.tenantId) this.cls.set('tenantId', decoded.tenantId);
        if (decoded?.sub) this.cls.set('userId', decoded.sub);
      } catch {
        // Token inválido/expirado aqui apenas significa "sem contexto populado".
        // O JwtAuthGuard é quem rejeita a requisição — este middleware não deve
        // derrubar rotas públicas que por acaso enviam um token velho.
      }
    }
    next();
  }
}
