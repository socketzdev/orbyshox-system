import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
});
