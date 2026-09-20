import { ImpersonationInterceptor } from './impersonation.interceptor';
import { of } from 'rxjs';

function ctxWith(user: any, viewingSlug?: string): any {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user,
        headers: viewingSlug ? { 'x-viewing-slug': viewingSlug } : {},
      }),
    }),
  };
}

const nextMock: any = { handle: jest.fn().mockReturnValue(of({ ok: true })) };

describe('ImpersonationInterceptor', () => {
  it('troca o contexto para a empresa alvo quando SUPER_ADMIN + slug válido', async () => {
    const prismaMock: any = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-b', slug: 'empresa-b' }),
      },
    };
    const interceptor = new ImpersonationInterceptor(prismaMock);
    const user: any = { id: 'admin', role: 'SUPER_ADMIN', tenantId: 'tenant-a', companyId: 'tenant-a' };

    await interceptor.intercept(ctxWith(user, 'empresa-b'), nextMock);
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'empresa-b' },
      select: { id: true, slug: true },
    });
    expect(user.tenantId).toBe('tenant-b');
    expect(user.companyId).toBe('tenant-b');
    expect(user.tenantSlug).toBe('empresa-b');
  });

  it('não toca em nada sem o cabeçalho', async () => {
    const prismaMock: any = { tenant: { findUnique: jest.fn() } };
    const interceptor = new ImpersonationInterceptor(prismaMock);
    const user: any = { id: 'admin', role: 'SUPER_ADMIN', tenantId: 'tenant-a' };

    await interceptor.intercept(ctxWith(user), nextMock);
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
    expect(user.tenantId).toBe('tenant-a');
  });

  it('não troca o contexto de quem não é SUPER_ADMIN', async () => {
    const prismaMock: any = { tenant: { findUnique: jest.fn() } };
    const interceptor = new ImpersonationInterceptor(prismaMock);
    const user: any = { id: 'u1', role: 'CASHIER', tenantId: 'tenant-a' };

    await interceptor.intercept(ctxWith(user, 'empresa-b'), nextMock);
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
    expect(user.tenantId).toBe('tenant-a');
  });

  it('mantém o contexto original quando o slug não existe', async () => {
    const prismaMock: any = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const interceptor = new ImpersonationInterceptor(prismaMock);
    const user: any = { id: 'admin', role: 'SUPER_ADMIN', tenantId: 'tenant-a' };

    await interceptor.intercept(ctxWith(user, 'fantasma'), nextMock);
    expect(user.tenantId).toBe('tenant-a');
  });
});
