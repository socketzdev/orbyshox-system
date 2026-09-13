import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { TenantsController } from '../src/modules/tenants/tenants.controller';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { ExportService } from '../src/common/services/export.service';

const request = (supertest as any).default || supertest;

describe('TenantsController (e2e)', () => {
  let app: INestApplication;
  const tenantsServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
    cancel: jest.fn(),
    extendTrial: jest.fn(),
    viewAs: jest.fn(),
    getNotes: jest.fn(),
    createNote: jest.fn(),
  };

  const exportServiceMock = {
    createCSVResponse: jest.fn().mockReturnValue({ stream: 'mock-stream' }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        { provide: TenantsService, useValue: tenantsServiceMock },
        { provide: ExportService, useValue: exportServiceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /tenants', () => {
    it('should return paginated list of tenants', async () => {
      tenantsServiceMock.findAll.mockResolvedValue({
        data: [{ id: 't-1', companyName: 'Barbearia Exemplo' }],
        meta: { total: 1, page: 1, limit: 10 },
      });

      return request(app.getHttpServer())
        .get('/tenants?niche=BARBERSHOP&status=ACTIVE')
        .expect(200)
        .expect((res: any) => {
          expect(res.body.data).toHaveLength(1);
          expect(res.body.data[0].companyName).toBe('Barbearia Exemplo');
          expect(res.body.meta.total).toBe(1);
        });
    });
  });

  describe('POST /tenants/:id/suspend', () => {
    it('should suspend tenant with administrative reason', async () => {
      tenantsServiceMock.suspend.mockResolvedValue({
        id: 't-1',
        status: 'SUSPENDED',
      });

      return request(app.getHttpServer())
        .post('/tenants/t-1/suspend')
        .send({ reason: 'Falta de pagamento por 10 dias' })
        .expect(201)
        .expect((res: any) => {
          expect(res.body.status).toBe('SUSPENDED');
          expect(tenantsServiceMock.suspend).toHaveBeenCalledWith('t-1', 'Falta de pagamento por 10 dias');
        });
    });
  });
});
