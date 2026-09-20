import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService contract', () => {
  let service: AuthService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      recoveryCode: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('dev-secret') },
        },
        { provide: 'PRISMA', useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns 401 when user is not found', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'x@y.com', password: 'pwd' })).rejects.toThrow();
  });

  describe('refresh com corrida entre abas (janela de tolerância)', () => {
    const secret = 'segredo-real-da-aba-2';

    const givenRevokedCandidate = async (revokedAt: Date | null, replacedBy: string | null) => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        tokenHash: await argon2.hash(secret),
        familyId: 'f1',
        revokedAt,
        replacedByTokenId: replacedBy,
        expiresAt: new Date(Date.now() + 86400000),
      });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true });
    };

    it('reuso benigno (rotacionado há 5s): devolve access sem matar a família', async () => {
      await givenRevokedCandidate(new Date(Date.now() - 5000), 'r2');

      const res = await service.refresh(`r1.${secret}`);

      expect(res.accessToken).toBe('mock-jwt');
      expect((res as any).refreshToken).toBeUndefined();
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it('reuso hostil (rotacionado há 10min): mata a família e exige login', async () => {
      await givenRevokedCandidate(new Date(Date.now() - 600000), 'r2');

      await expect(service.refresh(`r1.${secret}`)).rejects.toThrow(/comprometida/i);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ familyId: 'f1' }) }),
      );
    });

    it('reuso sem sucessor (pós-logout): mata e exige login', async () => {
      await givenRevokedCandidate(new Date(Date.now() - 5000), null);

      await expect(service.refresh(`r1.${secret}`)).rejects.toThrow();
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
