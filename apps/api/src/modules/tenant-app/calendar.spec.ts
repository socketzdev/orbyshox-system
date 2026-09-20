import { TenantAppService } from './tenant-app.service';

/**
 * Calendário da empresa: CRUD, expansão de recorrência (virtual, com teto),
 * exceção de ocorrência avulsa e ICS. Tarefas/agendamentos entram na leitura.
 */
describe('TenantAppService — calendar', () => {
  let service: TenantAppService;
  let prisma: any;

  const head = {
    id: 'ev-1',
    tenantId: 't1',
    title: 'Reunião',
    description: null,
    location: null,
    startsAt: new Date('2026-09-18T14:00:00'),
    endsAt: new Date('2026-09-18T15:00:00'),
    allDay: false,
    color: '#0E54F8',
    category: 'Compromisso',
    recurrence: JSON.stringify({ freq: 'WEEKLY', interval: 1 }),
    recurrenceExceptions: null,
    reminderMin: null,
    guests: null,
  };

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', slug: 'loja' }) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(async (args: any) => ({ id: 'new', ...args.data })),
        update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
        delete: jest.fn().mockResolvedValue({ id: 'x' }),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new TenantAppService(prisma, {} as any, {} as any, {} as any);
  });

  it('list: expande série semanal dentro da janela (sem vazar fora)', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([{ ...head }]);
    const res: any = await service.listCalendarEvents('loja', '2026-09-01', '2026-09-30');
    const occs = res.events.filter((e: any) => e.source === 'EVENT');
    expect(occs).toHaveLength(2); // 18/09 e 25/09
    expect(occs[0].id).toBe(`ev-1@${new Date('2026-09-18T14:00:00').toISOString()}`);
    expect(new Date(occs[1].startsAt).getDate()).toBe(25);
  });

  it('list: inclui tarefas e agendamentos como blocos somente-leitura', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 't1', title: 'Fechar caixa', dueDate: new Date('2026-09-20T00:00:00'), dueTime: null, status: 'PENDING', priority: 'HIGH' },
    ]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        serviceName: 'Corte',
        scheduledAt: new Date('2026-09-20T14:00:00'),
        durationMin: 40,
        status: 'CONFIRMED',
        customer: { name: 'Zé' },
      },
    ]);
    const res: any = await service.listCalendarEvents('loja', '2026-09-01', '2026-09-30');
    expect(res.events.find((e: any) => e.id === 'task-t1')?.readonly).toBe(true);
    const appt = res.events.find((e: any) => e.id === 'appt-a1');
    expect(appt?.readonly).toBe(true);
    expect(appt?.title).toContain('Corte');
    expect(new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()).toBe(40 * 60000);
  });

  it('create: valida título e normaliza janela invertida', async () => {
    await expect(service.createCalendarEvent('loja', { title: '  ' }, 'u1')).rejects.toThrow('título');
    await service.createCalendarEvent(
      'loja',
      { title: 'Visita', startsAt: '2026-09-20T15:00:00', endsAt: '2026-09-20T14:00:00', color: 'nope' },
      'u1',
    );
    const data = prisma.calendarEvent.create.mock.calls[0][0].data;
    expect(new Date(data.endsAt).getTime()).toBeGreaterThan(new Date(data.startsAt).getTime());
    expect(data.color).toBe('#0E54F8');
    expect(data.createdById).toBe('u1');
  });

  it('update single de série: congela ocorrência + exceção (série intacta)', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({ ...head });
    await service.updateCalendarEvent(
      'loja',
      'ev-1',
      { occurrenceIso: new Date('2026-09-25T14:00:00').toISOString(), title: 'Reunião adiada' },
      'single',
    );
    const updateArgs = prisma.calendarEvent.update.mock.calls[0][0];
    expect(JSON.parse(updateArgs.data.recurrenceExceptions)).toHaveLength(1);
    const created = prisma.calendarEvent.create.mock.calls[0][0].data;
    expect(created.recurrence).toBeNull();
    expect(created.parentId).toBe('ev-1');
    expect(created.title).toBe('Reunião adiada');
  });

  it('delete single de série: vira exceção (sem apagar a série)', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({ ...head });
    const res: any = await service.deleteCalendarEvent('loja', 'ev-1', 'single');
    expect(res.detached).toBe(true);
    expect(prisma.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it('delete series: apaga a cabeça', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({ ...head });
    await service.deleteCalendarEvent('loja', 'ev-1', 'series');
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'ev-1' } });
  });

  it('export ICS: cabeçalho + evento escapado', async () => {
    const start = new Date(Date.now() + 2 * 86400000);
    start.setHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60000);
    prisma.calendarEvent.findMany.mockResolvedValue([
      { ...head, recurrence: null, startsAt: start, endsAt: end, description: 'Linha1\nLinha2; com, escape' },
    ]);
    const res: any = await service.exportCalendarICS('loja');
    expect(res.filename).toContain('.ics');
    expect(res.content).toContain('BEGIN:VCALENDAR');
    expect(res.content).toContain('SUMMARY:Reunião');
    expect(res.content).toContain('Linha1\\nLinha2\\; com\\, escape');
    expect(res.content).toContain('END:VCALENDAR');
  });
});
