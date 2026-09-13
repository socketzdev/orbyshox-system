import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { ClientSitesController } from '../src/modules/client-sites/client-sites.controller';
import { ClientSitesService } from '../src/modules/client-sites/client-sites.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

const request = (supertest as any).default || supertest;

describe('ClientSitesController (e2e)', () => {
  let app: INestApplication;
  const serviceMock = {
    getPublic: jest.fn(),
    getTemplates: jest.fn(),
    getForAdmin: jest.fn(),
    save: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientSitesController],
      providers: [{ provide: ClientSitesService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /client-sites/public/:slug returns the public payload without auth', async () => {
    serviceMock.getPublic.mockResolvedValue({ tenant: { id: 't-1' }, site: { slug: 'sabor-arte' } });

    await request(app.getHttpServer())
      .get('/client-sites/public/sabor-arte')
      .expect(200)
      .expect((res: any) => {
        expect(res.body.site.slug).toBe('sabor-arte');
      });
  });

  it('GET /client-sites/templates filters by niche', async () => {
    serviceMock.getTemplates.mockReturnValue([{ key: 'bistro' }]);

    await request(app.getHttpServer())
      .get('/client-sites/templates?niche=RESTAURANT')
      .expect(200)
      .expect((res: any) => {
        expect(serviceMock.getTemplates).toHaveBeenCalledWith('RESTAURANT');
        expect(res.body).toHaveLength(1);
      });
  });

  it('GET /client-sites/:tenantId forwards the authenticated user', async () => {
    serviceMock.getForAdmin.mockResolvedValue({ tenant: { id: 't-1' }, site: {} });

    await request(app.getHttpServer())
      .get('/client-sites/t-1')
      .expect(200)
      .expect((res: any) => {
        expect(serviceMock.getForAdmin).toHaveBeenCalledWith('t-1', undefined);
      });
  });

  it('PATCH /client-sites/:tenantId persists the configuration', async () => {
    serviceMock.save.mockResolvedValue({ tenant: { id: 't-1' }, site: { slug: 'sabor-arte' } });

    await request(app.getHttpServer())
      .patch('/client-sites/t-1')
      .send({ niche: 'RESTAURANT', slug: 'sabor-arte', templateKey: 'bistro' })
      .expect(200)
      .expect((res: any) => {
        expect(serviceMock.save).toHaveBeenCalledWith('t-1', expect.objectContaining({ slug: 'sabor-arte' }), undefined);
        expect(res.body.site.slug).toBe('sabor-arte');
      });
  });
});
