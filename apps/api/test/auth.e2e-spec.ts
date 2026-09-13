import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';

const request = (supertest as any).default || supertest;

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const authServiceMock = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    setup2fa: jest.fn(),
    verify2fa: jest.fn(),
    recovery2fa: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should return 201 with access and refresh tokens on valid credentials', async () => {
      authServiceMock.login.mockResolvedValue({
        accessToken: 'valid-jwt-token',
        refreshToken: 'valid-refresh-token',
      });

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@projetosaas.com', password: 'password123' })
        .expect(201)
        .expect((res: any) => {
          expect(res.body.accessToken).toBe('valid-jwt-token');
          expect(res.body.refreshToken).toBe('valid-refresh-token');
        });
    });

    it('should return 201 with mfaRequired and tempToken when 2FA is needed', async () => {
      authServiceMock.login.mockResolvedValue({
        mfaRequired: true,
        tempToken: 'temp-mfa-token',
      });

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@projetosaas.com', password: 'password123' })
        .expect(201)
        .expect((res: any) => {
          expect(res.body.mfaRequired).toBe(true);
          expect(res.body.tempToken).toBe('temp-mfa-token');
        });
    });
  });

  describe('POST /auth/refresh', () => {
    it('should rotate and return refreshed tokens', async () => {
      authServiceMock.refresh.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      return request(app.getHttpServer())
        .post('/auth/refresh')
        .expect(201)
        .expect((res: any) => {
          expect(res.body.accessToken).toBe('new-access-token');
          expect(res.body.refreshToken).toBe('new-refresh-token');
        });
    });
  });
});
