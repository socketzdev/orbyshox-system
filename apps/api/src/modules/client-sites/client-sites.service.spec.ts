import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientSitesService } from './client-sites.service';
import { DEFAULT_SITE_CONTENT_BY_NICHE } from '@projeto-saas/shared-types';

describe('ClientSitesService', () => {
  let service: ClientSitesService;
  let prismaMock: any;
  const superAdmin = { id: 'admin-1', role: 'SUPER_ADMIN' };
  const supporter = { id: 'support-1', role: 'SUPPORT_MANAGER' };

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      tenantSite: {
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientSitesService, { provide: 'PRISMA', useValue: prismaMock }],
    }).compile();

    service = module.get<ClientSitesService>(ClientSitesService);
  });

  describe('RBAC', () => {
    it('blocks non super admin from reading the configuration', async () => {
      await expect(service.getForAdmin('t-1', supporter)).rejects.toThrow(ForbiddenException);
    });

    it('blocks non super admin from saving changes', async () => {
      await expect(service.save('t-1', { niche: 'RESTAURANT', slug: 'loja' }, supporter)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTemplates', () => {
    it('lists every template when no niche is provided', async () => {
      const all = await service.getTemplates();
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all.find((template) => template.key === 'bistro')).toBeDefined();
    });

    it('filters templates that do not match the requested niche', async () => {
      const restaurantTemplates = await service.getTemplates('RESTAURANT');
      expect(restaurantTemplates.every((template) => (template.niches as readonly string[]).includes('RESTAURANT'))).toBe(true);
    });

    it('throws BadRequest when niche is invalid', async () => {
      await expect(service.getTemplates('PADARIA')).rejects.toThrow();
    });
  });

  describe('getForAdmin', () => {
    it('returns serialized site data with default theme for a tenant without a saved site', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        companyName: 'Sabor & Arte',
        tradeName: 'Sabor & Arte',
        niche: 'RESTAURANT',
        status: 'TRIAL',
        slug: null,
        site: null,
      });

      const result = await service.getForAdmin('t-1', superAdmin);

      expect(result.tenant.companyName).toBe('Sabor & Arte');
      expect(result.site.templateKey).toBe('bistro');
      expect(result.site.content.heroTitle).toBe(DEFAULT_SITE_CONTENT_BY_NICHE.RESTAURANT.heroTitle);
    });

    it('throws NotFound when the tenant does not exist', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('missing', superAdmin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('save', () => {
    const baseTenant = () => ({
      id: 't-1',
      companyName: 'Sabor & Arte',
      tradeName: 'Sabor & Arte',
      niche: 'RESTAURANT',
      status: 'ACTIVE',
      slug: null,
      site: null,
    });

    it('creates the site with the default template for the chosen niche and a normalized slug', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(baseTenant());
      prismaMock.tenant.findFirst.mockResolvedValue(null);
      prismaMock.tenant.update.mockImplementation(({ data }: any) => ({ ...baseTenant(), ...data }));
      prismaMock.tenantSite.upsert.mockImplementation(({ create, update }: any) => ({
        tenantId: create?.tenantId || update?.tenantId,
        ...create,
        ...update,
      }));

      const result = await service.save('t-1', { niche: 'BARBERSHOP', slug: 'Dom Corte 01' }, superAdmin);

      expect(result.site.slug).toBe('dom-corte-01');
      expect(result.site.templateKey).toBe('studio');
      expect(result.site.content.heroTitle).toBe(DEFAULT_SITE_CONTENT_BY_NICHE.BARBERSHOP.heroTitle);
      expect(prismaMock.tenant.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slug: 'dom-corte-01', niche: 'BARBERSHOP' }) }));
    });

    it('rejects duplicate slugs', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(baseTenant());
      prismaMock.tenant.findFirst.mockResolvedValue({ id: 't-2' });

      await expect(service.save('t-1', { niche: 'RESTAURANT', slug: 'minhaempresa' }, superAdmin)).rejects.toThrow(ConflictException);
    });

    it('rejects too-short slugs after normalization', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(baseTenant());
      await expect(service.save('t-1', { niche: 'RESTAURANT', slug: '!!' }, superAdmin)).rejects.toThrow();
    });

    it('rejects a platform route as a tenant slug', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(baseTenant());
      await expect(service.save('t-1', { niche: 'RESTAURANT', slug: 'dashboard' }, superAdmin)).rejects.toThrow();
    });
  });

  describe('getPublic', () => {
    it('returns 404 for unpublished sites', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        companyName: 'X',
        tradeName: 'X',
        niche: 'RESTAURANT',
        status: 'ACTIVE',
        slug: 'x',
        site: { isPublished: false },
      });
      await expect(service.getPublic('X')).rejects.toThrow(NotFoundException);
    });

    it('returns 404 for suspended tenants', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        companyName: 'X',
        tradeName: 'X',
        niche: 'RESTAURANT',
        status: 'SUSPENDED',
        slug: 'x',
        site: { isPublished: true },
      });
      await expect(service.getPublic('X')).rejects.toThrow(NotFoundException);
    });

    it('returns the public payload for an active tenant', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        companyName: 'Sabor & Arte',
        tradeName: 'Sabor & Arte',
        niche: 'RESTAURANT',
        status: 'ACTIVE',
        slug: 'sabor-arte',
        site: { templateKey: 'bistro', theme: { primary: '#e87932' }, content: { heroTitle: 'Customizado' }, isPublished: true },
      });

      const result = await service.getPublic('sabor-arte');
      expect(result.site.content.heroTitle).toBe('Customizado');
      expect(result.site.theme.primary).toBe('#e87932');
    });
  });
});
