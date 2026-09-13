import { Test, TestingModule } from '@nestjs/testing';
import { AuditInterceptor } from './audit.interceptor';
import { of } from 'rxjs';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditServiceMock: any;
  let reflectorMock: any;

  beforeEach(() => {
    auditServiceMock = {
      createLog: jest.fn().mockResolvedValue({}),
    };
    reflectorMock = {
      get: jest.fn(),
    };
    interceptor = new AuditInterceptor(auditServiceMock, reflectorMock);
  });

  it('should bypass logging if route handler is not decorated with @AuditLog', (done) => {
    reflectorMock.get.mockReturnValue(null);

    const contextMock: any = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { id: 'u-1' }, method: 'POST', url: '/x' }),
      }),
    };
    const nextMock: any = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    };

    interceptor.intercept(contextMock, nextMock).subscribe(() => {
      expect(auditServiceMock.createLog).not.toHaveBeenCalled();
      done();
    });
  });

  it('should record audit log with normalized metadata', (done) => {
    reflectorMock.get.mockReturnValue({ action: 'TENANT_SUSPEND', targetType: 'Tenant' });

    const contextMock: any = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { id: 'admin-1' },
          method: 'POST',
          url: '/api/v1/tenants/t-123/suspend',
        }),
      }),
    };
    const nextMock: any = {
      handle: jest.fn().mockReturnValue(of({ status: 'SUSPENDED' })),
    };

    interceptor.intercept(contextMock, nextMock).subscribe(() => {
      expect(auditServiceMock.createLog).toHaveBeenCalled();
      const arg = auditServiceMock.createLog.mock.calls[0][0];
      expect(arg.action).toBe('TENANT_SUSPEND');
      expect(arg.targetType).toBe('Tenant');
      expect(arg.userId).toBe('admin-1');
      // metadata can be string or object — both are acceptable for storage
      const serialized =
        typeof arg.metadata === 'string' ? arg.metadata : JSON.stringify(arg.metadata);
      expect(serialized).toContain('POST');
      done();
    });
  });
});
