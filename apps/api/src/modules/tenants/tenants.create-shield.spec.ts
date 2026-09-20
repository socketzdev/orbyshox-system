import { TenantsService } from './tenants.service';

/**
 * Blindagem do Super Admin na criação de empresa: o e-mail/telefone do
 * suporte nunca pode ser reaproveitado como admin da nova empresa — isso
 * convertia a conta do criador (tenantId/senha) e o derrubava da sessão.
 */
describe('TenantsService — create (blindagem Super Admin)', () => {
  let service: TenantsService;
  let prisma: any;

  const payload = {
    companyName: 'Loja Nova LTDA',
    niche: 'UNIVERSAL',
    adminName: 'Dono Novo',
    adminEmail: 'dono@novaloga.com',
    adminPassword: '12345678',
  };
  const actor = { id: 'super-1', role: 'SUPER_ADMIN' };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
      tenant: { findUnique: jest.fn(async () => null) },
    };
    service = new TenantsService(prisma, {} as any);
  });

  it('rejeita e-mail do Super Admin como admin da empresa', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'super-1', role: 'SUPER_ADMIN' });
    await expect(service.create({ ...payload }, actor)).rejects.toThrow('Super Administrador');
  });

  it('rejeita telefone do Super Admin como admin da empresa', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'super-1', role: 'SUPER_ADMIN' });
    await expect(
      service.create({ ...payload, phone: '(11) 99999-0001' }, actor),
    ).rejects.toThrow('Super Administrador');
  });
});
