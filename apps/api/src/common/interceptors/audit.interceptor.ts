import { Injectable, NestInterceptor, ExecutionContext, CallHandler, SetMetadata } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import { Reflector } from '@nestjs/core';

export const AUDIT_LOG_KEY = 'audit_log';
export const AuditLog = (action: string, targetType: string) => SetMetadata(AUDIT_LOG_KEY, { action, targetType });

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService, private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditData = this.reflector.get<{action: string, targetType: string}>(AUDIT_LOG_KEY, context.getHandler());
    
    if (!auditData) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    return next.handle().pipe(
      tap(() => {
        if (user) {
          this.auditService.createLog({
            userId: user.id,
            action: auditData.action,
            targetType: auditData.targetType,
            metadata: { method: req.method, url: req.url },
            ipAddress: req.ip || req.connection?.remoteAddress,
          }).catch(console.error);
        }
      }),
    );
  }
}
