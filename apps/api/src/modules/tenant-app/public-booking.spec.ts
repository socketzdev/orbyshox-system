import { TenantAppService } from './tenant-app.service';

/**
 * Agendamento online público: serviços do histórico, equipe sem dados
 * sensíveis e ocupação por dia (só horários, sem vazar cliente).
 */
describe('TenantAppService — public booking', () => {
  let service: TenantAppService;
  let prisma: any;

  const now = new Date();
  const at = (dayOffset: number, h: number, m: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, h, m, 0);
    return d;
  };
  const isoDay = (dayOffset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new TenantAppService(prisma, {} as any, {} as any, {} as any);
  });

  it('booking-data: cadastro oficial primeiro + equipe sem e-mail/telefone', async () => {
    prisma.service.findMany.mockResolvedValue([
      { id: 'r1', name: 'Corte', priceCents: 5000, durationMin: 40 },
    ]);
    prisma.appointment.findMany.mockResolvedValue([
      { serviceName: 'Corte', priceCents: 5000, durationMin: 40 },
      { serviceName: 'Corte', priceCents: 5000, durationMin: 40 },
      { serviceName: 'Barba', priceCents: 3000, durationMin: 30 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        name: 'Zé',
        email: 'ze@loja.com',
        position: 'Barbeiro',
        barberProfile: { nickname: null, specialty: 'Fade' },
      },
    ]);

    const res: any = await service.getPublicBookingData('loja');
    expect(res.services).toEqual([
      { id: 'r1', name: 'Corte', priceCents: 5000, durationMin: 40, bookings: 2, order: 0 },
      { id: 'hist-1', name: 'Barba', priceCents: 3000, durationMin: 30, bookings: 1, order: 1001 },
    ]);
    expect(res.barbers).toEqual([{ id: 'u1', name: 'Zé', role: 'Fade' }]);
    expect(JSON.stringify(res)).not.toContain('ze@loja.com');
  });

  it('booking-data: casa sem histórico volta vazio (sem inventar)', async () => {
    const res: any = await service.getPublicBookingData('loja');
    expect(res.services).toEqual([]);
    expect(res.barbers).toEqual([]);
  });

  it('availability: mapeia ocupados por dia sem dados do cliente', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { scheduledAt: at(0, 14, 15) },
      { scheduledAt: at(0, 15, 0) },
      { scheduledAt: at(2, 9, 0) },
    ]);

    const res: any = await service.getPublicAvailability('loja', 3);
    expect(res.days).toHaveLength(3);
    expect(res.days[0]).toEqual({ date: isoDay(0), busy: ['14:15', '15:00'] });
    expect(res.days[1]).toEqual({ date: isoDay(1), busy: [] });
    expect(res.days[2]).toEqual({ date: isoDay(2), busy: ['09:00'] });
    expect(JSON.stringify(res)).not.toContain('Corte');
  });

  it('availability: limita o período (máx 14 dias)', async () => {
    const res: any = await service.getPublicAvailability('loja', 99);
    expect(res.days).toHaveLength(14);
  });
});

describe('TenantAppService — services (catálogo da casa)', () => {
  let service: TenantAppService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      service: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (args: any) => ({ id: 's1', ...args.data })),
        findFirst: jest.fn(),
        update: jest.fn(async (args: any) => ({ id: 's1', ...args.data })),
        delete: jest.fn().mockResolvedValue({ id: 's1' }),
      },
    };
    service = new TenantAppService(prisma, {} as any, {} as any, {} as any);
  });

  it('listServices: filtra pelo tenant', async () => {
    await service.listServices('loja');
    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });

  it('createService: valida nome e normaliza valores', async () => {
    await expect(service.createService('loja', { name: '  ' })).rejects.toThrow('Informe o nome');
    const created: any = await service.createService('loja', {
      name: ' Corte ',
      priceCents: 5050.7,
      durationMin: 999,
    });
    expect(created.name).toBe('Corte');
    expect(created.priceCents).toBe(5051);
    expect(created.durationMin).toBe(480);
  });

  it('updateService: 404 fora do tenant', async () => {
    prisma.service.findFirst.mockResolvedValue(null);
    await expect(service.updateService('loja', 'x', { name: 'Y' })).rejects.toThrow('não encontrado');
  });

  it('deleteService: apaga com escopo', async () => {
    prisma.service.findFirst.mockResolvedValue({ id: 's1', tenantId: 't1' });
    await service.deleteService('loja', 's1');
    expect(prisma.service.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});
