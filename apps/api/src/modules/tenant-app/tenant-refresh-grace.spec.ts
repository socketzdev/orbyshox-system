import * as argon2 from 'argon2';
import { TenantAppService } from './tenant-app.service';

/**
 * Refresh com slug: corrida legítima entre abas usa a janela de tolerância;
 * roubo de verdade continua derrubando a sessão.
 */
describe('TenantAppService — refreshSession (tolerância a corrida)', () => {
  let service: TenantAppService;
  let prisma: any;
  const secret = 'segredo-real-da-outra-aba';

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', slug: 'loja', status: 'ACTIVE' }),
      },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', isActive: true }),
      },
      refreshToken: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const jwt = { sign: jest.fn().mockReturnValue('novo-access') };
    service = new TenantAppService(prisma, jwt as any, { recordChangeSafe: jest.fn() } as any, {} as any);
  });

  const givenRevokedCandidate = async (revokedAt: Date | null, replacedBy: string | null) => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      tokenHash: await argon2.hash(secret),
      revokedAt,
      replacedByTokenId: replacedBy,
      expiresAt: new Date(Date.now() + 86400000),
      user: { id: 'u1', tenantId: 't1' },
    });
  };

  it('corrida benigna devolve access sem matar ninguém', async () => {
    await givenRevokedCandidate(new Date(Date.now() - 4000), 'r2');

    const res: any = await (service as any).refreshSession('loja', `r1.${secret}`);

    expect(res.accessToken).toBe('novo-access');
    expect(res.refreshToken).toBeUndefined();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('reuso tardio mata a família e exige login', async () => {
    await givenRevokedCandidate(new Date(Date.now() - 600000), 'r2');

    await expect((service as any).refreshSession('loja', `r1.${secret}`)).rejects.toThrow(
      /comprometida/i,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });
});
