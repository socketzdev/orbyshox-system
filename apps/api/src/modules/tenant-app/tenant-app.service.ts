import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_STATUS } from '@projeto-saas/shared-types';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

/** Teto de quantidade por item (vide regra análoga no módulo de restaurante). */
const MAX_ITEM_QUANTITY = 9999;
import { isCreditSale, normalizePaymentMethod, normalizePaymentMethodOrOther, paymentMethodLabel } from
  './payment-method';
import {
  parseClosingPeriod,
  closingPeriodStart,
  nextRecurringDueDate,
  summarizeClosing,
  CLOSING_PERIOD_LABELS,
} from './day-closing.utils';
import { validatePurchasePayment, PURCHASE_PAYMENT_METHODS } from './purchase-payment.utils';
import { buildPixBrCode, normalizePixKey, validatePixKey } from './pix-brcode';
import { readLogoFromBranding, validateLogoDataUrl } from './branding-logo';
import { AuditService } from '../audit/audit.service';
import { Action, CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import { isBenignRotationReuse } from '../../common/guards/refresh-grace';
import { normalizeEmployeeTags } from '../../common/rbac/roles';
import {
  CreateEmployeeInput,
  NICHE_DEFAULT_CATEGORIES,
  NICHE_DEFAULT_PRODUCTS,
  UpdateEmployeeInput,
  UpsertBarberProfileInput,
  calculateBarberCommissions,
} from '@projeto-saas/shared-types';

const EMPLOYEE_SELECT_SAFE = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  position: true,
  tags: true,
  isActive: true,
  is2faEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const REFRESH_TTL_DAYS = 30;
const ACCESS_TTL = '7d';

@Injectable()
export class TenantAppService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly casl: CaslAbilityFactory,
  ) {}

  private async getTenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
      include: { site: true },
    });
    if (!tenant) throw new NotFoundException(`Empresa "${slug}" não encontrada`);
    if (tenant.status === TENANT_STATUS.SUSPENDED) {
      throw new UnauthorizedException('Esta empresa está suspensa. Entre em contato com o suporte.');
    }
    if (tenant.status === TENANT_STATUS.CANCELED) {
      throw new UnauthorizedException('Esta empresa foi cancelada.');
    }
    return tenant;
  }

  async getPublicInfo(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const [adminUser, company] = await Promise.all([
      this.prisma.user.findFirst({
        where: { tenantId: tenant.id, role: 'TENANT_ADMIN' },
        select: { email: true, phone: true },
      }),
      this.prisma.company.findFirst({
        where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
      }),
    ]);
    return {
      id: tenant.id,
      companyName: tenant.companyName,
      tradeName: tenant.tradeName,
      slug: tenant.slug,
      niche: tenant.niche,
      status: tenant.status,
      adminEmail: adminUser?.email || null,
      adminPhone: adminUser?.phone || null,
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
      site: tenant.site
        ? {
            templateKey: tenant.site.templateKey,
            theme: tenant.site.theme,
            content: tenant.site.content,
          }
        : null,
    };
  }

  async getPublicBookingData(slug: string) {
    const { tenantId } = await this.getEntityIds(slug);
    if (!tenantId) return { services: [], barbers: [] };

    const [tenant, company, registry, appointments, staff] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { niche: true },
      }),
      this.prisma.company.findFirst({
        where: { id: tenantId },
        select: { category: true },
      }),
      // Cadastro oficial da casa (o que o dono liberou p/ o online).
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.appointment.findMany({
        where: { tenantId, status: { notIn: ['CANCELLED', 'BLOCKED'] } },
        select: { serviceName: true, priceCents: true, durationMin: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          position: true,
          barberProfile: { select: { nickname: true, specialty: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Serviços = cadastro oficial + nomes do histórico (preço/duração = moda,
    // o valor mais cobrado). Chave normalizada p/ não duplicar ("Corte" = "corte").
    const byService = new Map<
      string,
      { display: string; count: number; prices: Map<number, number>; durations: Map<number, number> }
    >();
    for (const a of appointments) {
      const display = String(a.serviceName || '').trim();
      if (!display) continue;
      const key = display.toLowerCase();
      let e = byService.get(key);
      if (!e) {
        e = { display, count: 0, prices: new Map(), durations: new Map() };
        byService.set(key, e);
      }
      e.count += 1;
      const p = Math.round(Number(a.priceCents) || 0);
      e.prices.set(p, (e.prices.get(p) || 0) + 1);
      const d = Math.round(Number(a.durationMin) || 30);
      e.durations.set(d, (e.durations.get(d) || 0) + 1);
    }
    const modeOf = (m: Map<number, number>) => {
      let best = 0;
      let bestN = -1;
      for (const [v, n] of m) {
        if (n > bestN) {
          bestN = n;
          best = v;
        }
      }
      return best;
    };
    const services = registry.map((s: any, i: number) => ({
      id: s.id,
      name: s.name,
      priceCents: Number(s.priceCents) || 0,
      durationMin: Number(s.durationMin) || 30,
      bookings: byService.get(String(s.name || '').trim().toLowerCase())?.count || 0,
      order: i,
    }));

    // Nomes que aparecem no histórico mas não estão no cadastro entram no
    // fim (compatibilidade com casas que ainda não cadastraram).
    const known = new Set(services.map((s) => String(s.name).trim().toLowerCase()));
    for (const [key, e] of byService.entries()) {
      if (known.has(key)) continue;
      services.push({
        id: `hist-${services.length}`,
        name: e.display,
        priceCents: modeOf(e.prices),
        durationMin: modeOf(e.durations),
        bookings: e.count,
        order: 1000 + services.length,
      });
    }
    services.sort((a, b) => a.order - b.order || b.bookings - a.bookings);

    // Equipe: só nome e especialidade (nada sensível sai no público).
    const barbers = staff.map((u: any) => ({
      id: u.id,
      name: u.barberProfile?.nickname || u.name,
      role: u.barberProfile?.specialty || u.position || 'Profissional',
    }));

    return {
      services,
      barbers,
      business: { niche: tenant?.niche || null, category: company?.category || null },
    };
  }

  /**
   * Ocupação pública p/ o link online (`/:slug/agendar`): próximos 7 dias com
   * os horários ocupados (HH:MM). Não vaza nome, telefone, valor nem nada do
   * cliente — só o que está livre/ocupado, igual a grade da Agenda.
   */
  async getPublicAvailability(slug: string, days = 7) {
    const { tenantId } = await this.getEntityIds(slug);
    const total = Math.min(14, Math.max(1, Number(days) || 7));
    if (!tenantId) {
      return { days: [] as { date: string; busy: string[] }[] };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + total);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: { notIn: ['CANCELLED'] },
        scheduledAt: { gte: start, lt: end },
      },
      select: { scheduledAt: true },
    });

    const busyByDay = new Map<string, Set<string>>();
    for (const a of appointments) {
      const d = new Date(a.scheduledAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (!busyByDay.has(key)) busyByDay.set(key, new Set());
      busyByDay.get(key)!.add(hhmm);
    }

    const out: { date: string; busy: string[] }[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ date: key, busy: [...(busyByDay.get(key) || [])].sort() });
    }
    return { days: out };
  }

  // ─── Calendário da empresa (visão Google Calendar) ─────────────────────
  // Eventos próprios + tarefas com vencimento + agendamentos entram juntos na
  // leitura; ocorrências de recorrência são virtuais (expandidas aqui).

  async listCalendarEvents(slug: string, fromRaw?: unknown, toRaw?: unknown) {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    const from = fromRaw ? new Date(String(fromRaw)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toRaw
      ? new Date(String(toRaw))
      : new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
    const fromSafe = Number.isNaN(from.getTime()) ? new Date(now.getFullYear(), now.getMonth(), 1) : from;
    const toSafe = Number.isNaN(to.getTime()) ? new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59) : to;

    const [events, tasks, appointments] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          tenantId: tenant.id,
          OR: [{ startsAt: { lte: toSafe } }, { recurrence: { not: null } }],
        },
        orderBy: { startsAt: 'asc' },
        take: 500,
      }),
      this.prisma.task.findMany({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
          dueDate: { gte: fromSafe, lte: toSafe },
          status: { notIn: ['COMPLETED', 'CANCELED'] },
        },
        select: { id: true, title: true, dueDate: true, dueTime: true, status: true, priority: true },
        orderBy: { dueDate: 'asc' },
        take: 200,
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId: tenant.id,
          status: { notIn: ['CANCELLED', 'BLOCKED'] },
          scheduledAt: { gte: fromSafe, lte: toSafe },
        },
        select: {
          id: true,
          serviceName: true,
          scheduledAt: true,
          durationMin: true,
          status: true,
          customer: { select: { name: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 200,
      }),
    ]);

    const out: any[] = [];
    for (const e of events) {
      const rule = parseCalendarRecurrence((e as any).recurrence);
      if (!rule) {
        if ((e as any).endsAt >= fromSafe && (e as any).startsAt <= toSafe) {
          out.push(shapeCalendarEvent(e, null));
        }
        continue;
      }
      for (const occ of expandCalendarRecurrence(e, rule, fromSafe, toSafe)) {
        out.push(occ);
      }
    }
    for (const t of tasks as any[]) {
      out.push({
        id: `task-${t.id}`,
        source: 'TASK',
        readonly: true,
        title: t.title,
        startsAt: t.dueDate,
        endsAt: t.dueDate,
        allDay: true,
        color: '#F59E0B',
        category: 'Tarefa',
        status: t.status,
      });
    }
    for (const a of appointments as any[]) {
      const start = new Date(a.scheduledAt);
      const end = new Date(start.getTime() + (Number(a.durationMin) || 30) * 60000);
      out.push({
        id: `appt-${a.id}`,
        source: 'APPOINTMENT',
        readonly: true,
        title: `${a.serviceName || 'Atendimento'} — ${a.customer?.name || ''}`.trim(),
        startsAt: start,
        endsAt: end,
        allDay: false,
        color: '#10B981',
        category: 'Agendamento',
        status: a.status,
      });
    }
    out.sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
    return { events: out };
  }

  async createCalendarEvent(slug: string, data: any, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const title = String(data?.title || '').trim();
    if (!title) throw new BadRequestException('Informe o título do evento');
    const { startsAt, endsAt, allDay } = normalizeCalendarRange(data);
    const recurrence = normalizeCalendarRecurrence(data?.recurrence);
    return this.prisma.calendarEvent.create({
      data: {
        tenantId: tenant.id,
        title: title.slice(0, 120),
        description: data?.description ? String(data.description).slice(0, 500) : null,
        location: data?.location ? String(data.location).slice(0, 120) : null,
        startsAt,
        endsAt,
        allDay,
        color: sanitizeCalendarColor(data?.color),
        category: String(data?.category || 'Compromisso').slice(0, 40),
        recurrence: recurrence ? JSON.stringify(recurrence) : null,
        reminderMin: data?.reminderMin !== undefined ? Math.max(0, Math.round(Number(data.reminderMin) || 0)) : null,
        guests: Array.isArray(data?.guests)
          ? JSON.stringify(
              data.guests.slice(0, 20).map((g: any) => ({
                name: String(g?.name || '').slice(0, 60),
                status: ['ACCEPTED', 'DECLINED'].includes(g?.status) ? g.status : 'PENDING',
              })),
            )
          : null,
        createdById: operatorId || null,
      },
    });
  }

  async updateCalendarEvent(
    slug: string,
    id: string,
    data: any,
    mode: 'single' | 'series' = 'single',
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const existing: any = await this.prisma.calendarEvent.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Evento não encontrado');

    // "Somente este": congela a ocorrência como evento avulso.
    if (mode === 'single' && existing.recurrence) {
      const occurrenceIso = String(data?.occurrenceIso || existing.startsAt);
      const exceptions = readCalendarExceptions(existing.recurrenceExceptions);
      if (!exceptions.includes(occurrenceIso)) exceptions.push(occurrenceIso);
      await this.prisma.calendarEvent.update({
        where: { id },
        data: { recurrenceExceptions: JSON.stringify(exceptions) },
      });
      const { startsAt, endsAt, allDay } = normalizeCalendarRange(
        { ...existing, ...data, startsAt: data?.startsAt || occurrenceIso },
        occurrenceIso,
      );
      return this.prisma.calendarEvent.create({
        data: {
          tenantId: tenant.id,
          title: String(data?.title ?? existing.title).slice(0, 120),
          description: data?.description !== undefined ? data.description : existing.description,
          location: data?.location !== undefined ? data.location : existing.location,
          startsAt,
          endsAt,
          allDay,
          color: data?.color ? sanitizeCalendarColor(data.color) : existing.color,
          category: data?.category ? String(data.category).slice(0, 40) : existing.category,
          recurrence: null,
          parentId: existing.id,
          reminderMin: data?.reminderMin !== undefined ? Math.max(0, Math.round(Number(data.reminderMin) || 0)) : existing.reminderMin,
          guests: data?.guests !== undefined ? existing.guests : existing.guests,
          createdById: existing.createdById,
        },
      });
    }

    const patch: any = {};
    if (data?.title !== undefined) {
      const title = String(data.title || '').trim();
      if (!title) throw new BadRequestException('Informe o título do evento');
      patch.title = title.slice(0, 120);
    }
    if (data?.description !== undefined) patch.description = data.description ? String(data.description).slice(0, 500) : null;
    if (data?.location !== undefined) patch.location = data.location ? String(data.location).slice(0, 120) : null;
    if (data?.startsAt !== undefined || data?.endsAt !== undefined || data?.allDay !== undefined) {
      const { startsAt, endsAt, allDay } = normalizeCalendarRange({ ...existing, ...data });
      patch.startsAt = startsAt;
      patch.endsAt = endsAt;
      patch.allDay = allDay;
    }
    if (data?.color !== undefined) patch.color = sanitizeCalendarColor(data.color);
    if (data?.category !== undefined) patch.category = String(data.category || 'Compromisso').slice(0, 40);
    if (data?.recurrence !== undefined) {
      const recurrence = normalizeCalendarRecurrence(data.recurrence);
      patch.recurrence = recurrence ? JSON.stringify(recurrence) : null;
    }
    if (data?.reminderMin !== undefined) {
      patch.reminderMin = data.reminderMin === null ? null : Math.max(0, Math.round(Number(data.reminderMin) || 0));
    }
    if (data?.guests !== undefined) {
      patch.guests = Array.isArray(data.guests)
        ? JSON.stringify(
            data.guests.slice(0, 20).map((g: any) => ({
              name: String(g?.name || '').slice(0, 60),
              status: ['ACCEPTED', 'DECLINED'].includes(g?.status) ? g.status : 'PENDING',
            })),
          )
        : null;
    }
    return this.prisma.calendarEvent.update({ where: { id }, data: patch });
  }

  async deleteCalendarEvent(slug: string, id: string, mode: 'single' | 'series' = 'single') {
    const tenant = await this.getTenantBySlug(slug);
    const existing: any = await this.prisma.calendarEvent.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Evento não encontrado');

    // "Somente este" de série: vira exceção (a ocorrência some, a série fica).
    if (mode === 'single' && existing.recurrence) {
      const exceptions = readCalendarExceptions(existing.recurrenceExceptions);
      const occurrenceIso = new Date(existing.startsAt).toISOString();
      if (!exceptions.includes(occurrenceIso)) exceptions.push(occurrenceIso);
      await this.prisma.calendarEvent.update({
        where: { id },
        data: { recurrenceExceptions: JSON.stringify(exceptions) },
      });
      return { success: true, detached: true };
    }
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { success: true };
  }

  async exportCalendarICS(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth() + 12, now.getDate());
    const { events } = await this.listCalendarEvents(slug, now, to);
    const escapeICS = (s: string) =>
      String(s || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
    const fmtICS = (d: any) => {
      const dt = new Date(d);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`;
    };
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Orbyshox//Calendar//PT-BR',
      'CALSCALE:GREGORIAN',
    ];
    for (const e of events.filter((x: any) => x.source === 'EVENT')) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${e.id}@orbyshox`,
        `DTSTAMP:${fmtICS(new Date())}`,
        `DTSTART:${fmtICS(e.startsAt)}`,
        `DTEND:${fmtICS(e.endsAt)}`,
        `SUMMARY:${escapeICS(e.title)}`,
      );
      if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
      if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return { filename: `calendario-${tenant.slug}.ics`, content: lines.join('\r\n') };
  }

  async login(slug: string, loginDto: { email: string; password: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const raw = (loginDto.email || '').trim();
    const cleanPhone = raw.replace(/\D/g, '');
    const withoutCountryCode = cleanPhone.startsWith('55') && cleanPhone.length > 10 ? cleanPhone.slice(2) : cleanPhone;

    const user = await this.prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { tenantId: tenant.id },
              { role: 'SUPER_ADMIN' },
            ],
          },
          {
            OR: [
              { email: raw.toLowerCase() },
              { phone: raw },
              cleanPhone ? { phone: cleanPhone } : undefined,
              cleanPhone ? { phone: `+${cleanPhone}` } : undefined,
              cleanPhone ? { phone: `+55${withoutCountryCode}` } : undefined,
              withoutCountryCode ? { phone: withoutCountryCode } : undefined,
              withoutCountryCode ? { email: `${withoutCountryCode}@projetosaas.com` } : undefined,
            ].filter(Boolean) as any,
          },
        ],
      },
      // Sem `select`, a linha inteira do User vinha do banco (incluindo
      // passwordHash e twoFactorSecret) e trafegava pelo escopo do serviço.
      select: { id: true, email: true, name: true, phone: true, role: true, position: true, tags: true, isActive: true, passwordHash: true },
    });

    // Mensagem única para conta inexistente E para credenciais inválidas:
    // distinguir os casos permitia enumerar quais contas existem.
    const invalidCredentials = new UnauthorizedException('Credenciais inválidas');

    if (!user) throw invalidCredentials;

    // A verificação da senha roda ANTES da checagem de `isActive` para que o
    // tempo de resposta não revele se a conta existe mas está desativada.
    // Argon2 é caro; sem isso, um atacante distingue os dois estados pelo tempo.
    const isValidPassword = await argon2.verify(user.passwordHash, loginDto.password || '');
    if (!isValidPassword) throw invalidCredentials;

    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada. Procure o administrador da sua empresa.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
        phone: user.phone,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
      { expiresIn: ACCESS_TTL },
    );

    const refreshToken = await this.issueRefreshToken(user.id, `tenant-${tenant.id}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
      },
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        slug: tenant.slug,
        niche: tenant.niche,
      },
    };
  }

  /**
   * Permissões do usuário resolvidas no SERVIDOR, em sinais simples, para a
   * interface esconder o que o papel não pode fazer.
   *
   * Antes a tela exibia botões que o backend recusava com 403 — o usuário
   * clicava e só então descobria. Enviar os sinais prontos evita duplicar a
   * matriz no front: duplicar significaria as duas pontas divergirem com o
   * tempo. A fonte da verdade continua sendo o `CaslAbilityFactory`.
   *
   * Os nomes são intencionalmente explícitos (`canDeleteStockBatch`) em vez de
   * uma lista genérica de regras: o front só precisa de "posso mostrar este
   * botão?", e um booleano nomeado é impossível de interpretar errado.
   */
  private buildAbilities(user: { id?: string; role?: string | null; tags?: string | string[] | null }) {
    const ability = this.casl.createForUser(user);
    return {
      // Financeiro
      canReadFinance: ability.can(Action.Read, 'Finance'),
      canReadBillsPayable: ability.can(Action.Read, 'BillPayable'),
      canReadBillsReceivable: ability.can(Action.Read, 'BillReceivable'),
      canUpdateBillsPayable: ability.can(Action.Update, 'BillPayable'),
      canDeleteBillPayable: ability.can(Action.Delete, 'BillPayable'),
      canDeleteBillReceivable: ability.can(Action.Delete, 'BillReceivable'),
      // Equipe
      canReadEmployees: ability.can(Action.Read, 'Employee'),
      canManageEmployees: ability.can(Action.Manage, 'Employee'),
      // Estoque e lotes
      canReadStockBatch: ability.can(Action.Read, 'StockBatch'),
      canUpdateStockBatch: ability.can(Action.Update, 'StockBatch'),
      canDeleteStockBatch: ability.can(Action.Delete, 'StockBatch'),
      canReadStockMovement: ability.can(Action.Read, 'StockMovement'),
      canReadCashRegister: ability.can(Action.Read, 'CashRegister'),
      // Compras e fiscal
      canReadSupplier: ability.can(Action.Read, 'Supplier'),
      canUpdateSupplier: ability.can(Action.Update, 'Supplier'),
      canDeleteSupplier: ability.can(Action.Delete, 'Supplier'),
      canReadNfe: ability.can(Action.Read, 'Nfe'),
      canCreateNfe: ability.can(Action.Create, 'Nfe'),
      canFinalizeNfe: ability.can(Action.Finalize, 'Nfe'),
      // Configurações e operação
      canReadStoreSettings: ability.can(Action.Read, 'StoreSettings'),
      canUpdateStoreSettings: ability.can(Action.Update, 'StoreSettings'),
      canApproveOrder: ability.can(Action.Approve, 'Order'),
      canManageTable: ability.can(Action.Manage, 'Table'),
      canDeleteTable: ability.can(Action.Delete, 'Table'),
      // Caixinha dos 10% (dono/gerente): mesma trava do backend (Approve Order).
      canManageTips: ability.can(Action.Approve, 'Order'),
      // Módulos (menu dinâmico + bloqueio de rota no front; o backend decide
      // de verdade via PoliciesGuard — aqui é só o sinal pronto).
      canViewTables: ability.can(Action.Read, 'Table') || ability.can(Action.Read, 'TableSession'),
      canViewKds: ability.can(Action.Read, 'Order'),
      canViewPos: ability.can(Action.Create, 'Order'),
      canViewPurchaseNotes: ability.can(Action.Read, 'PurchaseNote'),
      canViewTasks: ability.can(Action.Read, 'Task'),
      canViewReports: ability.can(Action.Read, 'Report'),
      canViewFinance:
        ability.can(Action.Read, 'Finance') || ability.can(Action.Read, 'BillPayable'),
      canViewTeam: ability.can(Action.Manage, 'Employee'),
      canViewSettings: ability.can(Action.Read, 'StoreSettings'),
    };
  }

  async getCurrentUser(slug: string, userId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        OR: [
          { tenantId: tenant.id },
          { role: 'SUPER_ADMIN' },
        ],
      },
      select: { id: true, email: true, name: true, phone: true, role: true, position: true, tags: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: tenant.id },
    });

    return {
      // Permissões resolvidas no servidor — ver `buildAbilities`.
      abilities: this.buildAbilities(user),
      user,
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        slug: tenant.slug,
        niche: tenant.niche,
        status: tenant.status,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
    };
  }

  /**
   * Conclui o Assistente de Primeiro Acesso (Onboarding Wizard):
   * Grava setupCompleted: true, atualiza preferências e gera as mesas do salão.
   */
  async completeSetup(
    userId: string,
    dto: {
      tradeName?: string;
      phone?: string;
      category?: string;
      tableCount?: number;
      tableCapacity?: number;
      tableCapacities?: number[];
      capacityDistribution?: any;
      enableQrCode?: boolean;
      enableTablet?: boolean;
      enableWaiterCall?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário inválido ou inativo');
    }

    const companyId = user.companyId || user.tenantId;
    if (!companyId) {
      throw new BadRequestException('Usuário não vinculado a uma empresa');
    }

    // 1. Atualizar Company (Branding, Nome, Categoria)
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
    });

    let currentBranding: any = {};
    if (company?.branding) {
      try {
        currentBranding = JSON.parse(company.branding);
      } catch {
        currentBranding = {};
      }
    }

    const updatedBranding = {
      ...currentBranding,
      setupCompleted: true,
      setupCompletedAt: new Date().toISOString(),
      enableQrCode: dto.enableQrCode ?? true,
      enableTablet: dto.enableTablet ?? true,
      enableWaiterCall: dto.enableWaiterCall ?? true,
      tableCapacity: dto.tableCapacity || 4,
      tableCapacities: dto.tableCapacities || undefined,
      capacityDistribution: dto.capacityDistribution || undefined,
      configuredTableCount: dto.tableCount || 0,
    };

    if (company) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: {
          branding: JSON.stringify(updatedBranding),
          ...(dto.tradeName ? { name: dto.tradeName } : {}),
          ...(dto.category ? { category: dto.category } : {}),
        },
      });
    }

    // 2. Atualizar StoreSetting se existir
    if (user.tenantId) {
      const storeSetting = await this.prisma.storeSetting.findUnique({
        where: { tenantId: user.tenantId },
      });
      if (storeSetting) {
        await this.prisma.storeSetting.update({
          where: { tenantId: user.tenantId },
          data: {
            ...(dto.tradeName ? { storeName: dto.tradeName } : {}),
            ...(dto.phone ? { phone: dto.phone } : {}),
          },
        });
      }
    }

    // 3. Criar mesas em lote se tableCount > 0
    let createdTables: any[] = [];
    if (dto.tableCount && dto.tableCount > 0) {
      const count = Math.min(Math.max(1, dto.tableCount), 100);
      const defaultCapacity = Math.max(1, dto.tableCapacity || 4);
      const capacitiesArray = Array.isArray(dto.tableCapacities) && dto.tableCapacities.length > 0
        ? dto.tableCapacities
        : null;

      for (let i = 1; i <= count; i++) {
        const capacity = capacitiesArray && capacitiesArray[i - 1]
          ? Math.max(1, Number(capacitiesArray[i - 1]))
          : defaultCapacity;

        const rawToken = crypto.randomBytes(24).toString('hex');
        const qrTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const label = `Mesa ${String(i).padStart(2, '0')}`;

        const table = await this.prisma.table.upsert({
          where: { companyId_number: { companyId, number: i } },
          create: {
            companyId,
            number: i,
            label,
            capacity,
            status: 'FREE',
            qrTokenHash,
          },
          update: {
            label,
            capacity,
          },
        });

        createdTables.push({
          id: table.id,
          number: table.number,
          label: table.label,
          qrToken: rawToken,
        });
      }
    }

    return {
      success: true,
      message: 'Configuração inicial concluída com sucesso!',
      setupCompleted: true,
      tablesCount: createdTables.length,
      tables: createdTables,
    };
  }

  async universalAppLogin(loginDto: { email: string; password: string }) {
    const raw = (loginDto.email || '').trim();
    const cleanPhone = raw.replace(/\D/g, '');
    const withoutCountryCode = cleanPhone.startsWith('55') && cleanPhone.length > 10 ? cleanPhone.slice(2) : cleanPhone;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: raw.toLowerCase() },
          { phone: raw },
          cleanPhone ? { phone: cleanPhone } : undefined,
          cleanPhone ? { phone: `+${cleanPhone}` } : undefined,
          cleanPhone ? { phone: `+55${withoutCountryCode}` } : undefined,
          withoutCountryCode ? { phone: withoutCountryCode } : undefined,
          withoutCountryCode ? { email: `${withoutCountryCode}@projetosaas.com` } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        position: true,
        isActive: true,
        passwordHash: true,
        tenantId: true,
        companyId: true,
      },
    });

    const invalidCredentials = new UnauthorizedException('Credenciais inválidas');
    if (!user) throw invalidCredentials;

    const isValidPassword = await argon2.verify(user.passwordHash, loginDto.password || '');
    if (!isValidPassword) throw invalidCredentials;

    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada. Procure o administrador.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    let tenant: any = null;
    if (user.tenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
    }

    const companyIdToFind = user.companyId || user.tenantId;
    let company: any = null;
    if (companyIdToFind) {
      company = await this.prisma.company.findFirst({
        where: { id: companyIdToFind },
      });
    }

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
        phone: user.phone,
        tenantId: tenant?.id || null,
        tenantSlug: tenant?.slug || null,
        companyId: company?.id || tenant?.id || null,
      },
      { expiresIn: ACCESS_TTL },
    );

    const refreshToken = await this.issueRefreshToken(user.id, `app-${user.id}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
      },
      tenant: tenant
        ? {
            id: tenant.id,
            companyName: tenant.companyName,
            tradeName: tenant.tradeName,
            slug: tenant.slug,
            niche: tenant.niche,
            status: tenant.status,
          }
        : company
        ? {
            id: company.id,
            companyName: company.name,
            tradeName: company.name,
            slug: company.slug || company.id,
            niche: (company.category as any) || 'RESTAURANT',
            status: 'ACTIVE',
          }
        : null,
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
    };
  }

  async getUniversalMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        position: true,
        tags: true,
        isActive: true,
        tenantId: true,
        companyId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    let tenant: any = null;
    if (user.tenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
    }

    const companyIdToFind = user.companyId || user.tenantId;
    let company: any = null;
    if (companyIdToFind) {
      company = await this.prisma.company.findFirst({
        where: { id: companyIdToFind },
      });
    }

    return {
      // Mesmos sinais do `getCurrentUser`, para a interface esconder botões
      // que o backend recusaria com 403.
      abilities: this.buildAbilities(user),
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
      },
      tenant: tenant
        ? {
            id: tenant.id,
            companyName: tenant.companyName,
            tradeName: tenant.tradeName,
            slug: tenant.slug,
            niche: tenant.niche,
            status: tenant.status,
          }
        : company
        ? {
            id: company.id,
            companyName: company.name,
            tradeName: company.name,
            slug: company.slug || company.id,
            niche: (company.category as any) || 'RESTAURANT',
            status: 'ACTIVE',
          }
        : null,
      company: company
        ? {
            id: company.id,
            name: company.name,
            category: company.category,
            branding: JSON.parse(company.branding || '{}'),
          }
        : null,
    };
  }

  /**
   * Emite um refresh token no formato `<refreshId>.<segredo>`.
   *
   * Antes o token era só um segredo opaco, e o refresh precisava varrer a
   * tabela e rodar `argon2.verify` em cada linha até achar (ou desistir).
   * Argon2 é caro por design — 25 hashes por requisição derrubam a CPU sob
   * concorrência moderada. Prefixar com o id transforma a busca em consulta
   * por chave primária: uma única verificação de hash por refresh.
   */
  private async issueRefreshToken(userId: string, familyId: string, ttlDays = REFRESH_TTL_DAYS) {
    const secret = crypto.randomBytes(48).toString('hex');
    const tokenHash = await argon2.hash(secret);
    const id = crypto.randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash,
        familyId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return `${id}.${secret}`;
  }

  async logoutSession(slug: string, refreshToken?: string) {
    if (!refreshToken) return;
    const [refreshId] = refreshToken.split('.');
    if (!refreshId) return;

    const tenant = await this.getTenantBySlug(slug).catch(() => null);
    if (!tenant) return;

    // Revoga apenas o token apresentado, e sempre dentro do tenant informado —
    // um slug diferente não pode derrubar a sessão de outro inquilino.
    await this.prisma.refreshToken.updateMany({
      where: {
        id: refreshId,
        revokedAt: null,
        user: { tenantId: tenant.id },
      },
      data: { revokedAt: new Date() },
    });
  }

  async logoutUniversalSession(refreshToken?: string) {
    if (!refreshToken) return;
    const [refreshId] = refreshToken.split('.');
    if (!refreshId) return;

    await this.prisma.refreshToken.updateMany({
      where: {
        id: refreshId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async refreshUniversalSession(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token ausente.');

    const [refreshId, secret] = refreshToken.split('.');
    if (!refreshId || !secret) throw new UnauthorizedException('Refresh token inválido.');

    const candidate = await this.prisma.refreshToken.findUnique({
      where: { id: refreshId },
      include: {
        user: {
          include: {
            tenant: { include: { site: true } },
          },
        },
      },
    });

    if (!candidate || !candidate.user) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    let hashMatches = false;
    try {
      hashMatches = await argon2.verify(candidate.tokenHash, secret);
    } catch {
      hashMatches = false;
    }
    if (!hashMatches) throw new UnauthorizedException('Refresh token inválido.');

    if (candidate.revokedAt) {
      // Mesma tolerância do refresh com slug: corrida legítima ganha um access
      // novo; roubo de verdade continua derrubando a família.
      if (isBenignRotationReuse(candidate.revokedAt, (candidate as any).replacedByTokenId)) {
        const graceUser: any = candidate.user;
        if (!graceUser || !graceUser.isActive) throw new UnauthorizedException('Sessão inválida.');
        const graceTenant = graceUser.tenant;
        if (
          graceTenant &&
          (graceTenant.status === TENANT_STATUS.SUSPENDED || graceTenant.status === TENANT_STATUS.CANCELED)
        ) {
          throw new UnauthorizedException('Conta da empresa inativa. Verifique a situação do plano.');
        }
        const graceAccess = this.jwtService.sign(
          {
            sub: graceUser.id,
            email: graceUser.email,
            name: graceUser.name,
            role: graceUser.role,
            position: graceUser.position,
            tags: (graceUser as any).tags ?? '[]',
            phone: graceUser.phone,
            tenantId: graceTenant?.id || null,
            tenantSlug: graceTenant?.slug || null,
            companyId: graceTenant?.id || (graceUser as any).companyId || null,
          },
          { expiresIn: ACCESS_TTL },
        );
        return { accessToken: graceAccess };
      }
      await this.prisma.refreshToken.updateMany({
        where: { userId: candidate.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão comprometida. Faça login novamente.');
    }

    if (candidate.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = candidate.user;
    if (!user || !user.isActive) throw new UnauthorizedException('Sessão inválida.');

    const tenant = user.tenant;
    if (tenant && (tenant.status === TENANT_STATUS.SUSPENDED || tenant.status === TENANT_STATUS.CANCELED)) {
      throw new UnauthorizedException('Conta da empresa inativa. Verifique a situação do plano.');
    }

    const companyIdToUse = tenant?.id || (user as any).companyId || null;

    const newAccessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
        phone: user.phone,
        tenantId: tenant?.id || null,
        tenantSlug: tenant?.slug || null,
        companyId: companyIdToUse,
      },
      { expiresIn: ACCESS_TTL },
    );

    const newRefreshToken = await this.issueRefreshToken(user.id, tenant ? `tenant-${tenant.id}` : `app-${user.id}`);

    await this.prisma.refreshToken.update({
      where: { id: candidate.id },
      data: { revokedAt: new Date() },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
        phone: user.phone,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            companyName: tenant.companyName,
            tradeName: tenant.tradeName,
            slug: tenant.slug,
            niche: tenant.niche,
          }
        : null,
    };
  }

  async refreshSession(slug: string, refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token ausente.');
    const tenant = await this.getTenantBySlug(slug);

    const [refreshId, secret] = refreshToken.split('.');
    if (!refreshId || !secret) throw new UnauthorizedException('Refresh token inválido.');

    const candidate = await this.prisma.refreshToken.findUnique({
      where: { id: refreshId },
      include: { user: { select: { id: true, tenantId: true } } },
    });

    // Defesa em profundidade: o token tem de pertencer a um usuário do tenant
    // do slug informado. Sem isso, um token válido de outro inquilino seria
    // aceito ao trocar o slug na URL.
    const belongsToTenant =
      candidate?.user &&
      (candidate.user.tenantId === tenant.id || (await this.isSuperAdmin(candidate.user.id)));

    if (!candidate || !belongsToTenant) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    let hashMatches = false;
    try {
      hashMatches = await argon2.verify(candidate.tokenHash, secret);
    } catch {
      hashMatches = false;
    }
    if (!hashMatches) throw new UnauthorizedException('Refresh token inválido.');

    // Reuso de um token já rotacionado: pode ser roubo — MAS também corrida
    // legítima entre abas/dispositivos. Dentro da janela de tolerância e com
    // sucessor, devolve só um access novo (sem rotacionar de novo e sem matar
    // a família). Ver `isBenignRotationReuse`.
    if (candidate.revokedAt) {
      if (isBenignRotationReuse(candidate.revokedAt, (candidate as any).replacedByTokenId)) {
        const graceUser: any = await this.prisma.user.findUnique({
          where: { id: candidate.userId },
          select: EMPLOYEE_SELECT_SAFE,
        });
        if (!graceUser || !graceUser.isActive) throw new UnauthorizedException('Sessão inválida.');
        if (tenant.status === TENANT_STATUS.SUSPENDED || tenant.status === TENANT_STATUS.CANCELED) {
          throw new UnauthorizedException('Conta da empresa inativa. Verifique a situação do plano.');
        }
        const graceAccess = this.jwtService.sign(
          {
            sub: graceUser.id,
            email: graceUser.email,
            name: graceUser.name,
            role: graceUser.role,
            position: graceUser.position,
            tags: (graceUser as any).tags ?? '[]',
            phone: graceUser.phone,
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            companyId: tenant.id,
          },
          { expiresIn: ACCESS_TTL },
        );
        return { accessToken: graceAccess };
      }
      await this.prisma.refreshToken.updateMany({
        where: { userId: candidate.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão comprometida. Faça login novamente.');
    }

    if (candidate.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: candidate.userId },
      select: EMPLOYEE_SELECT_SAFE,
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Sessão inválida.');

    // Também barramos tenant suspenso/cancelado: antes só o usuário era
    // revalidado, então um inquilino bloqueado continuava renovando sessão.
    if (tenant.status === TENANT_STATUS.SUSPENDED || tenant.status === TENANT_STATUS.CANCELED) {
      throw new UnauthorizedException('Conta da empresa inativa. Verifique a situação do plano.');
    }

    const newAccessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
        phone: user.phone,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        companyId: tenant.id,
      },
      { expiresIn: ACCESS_TTL },
    );

    const newRefreshToken = await this.issueRefreshToken(user.id, `tenant-${tenant.id}`);

    await this.prisma.refreshToken.update({
      where: { id: candidate.id },
      data: { revokedAt: new Date() },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        tags: (user as any).tags ?? '[]',
        phone: user.phone,
      },
      tenant: {
        id: tenant.id,
        companyName: tenant.companyName,
        tradeName: tenant.tradeName,
        slug: tenant.slug,
        niche: tenant.niche,
      },
    };
  }

  /** O SUPER_ADMIN tem acesso cross-tenant (suporte); os demais não. */
  private async isSuperAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return u?.role === 'SUPER_ADMIN';
  }

  async getDashboard(slug: string) {
    const tenant = await this.getTenantBySlug(slug);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Vendas do salão/QR gravam `companyId` — o genérico precisa dos dois
    // escopos como os irmãos (se não, a venda da mesa some daqui).
    const orderScope = { OR: [{ tenantId: tenant.id }, { companyId: tenant.id }] };

    const [todayOrders, lowStockCount, lowStockProducts, totalCustomers, unreadNotifications, recentOrders] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            ...orderScope,
            createdAt: { gte: startOfDay },
            status: { notIn: ['CANCELLED', 'CANCELED'] },
          },
          select: { totalCents: true, paymentMethod: true },
        }),
        // Contagem real (sem teto) para o KPI; a lista abaixo segue limitada.
        this.prisma.product.count({
          where: {
            tenantId: tenant.id,
            isActive: true,
            stockQuantity: { lte: 5 },
          },
        }),
        this.prisma.product.findMany({
          where: {
            tenantId: tenant.id,
            isActive: true,
            stockQuantity: { lte: 5 },
          },
          take: 8,
          include: { category: true },
        }),
        this.prisma.customer.count({ where: { tenantId: tenant.id } }),
        this.prisma.automationNotification.findMany({
          where: { tenantId: tenant.id, isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.order.findMany({
          where: { ...orderScope },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { customer: true, items: { include: { product: true } } },
        }),
      ]);

    const totalSalesCents = todayOrders.reduce((acc, order) => acc + (Number(order.totalCents) || 0), 0);

    return {
      kpis: {
        totalSalesCents,
        orderCount: todayOrders.length,
        lowStockCount,
        totalCustomers,
      },
      lowStockProducts,
      unreadNotifications,
      recentOrders,
    };
  }

  async getRestaurantDashboard(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    // Mesas e produtos do salão vivem em `Company`, não em `Tenant`: sem
    // resolver a empresa de verdade, tudo de mesa vinha zerado.
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;
    const scope = { OR: [{ tenantId: tenant.id }, { companyId }] };

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1);

    const cancelled = { notIn: ['CANCELLED', 'CANCELED'] };

    const [
      allOrders,
      weekOrders,
      products,
      categories,
      customers,
      tables,
      recentOrdersRaw,
      tenantUsers,
      paidBills,
      topItems,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...scope },
        select: { id: true, totalCents: true, status: true, origin: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { ...scope, createdAt: { gte: startOfWeek }, status: cancelled },
        select: { id: true, totalCents: true, status: true, createdAt: true },
      }),
      this.prisma.product.findMany({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId }],
          isActive: true,
        },
        include: { category: true },
      }),
      this.prisma.productCategory.findMany({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId }],
        },
      }),
      this.prisma.customer.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.prisma.table.findMany({
        where: { companyId },
        select: { id: true, number: true, status: true, capacity: true },
      }),
      this.prisma.order.findMany({
        where: { ...scope },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          customer: true,
          table: true,
          items: {
            include: {
              product: {
                select: { id: true, name: true, imageUrl: true, category: true, salePriceCents: true },
              },
            },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { OR: [{ tenantId: tenant.id }, { companyId }] },
        select: { id: true },
      }),
      // Despesas reais do gráfico (contas pagas por mês), não 42% chutado.
      this.prisma.billPayable.findMany({
        where: { tenantId: tenant.id, status: 'PAID', paidAt: { gte: eightMonthsAgo } },
        select: { amountCents: true, paidAt: true },
      }),
      // Ranking real: top 3 por faturamento (sem avaliações — não há review).
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { ...scope, status: cancelled } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 3,
      }),
    ]);

    // Atividades só deste tenant: AuditLog não tem tenantId, então filtra
    // pelos usuários da casa. Sem isso, um restaurante via a ação do outro.
    const tenantUserIds = tenantUsers.map((u) => u.id);
    const recentAuditLogs =
      tenantUserIds.length > 0
        ? await this.prisma.auditLog
            .findMany({
              where: { userId: { in: tenantUserIds } },
              orderBy: { createdAt: 'desc' },
              take: 6,
              include: { user: { select: { id: true, name: true, role: true } } },
            })
            .catch(() => [])
        : [];

    // KPI Calculations (reais — sem fallback fictício: zerado mostra zero.
    // Cancelados não contam como pedido nem como receita.)
    const validOrders = allOrders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'CANCELED');
    const totalOrdersCount = validOrders.length;
    const totalCustomersCount = customers.length;
    const totalRevenueCents = validOrders.reduce((acc, o) => acc + (Number(o.totalCents) || 0), 0);
    const todaySalesCents = validOrders
      .filter((o) => o.createdAt >= startOfDay)
      .reduce((acc, o) => acc + (Number(o.totalCents) || 0), 0);
    const todayCount = validOrders.filter((o) => o.createdAt >= startOfDay).length;
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdaySalesCents = validOrders
      .filter((o) => o.createdAt >= startOfYesterday && o.createdAt < startOfDay)
      .reduce((acc, o) => acc + (Number(o.totalCents) || 0), 0);

    // Mesas
    const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED').length;
    const freeTables = tables.filter((t) => t.status !== 'OCCUPIED').length;

    // Spline curve points (últimos 8 meses, receita real + despesas pagas reais)
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const splineMonths: { month: string; receita: number; despesas: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const mOrders = allOrders.filter(
        (o) => o.status !== 'CANCELLED' && o.status !== 'CANCELED' && o.createdAt >= d && o.createdAt < nextD,
      );
      const mRevCents = mOrders.reduce((sum, o) => sum + (Number(o.totalCents) || 0), 0);
      const mPaidCents = paidBills
        .filter((b) => b.paidAt && b.paidAt >= d && b.paidAt < nextD)
        .reduce((sum, b) => sum + (Number(b.amountCents) || 0), 0);
      splineMonths.push({
        month: monthNames[d.getMonth()],
        receita: Math.round(mRevCents / 100),
        despesas: Math.round(mPaidCents / 100),
      });
    }

    // Série diária real (últimos 14 dias, receita + despesas pagas): em
    // operação nova o mensal fica zerado e parece quebrado — o diário mostra
    // o movimento de verdade dia a dia.
    const revenueDaily: { label: string; receita: number; despesas: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const nextD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      const dRevCents = allOrders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'CANCELED' && o.createdAt >= d && o.createdAt < nextD)
        .reduce((sum, o) => sum + (Number(o.totalCents) || 0), 0);
      const dPaidCents = paidBills
        .filter((b) => b.paidAt && b.paidAt >= d && b.paidAt < nextD)
        .reduce((sum, b) => sum + (Number(b.amountCents) || 0), 0);
      revenueDaily.push({
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        receita: Math.round(dRevCents / 100),
        despesas: Math.round(dPaidCents / 100),
      });
    }

    // Categorias Donut (reais; top 5 + Outras; vazio devolve [] para o
    // front mostrar estado vazio em vez de rosca inventada)
    const catDistribution: { name: string; count: number; percentage: number; color: string }[] = [];
    const colors = ['#FF6B00', '#2DD4BF', '#FDBA74', '#71717A', '#3B82F6', '#A78BFA'];
    {
      const withCounts = categories.map((cat) => ({
        name: cat.name,
        count: products.filter((p) => p.categoryId === cat.id).length,
      }));
      const ranked = withCounts.sort((a, b) => b.count - a.count);
      const top = ranked.slice(0, 5);
      const restCount = ranked.slice(5).reduce((s, c) => s + c.count, 0);
      if (restCount > 0) top.push({ name: 'Outras', count: restCount });
      const totalCount = top.reduce((s, c) => s + c.count, 0);
      if (totalCount > 0) {
        let acc = 0;
        top.forEach((c, idx) => {
          const isLast = idx === top.length - 1;
          const pct = isLast ? 100 - acc : Math.round((c.count / totalCount) * 100);
          acc += pct;
          catDistribution.push({ name: c.name, count: c.count, percentage: pct, color: colors[idx % colors.length] });
        });
      }
    }

    // Barras por dia da semana (Segunda a Domingo) — zeros reais, sem baseline
    const daysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weeklyBars = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => ({ day, orders: 0 }));
    weekOrders.forEach((o) => {
      const dIndex = o.createdAt.getDay();
      const dayName = daysMap[dIndex];
      const found = weeklyBars.find((b) => b.day === dayName);
      if (found) found.orders += 1;
    });

    // Tipos de Pedido por origem real (salão, balcão, delivery)
    const dineInCount = allOrders.filter(
      (o) => o.origin === 'WAITER' || o.origin === 'TABLET' || o.origin === 'QR_CODE',
    ).length;
    const takeawayCount = allOrders.filter((o) => o.origin === 'POS').length;
    const deliveryCount = allOrders.filter((o) => o.origin === 'DELIVERY').length;
    const totalOrigins = dineInCount + takeawayCount + deliveryCount;
    const orderTypes = {
      dineIn: {
        count: dineInCount,
        percentage: totalOrigins ? Math.round((dineInCount / totalOrigins) * 100) : 0,
      },
      takeaway: {
        count: takeawayCount,
        percentage: totalOrigins ? Math.round((takeawayCount / totalOrigins) * 100) : 0,
      },
      delivery: {
        count: deliveryCount,
        percentage: totalOrigins ? Math.round((deliveryCount / totalOrigins) * 100) : 0,
      },
    };

    // Pedidos recentes formatados com fotos reais (quando o prato tem foto;
    // sem foto o front mostra as iniciais — sem imagem genérica de banco)
    const orderStatusMeta = (status: string) => {
      if (status === 'PREPARING' || status === 'PENDING') {
        return { statusLabel: 'Em Preparo', statusStyle: 'bg-amber-50 text-amber-700 border-amber-200' };
      }
      if (status === 'READY') {
        return { statusLabel: 'Pronto', statusStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      }
      if (status === 'DELIVERED') {
        return { statusLabel: 'Entregue', statusStyle: 'bg-blue-50 text-blue-700 border-blue-200' };
      }
      if (status === 'CANCELLED' || status === 'CANCELED') {
        return { statusLabel: 'Cancelado', statusStyle: 'bg-red-50 text-red-700 border-red-200' };
      }
      return { statusLabel: 'Concluído', statusStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    };

    const recentOrders = recentOrdersRaw.map((o) => {
      const firstItem = o.items[0];
      const prod = firstItem?.product;
      const meta = orderStatusMeta(o.status);
      // Quantidade SOMADA dos itens (antes mostrava só a do primeiro item).
      const totalQty = (o.items || []).reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
      return {
        id: `#ORD${o.orderNumber}`,
        rawId: o.id,
        name: prod?.name || 'Item',
        category: (prod as any)?.category?.name || null,
        quantity: Math.round(totalQty),
        amount: (Number(o.totalCents) || 0) / 100,
        customer: o.customer?.name || (o.table ? `Mesa ${o.table.number}` : 'Cliente Balcão'),
        status: o.status,
        statusLabel: meta.statusLabel,
        statusStyle: meta.statusStyle,
        imageUrl: prod?.imageUrl || null,
        notes: o.notes || firstItem?.notes || null,
        createdAt: o.createdAt,
      };
    });

    // Trending: top 3 pratos por faturamento real (sem nota/avaliação — não há
    // sistema de reviews; o front só exibe o que vier).
    const topProductIds = topItems.map((t: any) => t.productId);
    const topProducts = topProductIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true, imageUrl: true, salePriceCents: true, category: true },
        })
      : [];
    const trendingMenus = topItems.map((t: any) => {
      const p = topProducts.find((pp) => pp.id === t.productId);
      return {
        id: t.productId,
        name: p?.name || 'Item',
        category: (p as any)?.category?.name || null,
        soldQty: Math.round(Number(t._sum?.quantity) || 0),
        revenueCents: Math.round(Number(t._sum?.totalPrice) || 0),
        price: (Number(p?.salePriceCents) || 0) / 100,
        imageUrl: p?.imageUrl || null,
      };
    });

    // Atividades Recentes (só desta casa; sem fallback fictício — vazio é [])
    const recentActivities = recentAuditLogs.map((act: any, i: number) => ({
      id: act.id || String(i),
      author: act.user?.name || 'Operador',
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(act.user?.name || 'User')}`,
      action: act.action || 'Atualização no sistema',
      timestamp: act.createdAt
        ? new Date(act.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '',
    }));

    return {
      kpis: {
        totalOrders: totalOrdersCount,
        totalCustomers: totalCustomersCount,
        totalRevenue: totalRevenueCents / 100,
        todaySales: todaySalesCents / 100,
        todayCount,
        yesterdaySales: yesterdaySalesCents / 100,
        occupiedTables,
        freeTables,
        totalTables: tables.length,
      },
      splineMonths,
      revenueDaily,
      catDistribution,
      weeklyBars,
      orderTypes,
      recentOrders,
      trendingMenus,
      recentActivities,
    };
  }

  async getSupermarketDashboard(slug: string) {
    const tenant = await this.getTenantBySlug(slug);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    // Mesmas regras do resto do painel: os dois escopos e as duas grafias de
    // cancelado — se não, venda de mesa/QR e cancelamento somem ou vazam.
    const orderScope = { OR: [{ tenantId: tenant.id }, { companyId: tenant.id }] };
    const notCancelled = { notIn: ['CANCELLED', 'CANCELED'] };

    const [todayOrders, monthOrders, allProducts, recentOrders, receiveToday, payToday, expiringSoon] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { ...orderScope, createdAt: { gte: startOfDay }, status: notCancelled },
          select: { id: true, totalCents: true, createdAt: true, items: { select: { quantity: true, unitPrice: true, totalPrice: true, productId: true } } },
        }),
        this.prisma.order.findMany({
          where: { ...orderScope, createdAt: { gte: startOfMonth }, status: notCancelled },
          select: { totalCents: true },
        }),
        // Todos (ativos ou não): custo e ranking precisam enxergar item
        // vendido que foi desativado depois — se não, lucro infla e top some.
        this.prisma.product.findMany({ where: { tenantId: tenant.id }, include: { category: true } }),
        this.prisma.order.findMany({
          where: { ...orderScope, status: notCancelled },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { customer: true, items: { include: { product: true } } },
        }),
        this.prisma.billReceivable.findMany({
          where: { tenantId: tenant.id, status: 'PENDING', dueDate: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) } },
          select: { amountCents: true },
        }),
        this.prisma.billPayable.findMany({
          where: { tenantId: tenant.id, status: 'PENDING', dueDate: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) } },
          select: { amountCents: true },
        }),
        // Inclui já-vencidos: lote vencido ativo é o alerta mais importante.
        this.prisma.stockBatch.findMany({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            quantity: { gt: 0 },
            expiryDate: { lte: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { expiryDate: 'asc' },
          take: 6,
          include: { product: true },
        }),
      ]);

    // Alertas de estoque consideram só ativos (inativo fora de linha não conta).
    const products = allProducts.filter((p) => p.isActive);

    const salesToday = todayOrders.reduce((a, o) => a + (Number(o.totalCents) || 0), 0);
    const salesMonth = monthOrders.reduce((a, o) => a + (Number(o.totalCents) || 0), 0);

    const productsSoldToday = todayOrders.reduce(
      (a, o) => a + o.items.reduce((x, i) => x + (Number(i.quantity) || 0), 0),
      0,
    );

    const avgTicket = todayOrders.length ? salesToday / todayOrders.length : 0;

    // Lucro bruto estimado do dia. O custo vem de TODOS os produtos (ativos ou
    // não): item vendido e depois desativado entrava com custo 0 e inflava.
    const costByProduct = new Map<string, number>();
    for (const p of allProducts) costByProduct.set(p.id, Number((p as any).costPriceCents) || 0);
    const grossProfitToday = todayOrders.reduce((acc, o) => {
      const costSum = o.items.reduce((c, i) => c + (costByProduct.get(i.productId as string) || 0) * Number(i.quantity || 0), 0);
      return acc + ((Number(o.totalCents) || 0) - costSum);
    }, 0);

    const lowStock = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minStockAlert);
    const zeroStock = products.filter((p) => p.stockQuantity <= 0);

    // Vendas dos últimos 14 dias (agrupadas por dia)
    const orders14d = await this.prisma.order.findMany({
      where: { ...orderScope, createdAt: { gte: start14d }, status: notCancelled },
      select: { totalCents: true, createdAt: true },
    });
    const dailySales = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(startOfDay.getTime() - i * 24 * 60 * 60 * 1000);
      dailySales.set(d.toISOString().slice(0, 10), 0);
    }
    for (const o of orders14d) {
      const key = o.createdAt.toISOString().slice(0, 10);
      dailySales.set(key, (dailySales.get(key) || 0) + (Number(o.totalCents) || 0));
    }
    const salesLast14Days = [...dailySales.entries()].map(([date, cents]) => ({ date, totalCents: cents }));

    // Vendas por categoria (últimos 30 dias)
    const orders30d = await this.prisma.order.findMany({
      where: { ...orderScope, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, status: notCancelled },
      include: { items: { select: { productId: true, quantity: true, totalPrice: true } } },
    });
    const productById = new Map(allProducts.map((p) => [p.id, p]));
    const salesByCat = new Map<string, number>();
    for (const o of orders30d) {
      for (const i of o.items) {
        const p = productById.get(i.productId);
        const catName = (p as any)?.category?.name || 'Sem categoria';
        salesByCat.set(catName, (salesByCat.get(catName) || 0) + (Number(i.totalPrice) || 0));
      }
    }
    const salesByCategory = [...salesByCat.entries()].map(([category, totalCents]) => ({ category, totalCents }));

    // Top produtos (30 dias): UNIDADES somadas (antes contava 1 por linha, então
    // 10 un em 1 linha valia "1"). Ordena por faturamento.
    const soldQty = new Map<string, number>();
    const soldRevenue = new Map<string, number>();
    for (const o of orders30d) {
      for (const i of o.items) {
        soldQty.set(i.productId, (soldQty.get(i.productId) || 0) + (Number((i as any).quantity) || 0));
        soldRevenue.set(i.productId, (soldRevenue.get(i.productId) || 0) + (Number(i.totalPrice) || 0));
      }
    }
    const topProducts = [...soldQty.entries()]
      .map(([id, quantity]) => {
        const p = productById.get(id);
        return { id, name: p?.name || 'Item', quantity, revenueCents: soldRevenue.get(id) || 0 };
      })
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);

    const alerts = [];
    for (const p of lowStock) alerts.push({ type: 'LOW_STOCK', message: `${p.name} está com estoque baixo (${p.stockQuantity} ${p.unit})` });
    for (const p of zeroStock) alerts.push({ type: 'ZERO_STOCK', message: `${p.name} está zerado` });

    return {
      kpis: {
        salesTodayCents: salesToday,
        salesMonthCents: salesMonth,
        orderCount: todayOrders.length,
        avgTicketCents: Math.round(avgTicket),
        grossProfitTodayCents: grossProfitToday,
        productsSoldToday,
        lowStockCount: lowStock.length,
        zeroStockCount: zeroStock.length,
        receivableTodayCents: receiveToday.reduce((a, b) => a + b.amountCents, 0),
        payableTodayCents: payToday.reduce((a, b) => a + b.amountCents, 0),
        productCount: products.length,
      },
      salesLast14Days,
      salesByCategory,
      topProducts,
      alerts,
      expiringSoon,
      recentOrders,
    };
  }

  async getProducts(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const [categories, products] = await Promise.all([
      this.prisma.productCategory.findMany({
        where: { tenantId: tenant.id },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { tenantId: tenant.id },
        include: {
          category: true,
          barcodes: true,
          recipeItems: { include: { ingredient: true } },
          modifierGroups: {
            include: { items: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { categories, products };
  }

  async createCategory(slug: string, data: { name: string; color?: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;

    return this.prisma.productCategory.create({
      data: {
        tenantId: tenant.id,
        companyId,
        name: data.name.trim(),
        color: data.color || '#f59e0b',
        active: true,
      },
    });
  }

  async deleteCategory(slug: string, categoryId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;

    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        OR: [{ tenantId: tenant.id }, { companyId }],
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    await this.prisma.product.updateMany({
      where: { categoryId: category.id },
      data: { categoryId: null },
    });

    return this.prisma.productCategory.delete({
      where: { id: category.id },
    });
  }

  async updateCategory(slug: string, categoryId: string, data: { name?: string; color?: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;

    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        OR: [{ tenantId: tenant.id }, { companyId }],
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    const patch: any = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestException('O nome da categoria não pode ficar vazio');
      patch.name = name.slice(0, 60);
    }
    if (data.color !== undefined && String(data.color).trim()) {
      patch.color = String(data.color).trim().slice(0, 20);
    }
    if (Object.keys(patch).length === 0) return category;

    return this.prisma.productCategory.update({
      where: { id: category.id },
      data: patch,
    });
  }

  async createProduct(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findFirst({
      where: { OR: [{ id: tenant.id }, { slug: tenant.slug }] },
    });
    const companyId = company?.id || tenant.id;

    const modifierGroupsCreate = (data.modifierGroups && Array.isArray(data.modifierGroups))
      ? data.modifierGroups
          .filter((g: any) => g && g.name && String(g.name).trim().length > 0)
          .map((group: any) => ({
            name: String(group.name).trim(),
            minSelectable: Number(group.minSelectable ?? (group.isRequired ? 1 : 0)),
            maxSelectable: Number(group.maxSelectable ?? 1),
            isRequired: Boolean(group.isRequired),
            items: {
              create: (group.items || [])
                .filter((i: any) => i && i.name && String(i.name).trim().length > 0)
                .map((item: any) => ({
                  name: String(item.name).trim(),
                  priceCents: Math.round(Number(item.priceCents || 0)),
                })),
            },
          }))
      : undefined;

    return this.prisma.product.create({
      data: {
        tenantId: tenant.id,
        companyId,
        categoryId: data.categoryId || null,
        name: data.name.trim(),
        description: data.description || null,
        sku: data.sku || null,
        barcode: data.barcode || null,
        brand: data.brand || null,
        ncm: data.ncm || null,
        cest: data.cest || null,
        origin: Number(data.origin) || 0,
        csosn: data.csosn || '102',
        cstIcms: data.cstIcms || null,
        cstPis: data.cstPis || '01',
        cstCofins: data.cstCofins || '01',
        cfopDefault: data.cfopDefault || '5102',
        packQuantity: Number(data.packQuantity) || 1,
        imageUrl: data.imageUrl || null,
        salePriceCents: Number(data.salePriceCents) || 0,
        costPriceCents: Number(data.costPriceCents) || 0,
        stockQuantity: Number(data.stockQuantity) || 0,
        minStockAlert: Number(data.minStockAlert) || 5,
        unit: data.unit || 'UN',
        isActive: data.isActive ?? true,
        isRecipe: Boolean(data.isRecipe),
        modifierGroups: modifierGroupsCreate && modifierGroupsCreate.length > 0 ? { create: modifierGroupsCreate } : undefined,
      },
      include: {
        category: true,
        barcodes: true,
        modifierGroups: {
          include: { items: true },
        },
      },
    });
  }

  async updateProduct(slug: string, productId: string, data: any, user?: any) {
    const tenant = await this.getTenantBySlug(slug);

    const before = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: tenant.id },
    });
    if (!before) throw new NotFoundException('Produto não encontrado');

    const ability = this.casl.createForUser(user);
    const operatorId = user?.id || user?.sub;

    // Preço de venda é campo sensível: o guard libera a rota para quem pode
    // editar produto, mas só papéis com permissão no CAMPO podem mexer aqui.
    const nextPrice =
      data.salePriceCents !== undefined ? Number(data.salePriceCents) : undefined;
    const priceChanged = nextPrice !== undefined && nextPrice !== before.salePriceCents;
    if (priceChanged && !ability.can(Action.Update, 'Product', 'salePriceCents')) {
      throw new ForbiddenException(
        'Seu perfil não pode alterar o preço de venda do produto',
      );
    }

    // Saldo de estoque não muda por PATCH de produto: a alteração precisa
    // virar movimento rastreado no Kardex (`POST products/:id/adjust-stock`).
    // Valor igual ao atual é ignorado em silêncio para não quebrar telas que
    // devolvem o objeto inteiro no formulário.
    if (data.stockQuantity !== undefined) {
      const nextStock = Number(data.stockQuantity);
      if (Number.isFinite(nextStock) && nextStock !== Number(before.stockQuantity)) {
        throw new BadRequestException(
          'Saldo de estoque não pode ser alterado por edição de produto. ' +
            'Use o ajuste de estoque, que registra a movimentação no Kardex.',
        );
      }
    }

    const updated = await this.prisma.product.update({
      where: { id: productId, tenantId: tenant.id },
      data: {
        categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
        name: data.name !== undefined ? data.name : undefined,
        description: data.description !== undefined ? data.description : undefined,
        sku: data.sku !== undefined ? data.sku : undefined,
        barcode: data.barcode !== undefined ? data.barcode : undefined,
        brand: data.brand !== undefined ? data.brand : undefined,
        ncm: data.ncm !== undefined ? data.ncm : undefined,
        cest: data.cest !== undefined ? data.cest : undefined,
        origin: data.origin !== undefined ? Number(data.origin) : undefined,
        csosn: data.csosn !== undefined ? data.csosn : undefined,
        cstIcms: data.cstIcms !== undefined ? data.cstIcms : undefined,
        cstPis: data.cstPis !== undefined ? data.cstPis : undefined,
        cstCofins: data.cstCofins !== undefined ? data.cstCofins : undefined,
        cfopDefault: data.cfopDefault !== undefined ? data.cfopDefault : undefined,
        packQuantity: data.packQuantity !== undefined ? Number(data.packQuantity) : undefined,
        imageUrl: data.imageUrl !== undefined ? data.imageUrl : undefined,
        salePriceCents: nextPrice !== undefined ? nextPrice : undefined,
        costPriceCents: data.costPriceCents !== undefined ? Number(data.costPriceCents) : undefined,
        minStockAlert: data.minStockAlert !== undefined ? Number(data.minStockAlert) : undefined,
        unit: data.unit !== undefined ? data.unit : undefined,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
        isRecipe: data.isRecipe !== undefined ? Boolean(data.isRecipe) : undefined,
      },
      include: { category: true, barcodes: true },
    });

    // Trilha obrigatória quando o preço muda (achado C8: edição não pode
    // sobrescrever o dado sem histórico).
    if (priceChanged) {
      await this.audit.recordChangeSafe({
        userId: operatorId,
        action: 'PRODUCT_PRICE_CHANGE',
        targetType: 'Product',
        targetId: productId,
        before: { name: before.name, salePriceCents: before.salePriceCents },
        after: { name: updated.name, salePriceCents: updated.salePriceCents },
      });
    }

    return updated;
  }

  /**
   * Exclusão de produto com proteção de histórico.
   *
   * O `OrderItem.product` é `onDelete: Cascade`: apagar um produto que já foi
   * vendido apagaria os itens das vendas antigas em silêncio. Por isso, com
   * histórico de vendas a exclusão vira desativação (sai da venda, histórico
   * preservado); sem histórico apaga de vez (cascata limpa lotes, Kardex,
   * códigos de barras e fornecedores vinculados).
   */
  async deleteProduct(slug: string, productId: string) {
    const tenant = await this.getTenantBySlug(slug);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: tenant.id },
      select: { id: true, name: true, isActive: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const sold = await this.prisma.orderItem.count({ where: { productId: product.id } });
    if (sold > 0) {
      await this.prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
      return { id: product.id, name: product.name, deactivated: true, deleted: false, sales: sold };
    }

    await this.prisma.product.delete({ where: { id: product.id } });
    return { id: product.id, name: product.name, deactivated: false, deleted: true, sales: 0 };
  }

  /** Exclusão em lote (checkbox da lista). Cap de 100 por chamada. */
  async deleteProducts(slug: string, ids: unknown) {
    const list = (Array.isArray(ids) ? ids : []).map((x) => String(x)).filter(Boolean).slice(0, 100);
    if (list.length === 0) throw new BadRequestException('Selecione ao menos 1 produto.');
    const results: Array<{ id: string; name?: string; deleted?: boolean; deactivated?: boolean; error?: string }> = [];
    for (const id of list) {
      try {
        const r = await this.deleteProduct(slug, id);
        results.push({ id, name: r.name, deleted: r.deleted, deactivated: r.deactivated });
      } catch (err: any) {
        results.push({ id, error: err?.message || 'Falha ao excluir' });
      }
    }
    const deleted = results.filter((r) => r.deleted).length;
    const deactivated = results.filter((r) => r.deactivated).length;
    return { total: results.length, deleted, deactivated, results };
  }

  async createOrder(slug: string, orderInput: any, userId?: string) {
    const tenant = await this.getTenantBySlug(slug);

    if (!orderInput.items || orderInput.items.length === 0) {
      throw new BadRequestException('A venda deve conter pelo menos 1 item');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Get highest order number
      const lastOrder = await tx.order.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber || 100) + 1;

      let subtotalCents = 0;
      const preparedItems = [];
      const stockAlerts = [];

      for (const item of orderInput.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId, tenantId: tenant.id },
          include: { recipeItems: true },
        });

        if (!product) throw new NotFoundException(`Produto ${item.productId} não encontrado`);

        // Antes `Number(item.quantity)` entrava direto: negativo fazia o
        // `decrement` virar acréscimo (estoque subia), NaN propagava para o
        // total e valores absurdos derrubavam o estoque para negativo.
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
          throw new BadRequestException(
            `Quantidade inválida para o produto ${item.productId}: deve estar entre 1 e ${MAX_ITEM_QUANTITY}`,
          );
        }
        const unitPrice = Number(item.unitPrice || product.salePriceCents);
        const totalPrice = Math.round(unitPrice * quantity);
        subtotalCents += totalPrice;

        preparedItems.push({
          productId: product.id,
          quantity,
          unitPrice,
          // `unitPrice` e `unitPriceCents` guardam a MESMA coisa (centavos) —
          // a coluna dupla é herança do modelo. Só `unitPrice` estava sendo
          // gravada, então `unitPriceCents` ficava 0 e qualquer leitura por ela
          // (recibo, relatório) mostrava "R$ 0,00" no preço unitário. Passa a
          // gravar as duas.
          unitPriceCents: unitPrice,
          totalPrice,
        });

        // Decrement stock or recipe ingredients
        if (product.isRecipe && product.recipeItems.length > 0) {
          for (const ing of product.recipeItems) {
            const needed = Number(ing.quantityNeeded) * quantity;
            const updatedIng = await tx.product.update({
              where: { id: ing.ingredientId },
              data: { stockQuantity: { decrement: needed } },
            });
            if (Number(updatedIng.stockQuantity) <= Number(updatedIng.minStockAlert)) {
              stockAlerts.push(updatedIng);
            }
          }
        } else {
          const updatedProduct = await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } },
          });
          if (Number(updatedProduct.stockQuantity) <= Number(updatedProduct.minStockAlert)) {
            stockAlerts.push(updatedProduct);
          }

          // Registrar movimentação de estoque
          await tx.stockMovement.create({
            data: {
              tenantId: tenant.id,
              productId: product.id,
              type: 'SALE_POS',
              quantity: -quantity,
              balanceAfter: Number(updatedProduct.stockQuantity),
              notes: `Venda #${orderNumber}`,
            },
          });
        }
      }

      const discountCents = Number(orderInput.discountCents) || 0;
      // Antes `Math.max(0, subtotal - discount)` aceitava desconto maior que a
      // venda e simplesmente zerava o total — sem erro, sem rastro. Rejeitar é
      // o comportamento correto: desconto acima do subtotal é erro de digitação
      // ou tentativa de venda a R$ 0,00.
      if (!Number.isFinite(discountCents) || discountCents < 0) {
        throw new BadRequestException('Desconto inválido');
      }
      if (discountCents > subtotalCents) {
        throw new BadRequestException(
          'Desconto não pode ser maior que o subtotal da venda',
        );
      }
      const totalCents = subtotalCents - discountCents;

      // Normalizado: sem isso, "Dinheiro" era gravado como CASH por um PDV e
      // DINHEIRO por outro, e o relatório (que agrupa pelo valor cru) mostrava
      // o mesmo método em duas linhas.
      const normalizedPaymentMethod = normalizePaymentMethod(
        orderInput.paymentMethod,
        'PIX',
      );

      const createdOrder = await tx.order.create({
        data: {
          tenantId: tenant.id,
          orderNumber,
          customerId: orderInput.customerId || null,
          status: 'COMPLETED',
          paymentMethod: normalizedPaymentMethod,
          subtotalCents,
          discountCents,
          totalCents,
          notes: orderInput.notes || null,
          items: {
            create: preparedItems,
          },
        },
        include: { items: { include: { product: true } }, customer: true },
      });

      // Update customer stats if customer is attached
      if (orderInput.customerId) {
        const isFiado = isCreditSale(normalizedPaymentMethod);
        await tx.customer.update({
          where: { id: orderInput.customerId },
          data: {
            orderCount: { increment: 1 },
            totalSpent: { increment: totalCents },
            loyaltyPoints: { increment: Math.max(1, Math.floor(totalCents / 100)) },
            currentDebtCents: isFiado ? { increment: totalCents } : undefined,
            lastOrderAt: new Date(),
          },
        });

        if (isFiado) {
          await tx.billReceivable.create({
            data: {
              tenantId: tenant.id,
              customerId: orderInput.customerId,
              orderId: createdOrder.id,
              description: `Fiado - Venda #${orderNumber}`,
              amountCents: totalCents,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              type: 'FIADO',
              status: 'PENDING',
            },
          });
        }
      }

      // Generate automation notifications for stock alerts
      for (const lowProduct of stockAlerts) {
        await tx.automationNotification.create({
          data: {
            tenantId: tenant.id,
            type: 'STOCK_ALERT',
            title: `Alerta de Estoque: ${lowProduct.name}`,
            content: `O item "${lowProduct.name}" atingiu o estoque mínimo de segurança (${lowProduct.stockQuantity} ${lowProduct.unit} restantes). Recomendamos repor.`,
          },
        });
      }

      return createdOrder;
    });

    // Autoria do lançamento. Hoje é só trilha: a coluna `Order.createdById`
    // entra na migração B1, que precisa de aprovação. Quando ela existir, o
    // `userId` já está aqui e passa a alimentar a regra R1 (garçom só edita o
    // que ele mesmo lançou).
    await this.audit.recordChangeSafe({
      userId,
      action: 'ORDER_CREATE',
      targetType: 'Order',
      targetId: created.id,
      before: null,
      after: {
        orderNumber: created.orderNumber,
        totalCents: created.totalCents,
        paymentMethod: created.paymentMethod,
        status: created.status,
      },
    });

    return created;
  }

  async getOrders(slug: string, limit = 50) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.order.findMany({
      // PDV/balcão grava `tenantId`; mesa/comanda/QR grava `companyId`. O
      // histórico precisa dos dois — pedido finalizado no salão tem que
      // aparecer aqui junto com os do PDV.
      where: { OR: [{ tenantId: tenant.id }, { companyId: tenant.id }] },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: true,
        // O comprovante do histórico precisa do mesmo detalhe do fechamento:
        // modificadores (ponto/molho), mesa e nome da comanda.
        items: { include: { product: true, modifiers: true } },
        table: { select: { id: true, number: true, label: true } },
        tableSession: { select: { id: true, comandaName: true, waiterName: true, openedAt: true, closedAt: true } },
      },
    });
  }

  async getCustomers(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.customer.findMany({
      where: { tenantId: tenant.id },
      orderBy: { totalSpent: 'desc' },
    });
  }

  async createCustomer(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        document: data.document || null,
        notes: data.notes || null,
        creditLimitCents: Number(data.creditLimitCents) || 0,
        currentDebtCents: Number(data.currentDebtCents) || 0,
        loyaltyPoints: Number(data.loyaltyPoints) || 0,
      },
    });
  }

  async updateCustomer(slug: string, customerId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.customer.update({
      where: { id: customerId, tenantId: tenant.id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        email: data.email !== undefined ? data.email : undefined,
        document: data.document !== undefined ? data.document : undefined,
        notes: data.notes !== undefined ? data.notes : undefined,
        creditLimitCents: data.creditLimitCents !== undefined ? Number(data.creditLimitCents) : undefined,
        currentDebtCents: data.currentDebtCents !== undefined ? Number(data.currentDebtCents) : undefined,
        loyaltyPoints: data.loyaltyPoints !== undefined ? Number(data.loyaltyPoints) : undefined,
      },
    });
  }

  async getCashRegister(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      include: { openedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { openedAt: 'desc' },
    });

    if (!openRegister) return { isOpen: false, register: null };

    // Get orders and cash movements since opened (os dois escopos: PDV grava
    // tenantId, mesa/QR grava companyId — sem o OR a venda do salão sumia)
    const [ordersSince, movements] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
          createdAt: { gte: openRegister.openedAt },
          status: { notIn: ['CANCELLED', 'CANCELED'] },
        },
        select: { totalCents: true, paymentMethod: true },
      }),
      this.prisma.cashMovement.findMany({
        where: {
          tenantId: tenant.id,
          cashRegisterId: openRegister.id,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalSales = ordersSince.reduce((sum, o) => sum + o.totalCents, 0);
    const byMethod: Record<string, number> = {};
    for (const o of ordersSince) {
      byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] || 0) + o.totalCents;
    }

    // Compras de insumos do turno, por canal (movimentos COMPRA da confirmação
    // das notas). Cada canal abate o próprio saldo acumulado de vendas.
    const purchaseMoves = movements.filter((m) => m.type === 'COMPRA');
    const purchasesByMethod: Record<string, number> = {};
    for (const m of purchaseMoves) {
      const method = normalizePaymentMethodOrOther((m as any).paymentMethod);
      purchasesByMethod[method] = (purchasesByMethod[method] || 0) + m.amountCents;
    }
    const purchasesTotalCents = purchaseMoves.reduce((sum, m) => sum + m.amountCents, 0);
    // Líquido por canal: vendas menos compras (o que a especificação chama de
    // "abatimento direcionado em cada saldo").
    const netByMethod: Record<string, number> = {};
    for (const method of new Set([...Object.keys(byMethod), ...Object.keys(purchasesByMethod)])) {
      const canonical = normalizePaymentMethodOrOther(method);
      netByMethod[canonical] =
        (netByMethod[canonical] || 0) + (byMethod[method] || 0) - (purchasesByMethod[method] || 0);
    }

    const totalSangriaCents = movements
      .filter((m) => m.type === 'SANGRIA')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const totalSuprimentoCents = movements
      .filter((m) => m.type === 'SUPRIMENTO')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const cashSalesCents = (byMethod['CASH'] || 0) + (byMethod['DINHEIRO'] || 0);
    const cashPurchasesCents = purchasesByMethod['DINHEIRO'] || 0;
    const cashInDrawerCents = Math.max(
      0,
      openRegister.initialBalanceCents + cashSalesCents - cashPurchasesCents - totalSangriaCents + totalSuprimentoCents,
    );

    return {
      isOpen: true,
      register: openRegister,
      metrics: {
        orderCount: ordersSince.length,
        totalSalesCents: totalSales,
        byMethod,
        purchasesByMethod,
        purchasesTotalCents,
        netByMethod,
        totalSangriaCents,
        totalSuprimentoCents,
        cashInDrawerCents,
      },
      movements,
    };
  }

  async addCashMovement(slug: string, userId: string, data: { type: string; amountCents: number; reason: string }) {
    const tenant = await this.getTenantBySlug(slug);
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    if (!openRegister) {
      throw new BadRequestException('Nenhum caixa aberto para registrar sangria ou suprimento');
    }

    if (!['SANGRIA', 'SUPRIMENTO'].includes(data.type)) {
      throw new BadRequestException('Tipo inválido. Use SANGRIA ou SUPRIMENTO');
    }

    const amountCents = Number(data.amountCents) || 0;
    if (amountCents <= 0) {
      throw new BadRequestException('Valor deve ser maior que zero');
    }

    return this.prisma.cashMovement.create({
      data: {
        tenantId: tenant.id,
        cashRegisterId: openRegister.id,
        type: data.type,
        amountCents,
        reason: data.reason || (data.type === 'SANGRIA' ? 'Sangria de caixa' : 'Reforço de troco'),
        operatorId: userId,
      },
    });
  }

  async openCashRegister(slug: string, userId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    const existing = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
    });
    if (existing) throw new ConflictException('Já existe um caixa aberto no momento');

    return this.prisma.cashRegister.create({
      data: {
        tenantId: tenant.id,
        openedById: userId,
        initialBalanceCents: Number(data.initialBalanceCents) || 0,
        notes: data.notes || null,
        status: 'OPEN',
      },
      include: { openedBy: { select: { id: true, name: true } } },
    });
  }

  async closeCashRegister(slug: string, userId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    if (!openRegister) throw new BadRequestException('Nenhum caixa está aberto para ser fechado');

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        createdAt: { gte: openRegister.openedAt },
        status: { notIn: ['CANCELLED', 'CANCELED'] },
      },
      select: { totalCents: true },
    });

    const totalSales = orders.reduce((sum, o) => sum + o.totalCents, 0);
    // Compras em dinheiro do turno também saem da gaveta (ver getCashRegister).
    const purchaseMoves = await this.prisma.cashMovement.findMany({
      where: { cashRegisterId: openRegister.id, type: 'COMPRA' },
      select: { amountCents: true, paymentMethod: true },
    });
    const cashPurchasesCents = purchaseMoves
      .filter((m) => normalizePaymentMethodOrOther((m as any).paymentMethod) === 'DINHEIRO')
      .reduce((sum, m) => sum + m.amountCents, 0);
    const purchasesTotalCents = purchaseMoves.reduce((sum, m) => sum + m.amountCents, 0);
    const finalBalanceCents = openRegister.initialBalanceCents + totalSales - cashPurchasesCents;
    const actualBalanceCents = Number(data.actualBalanceCents) || finalBalanceCents;

    const closed = await this.prisma.cashRegister.update({
      where: { id: openRegister.id },
      data: {
        closedAt: new Date(),
        status: 'CLOSED',
        finalBalanceCents,
        actualBalanceCents,
        notes: data.notes || null,
      },
    });

    // Create automation notification for DRE / Closing report
    await this.prisma.automationNotification.create({
      data: {
        tenantId: tenant.id,
        type: 'DRE_REPORT',
        title: 'Fechamento de Caixa Concluído',
        content: `Caixa fechado com ${orders.length} vendas totalizando R$ ${(totalSales / 100).toFixed(2)}. Compras de insumos no turno: R$ ${(purchasesTotalCents / 100).toFixed(2)}. Fundo inicial: R$ ${(openRegister.initialBalanceCents / 100).toFixed(2)}.`,
      },
    });

    return closed;
  }

  async getAutomations(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const [rules, notifications] = await Promise.all([
      this.prisma.automationRule.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.automationNotification.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    return { rules, notifications };
  }

  async markNotificationRead(slug: string, notificationId: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.automationNotification.update({
      where: { id: notificationId, tenantId: tenant.id },
      data: { isRead: true },
    });
  }

  async getAppointments(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.appointment.findMany({
      where: { tenantId: tenant.id },
      include: { customer: true, staff: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /**
   * Catálogo de serviços da casa (barbearia/salão). É isto que o dono
   * "libera" para o agendamento online — não o histórico nem o cardápio.
   */
  async listServices(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.service.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createService(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const name = String(data?.name || '').trim();
    if (!name) throw new BadRequestException('Informe o nome do serviço');
    const priceCents = Math.max(0, Math.round(Number(data?.priceCents) || 0));
    const durationMin = Math.min(480, Math.max(5, Math.round(Number(data?.durationMin) || 30)));
    try {
      return await this.prisma.service.create({
        data: {
          tenantId: tenant.id,
          name: name.slice(0, 80),
          priceCents,
          durationMin,
          isActive: data?.isActive !== false,
        },
      });
    } catch (e: any) {
      if (String(e?.code) === 'P2002') {
        throw new ConflictException('Este serviço já está cadastrado');
      }
      throw e;
    }
  }

  async updateService(slug: string, id: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const existing = await this.prisma.service.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Serviço não encontrado');

    const patch: any = {};
    if (data?.name !== undefined) {
      const name = String(data.name || '').trim();
      if (!name) throw new BadRequestException('Informe o nome do serviço');
      patch.name = name.slice(0, 80);
    }
    if (data?.priceCents !== undefined) {
      patch.priceCents = Math.max(0, Math.round(Number(data.priceCents) || 0));
    }
    if (data?.durationMin !== undefined) {
      patch.durationMin = Math.min(480, Math.max(5, Math.round(Number(data.durationMin) || 30)));
    }
    if (data?.isActive !== undefined) patch.isActive = Boolean(data.isActive);
    if (data?.sortOrder !== undefined) patch.sortOrder = Math.round(Number(data.sortOrder) || 0);

    try {
      return await this.prisma.service.update({ where: { id }, data: patch });
    } catch (e: any) {
      if (String(e?.code) === 'P2002') {
        throw new ConflictException('Este serviço já está cadastrado');
      }
      throw e;
    }
  }

  async deleteService(slug: string, id: string) {
    const tenant = await this.getTenantBySlug(slug);
    const existing = await this.prisma.service.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) throw new NotFoundException('Serviço não encontrado');
    await this.prisma.service.delete({ where: { id } });
    return { success: true };
  }

  async createAppointment(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    let customerId = data.customerId;
    if (!customerId) {
      const customerName = data.customerName || data.name || 'Cliente';
      const customerPhone = data.customerPhone || data.phone || null;
      let cust = await this.prisma.customer.findFirst({
        where: { tenantId: tenant.id, phone: customerPhone || undefined, name: customerName },
      });
      if (!cust) {
        cust = await this.prisma.customer.create({
          data: {
            tenantId: tenant.id,
            name: customerName,
            phone: customerPhone,
          },
        });
      }
      customerId = cust.id;
    }

    let staffId = data.staffId;
    if (!staffId && data.staffName) {
      const matched = await this.prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          isActive: true,
          name: String(data.staffName).trim(),
        },
      });
      if (matched) staffId = matched.id;
    }
    if (!staffId) {
      const firstStaff = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      staffId = firstStaff?.id;
    }

    if (!staffId) {
      const fallbackStaff = await this.prisma.user.create({
        data: {
          tenantId: tenant.id,
          name: 'Barbeiro da Casa',
          email: `barbeiro@${tenant.slug || 'barbearia'}.com`,
          passwordHash: 'placeholder',
          role: 'TENANT_EMPLOYEE',
        },
      });
      staffId = fallbackStaff.id;
    }

    return this.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        customerId,
        staffId,
        serviceName: data.serviceName || 'Corte de Cabelo',
        priceCents: Number(data.priceCents) || 0,
        scheduledAt: new Date(data.scheduledAt || Date.now()),
        durationMin: Number(data.durationMin) || 30,
        status: data.status || 'CONFIRMED',
      },
      include: { customer: true, staff: { select: { id: true, name: true } } },
    });
  }

  async updateAppointmentStatus(
    slug: string,
    appointmentId: string,
    status: string,
    paymentMethod?: string,
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const data: any = { status };
    if (status === 'COMPLETED' && paymentMethod) {
      data.paymentMethod = paymentMethod;
    }
    return this.prisma.appointment.update({
      where: { id: appointmentId, tenantId: tenant.id },
      data,
      include: { customer: true, staff: { select: { id: true, name: true } } },
    });
  }

  // ─── Funcionários (Equipe do Painel do Cliente) ────────────────────────────

  private async getTenantUserContext(slug: string, userId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.tenantId !== tenant.id && user.role !== 'SUPER_ADMIN')) {
      throw new ForbiddenException('Usuário não pertence a esta empresa');
    }
    return { tenant, user };
  }

  async getEmployees(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const employees = await this.prisma.user.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: EMPLOYEE_SELECT_SAFE,
    });
    return { employees };
  }

  async getEmployee(slug: string, employeeId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
      select: EMPLOYEE_SELECT_SAFE,
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');
    return employee;
  }

  async createEmployee(slug: string, data: CreateEmployeeInput) {
    const tenant = await this.getTenantBySlug(slug);
    const email = data.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe um usuário com esse e-mail');
    }

    let normalizedPhone: string | null = null;
    if (data.phone) {
      const digits = data.phone.replace(/\D/g, '');
      if (digits) {
        const without55 = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
        normalizedPhone = `+55${without55}`;
        const phoneClash = await this.prisma.user.findFirst({
          where: {
            OR: [
              { phone: normalizedPhone },
              { phone: digits },
              { phone: without55 },
              { phone: data.phone.trim() },
            ],
          },
        });
        if (phoneClash) {
          throw new ConflictException('Já existe um usuário cadastrado com esse telefone');
        }
      }
    }

    const company = await this.prisma.company.findUnique({ where: { slug: tenant.slug } });
    const passwordHash = await argon2.hash(data.password);

    return this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        companyId: company?.id || null,
        email,
        name: data.name.trim(),
        role: data.role,
        phone: normalizedPhone,
        position: data.position?.trim() || null,
        tags: JSON.stringify(normalizeEmployeeTags(data.tags)),
        isActive: data.isActive ?? true,
        passwordHash,
      },
      select: EMPLOYEE_SELECT_SAFE,
    });
  }

  async updateEmployee(slug: string, employeeId: string, data: UpdateEmployeeInput) {
    const tenant = await this.getTenantBySlug(slug);

    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    if (data.email) {
      const newEmail = data.email.trim().toLowerCase();
      if (newEmail !== employee.email) {
        const clash = await this.prisma.user.findUnique({ where: { email: newEmail } });
        if (clash && clash.id !== employee.id) {
          throw new ConflictException('Já existe um usuário com esse e-mail');
        }
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
    if (data.role !== undefined) updateData.role = data.role;
    if (data.position !== undefined) updateData.position = data.position?.trim() || null;
    if (data.tags !== undefined) updateData.tags = JSON.stringify(normalizeEmployeeTags(data.tags));
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) updateData.passwordHash = await argon2.hash(data.password);

    if (data.phone !== undefined) {
      if (!data.phone) {
        updateData.phone = null;
      } else {
        const digits = data.phone.replace(/\D/g, '');
        if (digits) {
          const without55 = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
          const normalized = `+55${without55}`;
          const phoneClash = await this.prisma.user.findFirst({
            where: {
              id: { not: employeeId },
              OR: [
                { phone: normalized },
                { phone: digits },
                { phone: without55 },
                { phone: data.phone.trim() },
              ],
            },
          });
          if (phoneClash) {
            throw new ConflictException('Já existe um usuário cadastrado com esse telefone');
          }
          updateData.phone = normalized;
        } else {
          updateData.phone = null;
        }
      }
    }

    return this.prisma.user.update({
      where: { id: employeeId },
      data: updateData,
      select: EMPLOYEE_SELECT_SAFE,
    });
  }

  async setEmployeeActive(slug: string, employeeId: string, isActive: boolean) {
    const tenant = await this.getTenantBySlug(slug);
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');
    return this.prisma.user.update({
      where: { id: employeeId },
      data: { isActive },
      select: EMPLOYEE_SELECT_SAFE,
    });
  }

  async deleteEmployee(slug: string, employeeId: string, actorId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: tenant.id },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    if (employee.id === actorId) {
      throw new BadRequestException('Você não pode remover o seu próprio usuário');
    }

    if (employee.role === 'TENANT_ADMIN') {
      const otherAdmins = await this.prisma.user.count({
        where: {
          tenantId: tenant.id,
          role: 'TENANT_ADMIN',
          isActive: true,
          id: { not: employee.id },
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException(
          'Não é possível remover o único administrador ativo da empresa',
        );
      }
    }

    await this.prisma.user.delete({ where: { id: employeeId } });
    return { ok: true, id: employeeId };
  }

  // ─── Barbeiros (Equipe + Comissões Reais) ─────────────────────────────────

  private async computeBarberMetrics(
    tenantId: string,
    userId: string,
    serviceRate: number,
    productRate: number,
    releaseOnFiadoPaid: boolean,
  ) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [completedMonth, pendingMonth, recentAppointments] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          staffId: userId,
          status: 'COMPLETED',
          scheduledAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
          id: true,
          priceCents: true,
          paymentMethod: true,
          scheduledAt: true,
          serviceName: true,
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          staffId: userId,
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          scheduledAt: { gte: monthStart, lt: monthEnd },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          staffId: userId,
          status: 'COMPLETED',
        },
        select: {
          id: true,
          priceCents: true,
          scheduledAt: true,
          serviceName: true,
        },
        orderBy: { scheduledAt: 'desc' },
        take: 5,
      }),
    ]);

    const sales = completedMonth.map((apt) => {
      const isFiado = (apt.paymentMethod || '').toUpperCase() === 'ON_CREDIT';
      return {
        type: 'SERVICE' as const,
        amount: apt.priceCents / 100,
        isFiado,
        isFiadoPaid: !isFiado,
      };
    });

    const commission = calculateBarberCommissions(sales, {
      serviceCommissionRate: serviceRate / 100,
      productCommissionRate: productRate / 100,
      releaseCommissionOnFiadoPaidOnly: releaseOnFiadoPaid,
    });

    return {
      commission,
      cutsCount: completedMonth.length,
      pendingAppointmentsCount: pendingMonth,
      recentAppointments: recentAppointments.map((apt) => ({
        id: apt.id,
        serviceName: apt.serviceName,
        scheduledAt: apt.scheduledAt,
        priceCents: apt.priceCents,
      })),
    };
  }

  private async enrichBarbers(tenantId: string, users: any[]) {
    return Promise.all(
      users.map(async (user) => {
        const profile = user.barberProfile;
        const serviceRate = profile?.serviceCommissionPct ?? 50;
        const productRate = profile?.productCommissionPct ?? 15;
        const releaseOnFiadoPaid = (profile?.commissionOnFiado ?? 'UPON_PAYMENT') === 'UPON_PAYMENT';
        const monthlyGoalCents = profile?.monthlyGoalCents ?? 0;

        const metrics = await this.computeBarberMetrics(
          tenantId,
          user.id,
          serviceRate,
          productRate,
          releaseOnFiadoPaid,
        );

        const revenueCents = Math.round(metrics.commission.totalRevenue * 100);
        const commissionCents = Math.round(metrics.commission.totalCommissionPaid * 100);
        const pendingCommissionCents = Math.round(metrics.commission.pendingFiadoCommission * 100);
        const progressPct =
          monthlyGoalCents > 0
            ? Math.min(100, Math.round((revenueCents / monthlyGoalCents) * 100))
            : 0;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          position: user.position,
          isActive: user.isActive,
          profile: profile
            ? {
                nickname: profile.nickname,
                specialty: profile.specialty,
                avatarColor: profile.avatarColor,
                serviceCommissionPct: serviceRate,
                productCommissionPct: productRate,
                commissionOnFiado: profile.commissionOnFiado,
                monthlyGoalCents,
                workingHoursLabel: profile.workingHoursLabel,
                status: profile.status,
              }
            : null,
          metrics: {
            cutsCount: metrics.cutsCount,
            pendingAppointmentsCount: metrics.pendingAppointmentsCount,
            currentMonthRevenueCents: revenueCents,
            currentMonthCommissionCents: commissionCents,
            pendingCommissionCents,
            serviceRevenueCents: Math.round(metrics.commission.serviceRevenue * 100),
            productRevenueCents: Math.round(metrics.commission.productRevenue * 100),
            progressPct,
            recentAppointments: metrics.recentAppointments,
          },
        };
      }),
    );
  }

  async getBarbers(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const users = await this.prisma.user.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { name: 'asc' },
      include: { barberProfile: true },
    });
    const barbers = await this.enrichBarbers(tenant.id, users);

    const totals = barbers.reduce(
      (acc, b) => ({
        revenueCents: acc.revenueCents + b.metrics.currentMonthRevenueCents,
        commissionCents: acc.commissionCents + b.metrics.currentMonthCommissionCents,
        cutsCount: acc.cutsCount + b.metrics.cutsCount,
        pendingCommissionCents:
          acc.pendingCommissionCents + b.metrics.pendingCommissionCents,
      }),
      { revenueCents: 0, commissionCents: 0, cutsCount: 0, pendingCommissionCents: 0 },
    );

    const houseProfitCents = totals.revenueCents - totals.commissionCents;
    const averageCommissionRate =
      totals.revenueCents > 0
        ? Number(((totals.commissionCents / totals.revenueCents) * 100).toFixed(1))
        : 0;

    return {
      barbers,
      totals: {
        ...totals,
        houseProfitCents,
        averageCommissionRate,
      },
    };
  }

  async getBarber(slug: string, barberId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findFirst({
      where: { id: barberId, tenantId: tenant.id },
      include: { barberProfile: true },
    });
    if (!user) throw new NotFoundException('Profissional não encontrado');
    const [barber] = await this.enrichBarbers(tenant.id, [user]);
    return barber;
  }

  async upsertBarberProfile(
    slug: string,
    barberId: string,
    data: UpsertBarberProfileInput,
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const user = await this.prisma.user.findFirst({
      where: { id: barberId, tenantId: tenant.id },
    });
    if (!user) throw new NotFoundException('Profissional não encontrado');

    const existing = await this.prisma.barberProfile.findUnique({
      where: { userId: barberId },
    });

    const payload = {
      nickname: data.nickname ?? null,
      specialty: data.specialty ?? null,
      avatarColor: data.avatarColor ?? existing?.avatarColor ?? '#10b981',
      serviceCommissionPct: data.serviceCommissionPct,
      productCommissionPct: data.productCommissionPct,
      commissionOnFiado: data.commissionOnFiado,
      monthlyGoalCents: data.monthlyGoalCents,
      workingHoursLabel: data.workingHoursLabel ?? null,
      status: data.status,
    };

    const profile = existing
      ? await this.prisma.barberProfile.update({
          where: { userId: barberId },
          data: payload,
        })
      : await this.prisma.barberProfile.create({
          data: { userId: barberId, ...payload },
        });

    return profile;
  }

  // ─── Supermercado: Estoque & Inventário ────────────────────────────────────

  async adjustStock(slug: string, productId: string, data: { newQuantity: number; reason: string }, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const product = await this.prisma.product.findUnique({
      where: { id: productId, tenantId: tenant.id },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const newQty = Number(data.newQuantity);
    const diff = newQty - Number(product.stockQuantity);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: newQty },
    });

    await this.prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId,
        type: 'ADJUSTMENT',
        quantity: diff,
        balanceAfter: newQty,
        notes: data.reason || 'Ajuste manual de estoque',
        operatorId: operatorId || null,
      },
    });

    return updated;
  }

  async getStockOverview(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    const totalProducts = products.length;
    let totalStockValueCents = 0;
    let totalSaleValueCents = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const p of products) {
      const qty = Number(p.stockQuantity);
      const cost = Number(p.costPriceCents) || 0;
      const sale = Number(p.salePriceCents) || 0;
      totalStockValueCents += Math.round(qty * cost);
      totalSaleValueCents += Math.round(qty * sale);
      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= Number(p.minStockAlert)) {
        lowStockCount++;
      }
    }

    return {
      products,
      summary: {
        totalProducts,
        totalStockValueCents,
        totalSaleValueCents,
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  async getStockLosses(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.stockLoss.findMany({
      where: { tenantId: tenant.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createStockLoss(
    slug: string,
    reportedById: string | undefined,
    data: { productId: string; quantity: number; reason: string; costCents?: number; notes?: string },
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const product = await this.prisma.product.findUnique({
      where: { id: data.productId, tenantId: tenant.id },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const qty = Number(data.quantity);
    const costCents = data.costCents ?? Math.round((Number(product.costPriceCents) || 0) * qty);

    const updatedProduct = await this.prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: { decrement: qty } },
    });

    const stockLoss = await this.prisma.stockLoss.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        quantity: qty,
        reason: data.reason,
        costCents,
        notes: data.notes || null,
        reportedById: reportedById || null,
      },
      include: { product: true },
    });

    await this.prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        type: 'LOSS_AVARIA',
        quantity: -qty,
        balanceAfter: Number(updatedProduct.stockQuantity),
        notes: `Perda (${data.reason}): ${data.notes || 'Sem observação'}`,
        referenceId: stockLoss.id,
        operatorId: reportedById || null,
      },
    });

    return stockLoss;
  }

  async getStockMovements(slug: string, productId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.stockMovement.findMany({
      where: {
        tenantId: tenant.id,
        ...(productId ? { productId } : {}),
      },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getInventoryAudits(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.inventoryAudit.findMany({
      where: { tenantId: tenant.id },
      include: {
        items: {
          include: { product: true },
          orderBy: { diffQty: 'asc' },
        },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async createInventoryAudit(slug: string, notes?: string) {
    const tenant = await this.getTenantBySlug(slug);

    // Se já houver um aberto, reaproveita
    const openAudit = await this.prisma.inventoryAudit.findFirst({
      where: { tenantId: tenant.id, status: 'OPEN' },
      include: { items: { include: { product: true } } },
    });
    if (openAudit) return openAudit;

    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id, isActive: true },
    });

    const audit = await this.prisma.inventoryAudit.create({
      data: {
        tenantId: tenant.id,
        status: 'OPEN',
        notes: notes || 'Inventário Geral de Estoque',
        items: {
          create: products.map((p) => ({
            productId: p.id,
            systemQty: Number(p.stockQuantity),
            countedQty: Number(p.stockQuantity),
            diffQty: 0,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    return audit;
  }

  async countInventoryItem(slug: string, auditId: string, data: { productId: string; countedQty: number }) {
    const tenant = await this.getTenantBySlug(slug);
    const audit = await this.prisma.inventoryAudit.findFirst({
      where: { id: auditId, tenantId: tenant.id, status: 'OPEN' },
    });
    if (!audit) throw new BadRequestException('Inventário não está aberto ou não foi encontrado');

    const item = await this.prisma.inventoryAuditItem.findFirst({
      where: { inventoryId: audit.id, productId: data.productId },
    });
    if (!item) throw new NotFoundException('Item não encontrado neste inventário');

    const counted = Number(data.countedQty);
    const diff = counted - Number(item.systemQty);

    return this.prisma.inventoryAuditItem.update({
      where: { id: item.id },
      data: {
        countedQty: counted,
        diffQty: diff,
      },
      include: { product: true },
    });
  }

  async reconcileInventory(slug: string, auditId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const audit = await this.prisma.inventoryAudit.findFirst({
      where: { id: auditId, tenantId: tenant.id, status: 'OPEN' },
      include: { items: true },
    });
    if (!audit) throw new BadRequestException('Inventário não encontrado ou já concluído');

    return this.prisma.$transaction(async (tx) => {
      for (const item of audit.items) {
        if (item.diffQty !== 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: item.countedQty },
          });

          await tx.stockMovement.create({
            data: {
              tenantId: tenant.id,
              productId: item.productId,
              type: 'ADJUSTMENT',
              quantity: item.diffQty,
              balanceAfter: item.countedQty,
              referenceId: audit.id,
              notes: `Conciliação de Inventário #${audit.id.slice(0, 8)}`,
              operatorId: operatorId || null,
            },
          });
        }
      }

      return tx.inventoryAudit.update({
        where: { id: audit.id },
        data: {
          status: 'COMPLETED',
          closedAt: new Date(),
        },
        include: { items: { include: { product: true } } },
      });
    });
  }

  // ─── Supermercado: Financeiro (Contas a Pagar & Receber) ────────────────────

  async getBillsPayable(slug: string, status?: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.billPayable.findMany({
      where: {
        tenantId: tenant.id,
        ...(status ? { status } : {}),
      },
      include: { supplier: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createBillPayable(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    // Conta fixa: `dueDay` (1-31) + `isRecurring`. Se vier sem `dueDate`, o
    // primeiro vencimento é o próximo `dueDay` — o gerente não precisa montar
    // data, só dizer "todo dia 10".
    const isRecurring = Boolean(data.isRecurring);
    const dueDayRaw = Number(data.dueDay);
    const dueDay = isRecurring && Number.isFinite(dueDayRaw) ? Math.min(31, Math.max(1, Math.floor(dueDayRaw))) : null;
    const dueDate = data.dueDate
      ? new Date(data.dueDate)
      : dueDay != null
        ? nextRecurringDueDate(dueDay)
        : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Informe a data de vencimento (ou o dia fixo da conta recorrente)');
    }
    return this.prisma.billPayable.create({
      data: {
        tenantId: tenant.id,
        supplierId: data.supplierId || null,
        description: data.description,
        category: data.category || 'FORNECEDOR',
        amountCents: Number(data.amountCents) || 0,
        dueDate,
        notes: data.notes || null,
        status: 'PENDING',
        isRecurring,
        dueDay,
      },
      include: { supplier: true },
    });
  }

  async payBill(slug: string, billId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const before = await this.prisma.billPayable.findFirst({
      where: { id: billId, tenantId: tenant.id },
    });
    if (!before) throw new NotFoundException('Conta a pagar não encontrada');
    if (before.status === 'PAID') {
      throw new BadRequestException('Esta conta já está marcada como paga');
    }

    const updated = await this.prisma.billPayable.update({
      where: { id: billId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    // Marcar como paga é irreversível pela interface e move o caixa: exige
    // trilha (matriz validada: CASHIER pode, com ⚠️).
    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_PAYABLE_PAID',
      targetType: 'BillPayable',
      targetId: billId,
      before: { status: before.status, paidAt: before.paidAt },
      after: { status: updated.status, paidAt: updated.paidAt },
    });

    // Conta fixa: a baixa gera sozinha a próxima ocorrência (dia fixo do mês
    // seguinte, mesmo valor). Sem isso o gerente teria que recadastrar
    // aluguel/energia todo mês — e esquecer vira rombo silencioso.
    let next: any = null;
    const dueDay = Number((before as any).dueDay);
    if ((before as any).isRecurring && Number.isFinite(dueDay) && dueDay >= 1) {
      next = await this.prisma.billPayable.create({
        data: {
          tenantId: tenant.id,
          supplierId: before.supplierId,
          description: before.description,
          category: before.category,
          amountCents: before.amountCents,
          dueDate: nextRecurringDueDate(dueDay, new Date()),
          notes: before.notes,
          status: 'PENDING',
          isRecurring: true,
          dueDay: Math.min(31, Math.max(1, Math.floor(dueDay))),
        },
      });
    }

    return { paid: updated, next };
  }

  async deleteBillPayable(slug: string, billId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const before = await this.prisma.billPayable.findFirst({
      where: { id: billId, tenantId: tenant.id },
    });
    if (!before) throw new NotFoundException('Conta a pagar não encontrada');

    await this.prisma.billPayable.delete({
      where: { id: billId, tenantId: tenant.id },
    });

    // Exclusão não tem "depois": a trilha guarda o registro inteiro que
    // deixou de existir, que é a única forma de reconstituí-lo.
    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_PAYABLE_DELETE',
      targetType: 'BillPayable',
      targetId: billId,
      before: {
        description: before.description,
        amountCents: before.amountCents,
        dueDate: before.dueDate,
        status: before.status,
        supplierId: before.supplierId,
      },
      after: null,
    });

    return { ok: true, id: billId };
  }

  async getBillsReceivable(slug: string, status?: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.billReceivable.findMany({
      where: {
        tenantId: tenant.id,
        ...(status ? { status } : {}),
      },
      include: {
        customer: true,
        order: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createBillReceivable(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const amountCents = Number(data.amountCents) || 0;
    const bill = await this.prisma.billReceivable.create({
      data: {
        tenantId: tenant.id,
        customerId: data.customerId || null,
        orderId: data.orderId || null,
        description: data.description,
        amountCents,
        dueDate: new Date(data.dueDate),
        type: data.type || 'FIADO',
        notes: data.notes || null,
        status: 'PENDING',
      },
      include: { customer: true },
    });

    if (data.customerId) {
      await this.prisma.customer.update({
        where: { id: data.customerId },
        data: { currentDebtCents: { increment: amountCents } },
      });
    }

    return bill;
  }

  async receiveBill(slug: string, billId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const bill = await this.prisma.billReceivable.findFirst({
      where: { id: billId, tenantId: tenant.id },
    });
    if (!bill) throw new NotFoundException('Conta a receber não encontrada');
    if (bill.status === 'RECEIVED') {
      throw new BadRequestException('Esta conta já está marcada como recebida');
    }

    const updated = await this.prisma.billReceivable.update({
      where: { id: billId },
      data: {
        status: 'RECEIVED',
        paidCents: bill.amountCents,
        receivedAt: new Date(),
      },
    });

    if (bill.customerId) {
      const remainder = Math.max(0, Number(bill.amountCents || 0) - Number((bill as any).paidCents || 0));
      if (remainder > 0) {
        await this.prisma.customer.update({
          where: { id: bill.customerId },
          data: { currentDebtCents: { decrement: remainder } },
        });
      }
    }

    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_RECEIVABLE_RECEIVED',
      targetType: 'BillReceivable',
      targetId: billId,
      before: { status: bill.status, receivedAt: bill.receivedAt },
      after: { status: updated.status, receivedAt: updated.receivedAt },
    });

    return updated;
  }

  async deleteBillReceivable(slug: string, billId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const before = await this.prisma.billReceivable.findFirst({
      where: { id: billId, tenantId: tenant.id },
    });
    if (!before) throw new NotFoundException('Conta a receber não encontrada');

    await this.prisma.billReceivable.delete({
      where: { id: billId, tenantId: tenant.id },
    });

    // Estorna do saldo devedor só o que ainda estava pendente.
    const pending = Math.max(0, Number((before as any).amountCents || 0) - Number((before as any).paidCents || 0));
    if ((before as any).customerId && pending > 0) {
      await this.prisma.customer.update({
        where: { id: (before as any).customerId },
        data: { currentDebtCents: { decrement: pending } },
      });
    }

    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_RECEIVABLE_DELETE',
      targetType: 'BillReceivable',
      targetId: billId,
      before: {
        description: before.description,
        amountCents: before.amountCents,
        dueDate: before.dueDate,
        status: before.status,
        customerId: before.customerId,
      },
      after: null,
    });

    return { ok: true, id: billId };
  }

  /**
   * Cadastra venda parcelada no crediário (Pagamentos Pendentes).
   *
   * Gera N parcelas (groupId único) com vencimentos pelo intervalo, abate o
   * valor pago na entrada das primeiras parcelas e soma o restante no saldo
   * devedor do cliente. Cliente pode vir pronto (customerId) ou ser criado
   * na hora (nome + telefone).
   */
  async createReceivableSale(slug: string, data: any, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const totalCents = Math.round(Number(data?.totalCents) || 0);
    if (totalCents <= 0) throw new BadRequestException('Informe o valor total da compra');
    const installmentsTotal = Math.min(60, Math.max(1, Math.round(Number(data?.installmentsTotal) || 1)));
    const initialPaid = Math.min(totalCents, Math.max(0, Math.round(Number(data?.initialPaidCents) || 0)));
    const intervalDays = Math.min(365, Math.max(0, Math.round(Number(data?.intervalDays) || 0)));
    const firstDue = data?.firstDueDate ? new Date(String(data.firstDueDate)) : new Date();
    if (Number.isNaN(firstDue.getTime())) throw new BadRequestException('Data do primeiro vencimento inválida');
    const description = String(data?.description || 'Venda parcelada').trim().slice(0, 120) || 'Venda parcelada';
    const paymentMethod = data?.paymentMethod ? String(data.paymentMethod).slice(0, 30) : null;
    const notes = data?.notes ? String(data.notes).slice(0, 500) : null;
    const purchaseDate = data?.purchaseDate ? new Date(String(data.purchaseDate)) : new Date();

    // Cliente: usa o existente ou cadastra na hora.
    let customerId: string | null = data?.customerId || null;
    if (!customerId && data?.customerName) {
      const name = String(data.customerName).trim();
      if (!name) throw new BadRequestException('Informe o cliente');
      const phone = data?.customerPhone ? String(data.customerPhone).replace(/\D/g, '') || null : null;
      let customer = phone
        ? await this.prisma.customer.findFirst({ where: { tenantId: tenant.id, phone } })
        : null;
      if (!customer) {
        customer = await this.prisma.customer.findFirst({ where: { tenantId: tenant.id, name } });
      }
      if (!customer) {
        customer = await this.prisma.customer.create({
          data: { tenantId: tenant.id, name: name.slice(0, 80), phone },
        });
      }
      customerId = customer.id;
    }
    if (!customerId) throw new BadRequestException('Informe o cliente');

    // Divide em parcelas (resto vai para a última).
    const base = Math.floor(totalCents / installmentsTotal);
    const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bills: any[] = [];
    for (let i = 0; i < installmentsTotal; i++) {
      const amount = i === installmentsTotal - 1 ? totalCents - base * (installmentsTotal - 1) : base;
      const due = new Date(firstDue);
      due.setDate(due.getDate() + i * intervalDays);
      bills.push({
        tenantId: tenant.id,
        customerId,
        orderId: data?.orderId || null,
        description: installmentsTotal > 1 ? `${description} (${i + 1}/${installmentsTotal})` : description,
        amountCents: amount,
        paidCents: 0,
        dueDate: due,
        purchaseDate: Number.isNaN(purchaseDate.getTime()) ? new Date() : purchaseDate,
        status: 'PENDING',
        type: 'FIADO',
        installmentNumber: i + 1,
        installmentsTotal,
        groupId,
        paymentMethod,
        notes,
      });
    }

    // Entrada: abate das primeiras parcelas em ordem.
    let remaining = initialPaid;
    const ledger: { billIndex: number; amountCents: number }[] = [];
    for (let i = 0; i < bills.length && remaining > 0; i++) {
      const take = Math.min(remaining, bills[i].amountCents);
      bills[i].paidCents = take;
      bills[i].status = take >= bills[i].amountCents ? 'RECEIVED' : 'PARTIAL';
      if (take >= bills[i].amountCents) bills[i].receivedAt = new Date();
      ledger.push({ billIndex: i, amountCents: take });
      remaining -= take;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows: any[] = [];
      for (const b of bills) {
        rows.push(await tx.billReceivable.create({ data: b }));
      }
      for (const entry of ledger) {
        await tx.receivablePayment.create({
          data: {
            tenantId: tenant.id,
            billReceivableId: rows[entry.billIndex].id,
            amountCents: entry.amountCents,
            method: paymentMethod,
            notes: 'Entrada no cadastro',
            operatorId: operatorId || null,
          },
        });
      }
      await tx.customer.update({
        where: { id: customerId as string },
        data: { currentDebtCents: { increment: totalCents - initialPaid } },
      });
      return rows;
    });

    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_RECEIVABLE_SALE_CREATED',
      targetType: 'BillReceivable',
      targetId: groupId,
      before: null,
      after: { totalCents, installmentsTotal, initialPaid, customerId },
    });

    return { groupId, bills: created };
  }

  /**
   * Registra recebimento (total ou parcial) numa parcela: valida o teto,
   * grava no histórico, soma no pago e atualiza status + saldo do cliente.
   */
  async payReceivable(
    slug: string,
    billId: string,
    data: { amountCents: number; method?: string; notes?: string },
    operatorId?: string,
  ) {
    const tenant = await this.getTenantBySlug(slug);
    const bill: any = await this.prisma.billReceivable.findFirst({
      where: { id: billId, tenantId: tenant.id },
    });
    if (!bill) throw new NotFoundException('Conta a receber não encontrada');
    if (bill.status === 'RECEIVED' || bill.status === 'CANCELED') {
      throw new BadRequestException('Esta parcela já está quitada ou cancelada');
    }
    const amountCents = Math.round(Number(data?.amountCents) || 0);
    if (amountCents <= 0) throw new BadRequestException('Informe um valor maior que zero');
    const pending = Math.max(0, Number(bill.amountCents || 0) - Number(bill.paidCents || 0));
    if (amountCents > pending) {
      throw new BadRequestException(`Valor acima do pendente (${(pending / 100).toFixed(2).replace('.', ',')})`);
    }

    const newPaid = Number(bill.paidCents || 0) + amountCents;
    const full = newPaid >= Number(bill.amountCents || 0);
    const method = data?.method ? String(data.method).slice(0, 30) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.receivablePayment.create({
        data: {
          tenantId: tenant.id,
          billReceivableId: billId,
          amountCents,
          method,
          notes: data?.notes ? String(data.notes).slice(0, 300) : null,
          operatorId: operatorId || null,
        },
      });
      const updated = await tx.billReceivable.update({
        where: { id: billId },
        data: {
          paidCents: newPaid,
          status: full ? 'RECEIVED' : 'PARTIAL',
          receivedAt: full ? new Date() : bill.receivedAt,
        },
        include: { customer: true, payments: { orderBy: { paidAt: 'desc' } } },
      });
      if (bill.customerId) {
        await tx.customer.update({
          where: { id: bill.customerId },
          data: { currentDebtCents: { decrement: amountCents } },
        });
      }
      return { payment, bill: updated };
    });

    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_RECEIVABLE_PAID',
      targetType: 'BillReceivable',
      targetId: billId,
      before: { paidCents: Number(bill.paidCents || 0), status: bill.status },
      after: { paidCents: newPaid, status: full ? 'RECEIVED' : 'PARTIAL', amountCents },
    });

    return result;
  }

  /**
   * Exclui uma venda parcelada inteira (todas as parcelas do grupo) e
   * estorna o restante pendente do saldo do cliente.
   */
  async deleteReceivableGroup(slug: string, groupId: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const bills: any[] = await this.prisma.billReceivable.findMany({
      where: { groupId, tenantId: tenant.id },
    });
    if (bills.length === 0) throw new NotFoundException('Venda parcelada não encontrada');

    const byCustomer = new Map<string, number>();
    for (const b of bills) {
      if (!b.customerId) continue;
      const pending = Math.max(0, Number(b.amountCents || 0) - Number(b.paidCents || 0));
      byCustomer.set(b.customerId, (byCustomer.get(b.customerId) || 0) + pending);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.billReceivable.deleteMany({ where: { groupId, tenantId: tenant.id } });
      for (const [customerId, pending] of byCustomer) {
        if (pending > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { currentDebtCents: { decrement: pending } },
          });
        }
      }
    });

    await this.audit.recordChangeSafe({
      userId: operatorId,
      action: 'BILL_RECEIVABLE_GROUP_DELETE',
      targetType: 'BillReceivable',
      targetId: groupId,
      before: { count: bills.length },
      after: null,
    });

    return { ok: true, groupId, removed: bills.length };
  }

  async getCashFlow(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [orders, receivedBills, paidBills, pendingReceivables, pendingPayables] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId: tenant.id, createdAt: { gte: startOfMonth }, status: { not: 'CANCELED' } },
        select: { totalCents: true, createdAt: true, paymentMethod: true },
      }),
      this.prisma.billReceivable.findMany({
        where: { tenantId: tenant.id, status: 'RECEIVED', receivedAt: { gte: startOfMonth } },
        select: { amountCents: true, receivedAt: true },
      }),
      this.prisma.billPayable.findMany({
        where: { tenantId: tenant.id, status: 'PAID', paidAt: { gte: startOfMonth } },
        select: { amountCents: true, paidAt: true, category: true },
      }),
      this.prisma.billReceivable.findMany({
        where: { tenantId: tenant.id, status: 'PENDING' },
        select: { amountCents: true, dueDate: true },
      }),
      this.prisma.billPayable.findMany({
        where: { tenantId: tenant.id, status: 'PENDING' },
        select: { amountCents: true, dueDate: true },
      }),
    ]);

    const isFiado = (method: string) => ['FIADO', 'ON_CREDIT'].includes((method || '').toUpperCase());

    // Vendas à vista entram no caixa imediatamente.
    const immediateSalesTotalCents = orders
      .filter((o) => !isFiado(o.paymentMethod))
      .reduce((sum, o) => sum + o.totalCents, 0);

    const fiadoSalesTotalCents = orders
      .filter((o) => isFiado(o.paymentMethod))
      .reduce((sum, o) => sum + o.totalCents, 0);

    // Vendas a prazo (fiado) só geram entrada de caixa real quando o título é liquidado (RECEIVED):
    const receivedBillsTotalCents = receivedBills.reduce((sum, b) => sum + b.amountCents, 0);
    const totalInflowCents = immediateSalesTotalCents + receivedBillsTotalCents;

    const paidBillsTotalCents = paidBills.reduce((sum, b) => sum + b.amountCents, 0);
    const totalOutflowCents = paidBillsTotalCents;

    const netBalanceCents = totalInflowCents - totalOutflowCents;
    const pendingInflowCents = pendingReceivables.reduce((sum, b) => sum + b.amountCents, 0);
    const pendingOutflowCents = pendingPayables.reduce((sum, b) => sum + b.amountCents, 0);

    return {
      totalInflowCents,
      totalOutflowCents,
      netBalanceCents,
      pendingInflowCents,
      pendingOutflowCents,
      projectedBalanceCents: netBalanceCents + pendingInflowCents - pendingOutflowCents,
      immediateSalesTotalCents,
      fiadoSalesTotalCents,
      recentTransactions: [
        ...orders.slice(-10).map((o) => ({
          type: 'INFLOW',
          description: isFiado(o.paymentMethod) ? `Venda a Prazo (Fiado)` : `Venda no PDV (${o.paymentMethod})`,
          amountCents: o.totalCents,
          date: o.createdAt,
        })),
        ...paidBills.slice(-10).map((b) => ({
          type: 'OUTFLOW',
          description: `Pagamento: ${b.category}`,
          amountCents: b.amountCents,
          date: b.paidAt,
        })),
      ].sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime()),
    };
  }

  // ─── Supermercado: Operação PDV & Devoluções ───────────────────────────────

  async authorizeManager(slug: string, pin: string, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const setting = await this.prisma.storeSetting.findUnique({
      where: { tenantId: tenant.id },
    });
    const validPin = setting?.managerPin || '1234';

    if (pin === validPin) {
      // Toda aprovação por PIN fica registrada: é o que sustenta a regra R3
      // ("correção fora da janela exige aprovação de um papel superior").
      // Sem esta trilha, não há como provar quem autorizou o quê.
      await this.audit.recordChangeSafe({
        userId: operatorId,
        action: 'MANAGER_PIN_AUTHORIZED',
        targetType: 'StoreSettings',
        targetId: tenant.id,
        before: null,
        after: { authorized: true },
      });
      return { authorized: true };
    }

    throw new UnauthorizedException('PIN de gerente inválido');
  }

  async cancelOrder(slug: string, orderId: string, reason: string, authorizedById?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId: tenant.id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Venda não encontrada');
    if (order.status === 'CANCELED') throw new BadRequestException('Esta venda já está cancelada');

    return this.prisma.$transaction(async (tx) => {
      // Devolver itens ao estoque
      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: item.productId,
            type: 'RETURN',
            quantity: item.quantity,
            balanceAfter: Number(updated.stockQuantity),
            referenceId: order.id,
            notes: `Cancelamento de Venda #${order.orderNumber}: ${reason}`,
            operatorId: authorizedById || null,
          },
        });
      }

      // Estornar dados do cliente
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            orderCount: { decrement: 1 },
            totalSpent: { decrement: order.totalCents },
          },
        });

        // Se era fiado pendente, cancela
        const receivable = await tx.billReceivable.findFirst({
          where: { orderId: order.id, status: 'PENDING' },
        });
        if (receivable) {
          await tx.billReceivable.update({
            where: { id: receivable.id },
            data: { status: 'CANCELED' },
          });
          await tx.customer.update({
            where: { id: order.customerId },
            data: { currentDebtCents: { decrement: receivable.amountCents } },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELED',
          notes: `${order.notes || ''} [CANCELADA: ${reason}]`,
        },
      });
    });
  }

  async getOrderReturns(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    return this.prisma.orderReturn.findMany({
      where: { tenantId: tenant.id },
      include: { order: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createOrderReturn(slug: string, data: any, operatorId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const orderReturn = await this.prisma.orderReturn.create({
      data: {
        tenantId: tenant.id,
        orderId: data.orderId || null,
        customerId: data.customerId || null,
        reason: data.reason,
        refundMethod: data.refundMethod || 'CREDIT',
        totalRefundCents: Number(data.totalRefundCents) || 0,
        itemsSummary: data.itemsSummary || null,
        authorizedById: operatorId || null,
      },
      include: { order: true, customer: true },
    });

    // Se itens foram devolvidos ao estoque
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.productId && item.quantity > 0) {
          const updated = await this.prisma.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: Number(item.quantity) } },
          });

          await this.prisma.stockMovement.create({
            data: {
              tenantId: tenant.id,
              productId: item.productId,
              type: 'RETURN',
              quantity: Number(item.quantity),
              balanceAfter: Number(updated.stockQuantity),
              referenceId: orderReturn.id,
              notes: `Devolução PDV: ${data.reason}`,
              operatorId: operatorId || null,
            },
          });
        }
      }
    }

    return orderReturn;
  }

  // ─── Supermercado: Relatórios Consolidados ─────────────────────────────────

  async getReportsSummary(slug: string, period = 'today') {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'yesterday') {
      startDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [orders, losses, products] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: startDate },
          status: { not: 'CANCELED' },
        },
        include: { items: { include: { product: true } } },
      }),
      this.prisma.stockLoss.findMany({
        where: { tenantId: tenant.id, createdAt: { gte: startDate } },
      }),
      this.prisma.product.findMany({
        where: { tenantId: tenant.id },
      }),
    ]);

    const totalSalesCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const totalOrdersCount = orders.length;
    const averageTicketCents = totalOrdersCount > 0 ? Math.round(totalSalesCents / totalOrdersCount) : 0;

    // Por forma de pagamento
    const paymentMethods: Record<string, { count: number; totalCents: number }> = {};
    for (const o of orders) {
      const pm = o.paymentMethod || 'OTHER';
      if (!paymentMethods[pm]) paymentMethods[pm] = { count: 0, totalCents: 0 };
      paymentMethods[pm].count++;
      paymentMethods[pm].totalCents += o.totalCents;
    }

    // Ranking de produtos
    const productStats: Record<string, { name: string; quantity: number; revenueCents: number; costCents: number }> = {};
    for (const o of orders) {
      for (const item of o.items) {
        const pid = item.productId;
        if (!productStats[pid]) {
          productStats[pid] = {
            name: item.product?.name || 'Item',
            quantity: 0,
            revenueCents: 0,
            costCents: 0,
          };
        }
        productStats[pid].quantity += item.quantity;
        productStats[pid].revenueCents += item.totalPrice;
        productStats[pid].costCents += Math.round((Number(item.product?.costPriceCents) || 0) * item.quantity);
      }
    }

    const sortedProducts = Object.values(productStats).sort((a, b) => b.revenueCents - a.revenueCents);
    const topProducts = sortedProducts.slice(0, 10);
    const bottomProducts = Object.values(productStats).sort((a, b) => a.quantity - b.quantity).slice(0, 5);

    const totalCostCents = sortedProducts.reduce((s, p) => s + p.costCents, 0);
    const grossProfitCents = totalSalesCents - totalCostCents;
    const profitMarginPct = totalSalesCents > 0 ? Number(((grossProfitCents / totalSalesCents) * 100).toFixed(1)) : 0;
    const totalLossesCents = losses.reduce((s, l) => s + l.costCents, 0);

    return {
      period,
      totalSalesCents,
      totalOrdersCount,
      averageTicketCents,
      grossProfitCents,
      profitMarginPct,
      totalLossesCents,
      paymentMethods,
      topProducts,
      bottomProducts,
    };
  }

  /**
   * Fechamento do período para impressão térmica (prestação de contas).
   *
   * Uma única consolidação com TODAS as vendas do período: PDV/balcão
   * (`tenantId`), mesas/comandas e QR (`companyId`) e delivery/online — tudo
   * vive na mesma tabela `Order`, então o `OR` abaixo é o que garante que nada
   * fica de fora. Cancelados (`CANCELLED`/`CANCELED`, as duas grafias que
   * circulam no banco) ficam de fora: não entraram no caixa.
   *
   * A ordem é a sequência de finalização (`createdAt` crescente): a Nota 1 é a
   * primeira venda do período e o rodapé totaliza por meio de pagamento +
   * geral, abate as despesas pagas (saldo líquido) e lista os alertas de contas.
   */
  async getDayClosing(slug: string, periodRaw: unknown = 'today') {
    const tenant = await this.getTenantBySlug(slug);
    const now = new Date();
    const period = parseClosingPeriod(periodRaw);
    const periodStart = closingPeriodStart(period, now);

    const [orders, paidBills, openBills] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
          createdAt: { gte: periodStart },
          status: { notIn: ['CANCELLED', 'CANCELED'] },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          customer: { select: { id: true, name: true } },
          table: { select: { id: true, number: true, label: true } },
          tableSession: { select: { id: true, comandaName: true } },
          items: {
            include: { product: { select: { id: true, name: true } } },
            orderBy: { id: 'asc' },
          },
        },
      }),
      // Despesas PAGAS no período: são elas que abatem o faturamento.
      this.prisma.billPayable.findMany({
        where: {
          tenantId: tenant.id,
          status: 'PAID',
          paidAt: { gte: periodStart, lte: now },
        },
        orderBy: { paidAt: 'asc' },
      }),
      // Despesas em aberto (a pagar): entram no relatório como compromisso.
      this.prisma.billPayable.findMany({
        where: { tenantId: tenant.id, status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const notes = orders.map((o: any, idx: number) => {
      const method = normalizePaymentMethodOrOther(o.paymentMethod);
      const items = (o.items || []).map((it: any) => ({
        quantity: Number(it.quantity ?? 0),
        name: it.product?.name || 'Item',
        subtotalCents: Number(it.totalPrice ?? 0),
      }));
      // Identificação: cliente cadastrado → nome da comanda → mesa → genérico.
      const clientName =
        o.customer?.name ||
        o.tableSession?.comandaName ||
        o.table?.label ||
        (o.table?.number != null ? `Mesa ${o.table.number}` : null) ||
        'Consumidor';
      const origin =
        o.origin === 'QR_CODE'
          ? 'QR do cliente'
          : o.origin === 'TABLET'
            ? 'Tablet da mesa'
            : o.origin === 'WAITER'
              ? 'Salão (garçom)'
              : o.origin === 'DELIVERY'
                ? 'Delivery/online'
                : o.origin === 'POS' || !o.origin
                  ? 'Balcão (PDV)'
                  : String(o.origin);
      return {
        seq: idx + 1,
        orderId: o.id,
        orderNumber: o.orderNumber,
        clientName,
        origin,
        tableLabel: o.table?.label || (o.table?.number != null ? `Mesa ${o.table.number}` : null),
        paymentMethod: method,
        paymentLabel: paymentMethodLabel(method),
        items,
        totalCents: Number(o.totalCents ?? 0),
        createdAt: o.createdAt,
      };
    });

    const { totals, grandTotalCents } = summarizeClosing(notes);

    const paidExpenses = paidBills.map((b: any) => ({
      id: b.id,
      description: b.description,
      category: b.category,
      amountCents: Number(b.amountCents ?? 0),
      paidAt: b.paidAt,
      isRecurring: Boolean((b as any).isRecurring),
    }));
    const pendingExpenses = openBills.map((b: any) => ({
      id: b.id,
      description: b.description,
      category: b.category,
      amountCents: Number(b.amountCents ?? 0),
      dueDate: b.dueDate,
      status: b.status,
      isRecurring: Boolean((b as any).isRecurring),
    }));
    const expensesPaidCents = paidExpenses.reduce((s, e) => s + e.amountCents, 0);
    const expensesPendingCents = pendingExpenses.reduce((s, e) => s + e.amountCents, 0);
    // Saldo líquido do período: faturamento menos o que saiu em despesas pagas.
    const netTotalCents = grandTotalCents - expensesPaidCents;

    const alerts = this.buildBillAlerts(openBills, now);

    let settings: any = null;
    try {
      settings = await this.getStoreSettings(slug);
    } catch {
      settings = null;
    }

    return {
      generatedAt: now,
      period,
      periodLabel: CLOSING_PERIOD_LABELS[period],
      date: periodStart,
      store: {
        name: settings?.storeName || tenant.companyName,
        legalName: settings?.legalName || null,
        cnpj: settings?.cnpj || (tenant as any)?.cnpj || null,
        address: settings?.address || (tenant as any)?.address || null,
        phone: settings?.phone || (tenant as any)?.phone || null,
        thermalPrinter: settings?.thermalPrinter || '80mm',
      },
      count: notes.length,
      notes,
      totals,
      grandTotalCents,
      expenses: {
        paidTotalCents: expensesPaidCents,
        pendingTotalCents: expensesPendingCents,
        paid: paidExpenses,
        pending: pendingExpenses,
      },
      netTotalCents,
      alerts,
    };
  }

  /**
   * Alertas de contas a pagar: vencidas e vencendo HOJE são críticas (aviso
   * crítico em tela na data exata); vencendo em até 3 dias são aviso.
   */
  buildBillAlerts(openBills: any[], now = new Date()) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const in3Days = new Date(startOfToday.getTime() + 4 * 24 * 60 * 60 * 1000);

    const shape = (b: any, severity: 'critical' | 'warning', daysUntil: number) => ({
      id: b.id,
      description: b.description,
      category: b.category,
      amountCents: Number(b.amountCents ?? 0),
      dueDate: b.dueDate,
      status: b.status,
      isRecurring: Boolean(b.isRecurring),
      severity,
      daysUntil,
    });

    const overdue: any[] = [];
    const dueToday: any[] = [];
    const dueSoon: any[] = [];
    for (const b of openBills) {
      const due = new Date(b.dueDate);
      const daysUntil = Math.floor((due.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
      if (due < startOfToday) overdue.push(shape(b, 'critical', daysUntil));
      else if (due < startOfTomorrow) dueToday.push(shape(b, 'critical', 0));
      else if (due < in3Days) dueSoon.push(shape(b, 'warning', daysUntil));
    }
    return { overdue, dueToday, dueSoon };
  }

  /** Alertas puros para o painel (reuso na tela de contas a pagar). */
  async getBillsAlerts(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const openBills = await this.prisma.billPayable.findMany({
      where: { tenantId: tenant.id, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
    });
    return this.buildBillAlerts(openBills);
  }

  /**
   * Salva o fechamento no histórico. Os totais são RECALCULADOS aqui (nunca
   * confiados no que o front manda) e a foto completa vai em `snapshotJson`
   * para consulta e reimpressão futura.
   *
   * Idempotente por dia+período: salvar duas vezes no mesmo dia atualiza o
   * registro em vez de duplicar (o gerente refez o fechamento após uma venda
   * tardia — cenário normal).
   */
  async saveCashClosing(slug: string, periodRaw: unknown, operatorName?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const closing: any = await this.getDayClosing(slug, periodRaw);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const data = {
      tenantId: tenant.id,
      period: String(closing.period).toUpperCase(),
      periodStart: new Date(closing.date),
      periodEnd: now,
      notesCount: closing.count,
      grandTotalCents: closing.grandTotalCents,
      totalsJson: JSON.stringify(closing.totals),
      expensesPaidCents: closing.expenses.paidTotalCents,
      expensesPendingCents: closing.expenses.pendingTotalCents,
      netTotalCents: closing.netTotalCents,
      snapshotJson: JSON.stringify(closing),
      createdByName: operatorName?.trim()?.slice(0, 80) || null,
    };

    const existing = await this.prisma.cashClosing.findFirst({
      where: { tenantId: tenant.id, period: data.period, createdAt: { gte: todayStart } },
    });

    if (existing) {
      const updated = await this.prisma.cashClosing.update({
        where: { id: existing.id },
        data,
      });
      return { closing: updated, updated: true };
    }
    const created = await this.prisma.cashClosing.create({ data });
    return { closing: created, updated: false };
  }

  /** Histórico de fechamentos (sem o snapshot pesado — só metadados). */
  async listCashClosings(slug: string, limit = 30) {
    const tenant = await this.getTenantBySlug(slug);
    const rows = await this.prisma.cashClosing.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Number(limit) || 30)),
      select: {
        id: true,
        period: true,
        periodStart: true,
        periodEnd: true,
        notesCount: true,
        grandTotalCents: true,
        totalsJson: true,
        expensesPaidCents: true,
        expensesPendingCents: true,
        netTotalCents: true,
        createdByName: true,
        createdAt: true,
      },
    });
    return rows.map((r: any) => ({ ...r, totals: JSON.parse(r.totalsJson || '{}') }));
  }

  /** Um fechamento salvo, com snapshot completo para consulta/reimpressão. */
  async getCashClosing(slug: string, closingId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const row: any = await this.prisma.cashClosing.findFirst({
      where: { id: closingId, tenantId: tenant.id },
    });
    if (!row) throw new NotFoundException('Fechamento não encontrado');
    return { ...row, snapshot: JSON.parse(row.snapshotJson || '{}') };
  }

  // ─── Supermercado: Configurações da Loja ───────────────────────────────────

  async getStoreSettings(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    let settings = await this.prisma.storeSetting.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!settings) {
      settings = await this.prisma.storeSetting.create({
        data: {
          tenantId: tenant.id,
          storeName: tenant.companyName,
          legalName: tenant.companyName,
          cnpj: tenant.cnpj || null,
          thermalPrinter: '80mm',
          fiscalType: 'SIMPLES_NACIONAL',
          nfceEnvironment: 'HOMOLOGATION',
          maxCashierDiscount: 10,
          managerPin: '1234',
          enabledPaymentMethods: 'DINHEIRO,PIX,CARTAO_DEBITO,CARTAO_CREDITO,VALE,FIADO',
        },
      });
    }

    return settings;
  }

  /**
   * Lê as configurações da loja e diz se o PIX está pronto para uso.
   *
   * O `pixStatus` existe porque a tela de pagamento precisa decidir entre
   * mostrar o QR ou um aviso de "cadastre a chave" — e essa decisão não pode
   * ser feita no front sem repetir a validação de dígito verificador, que é
   * justamente o que gera o QR inválido.
   */
  async getStoreSettingsWithPix(slug: string) {
    const settings = await this.getStoreSettings(slug);
    const pixValidation = validatePixKey(settings.pixKey);
    return {
      ...settings,
      // `pixKey` continua sendo devolvida como cadastrada (o dono precisa
      // conferir o que digitou) — a validação vai em campo separado.
      pixStatus: {
        configured: Boolean(settings.pixKey),
        valid: pixValidation.valid,
        type: pixValidation.type,
        reason: pixValidation.reason ?? null,
        keyNormalized: settings.pixKey ? normalizePixKey(settings.pixKey) : null,
      },
    };
  }

  /**
   * Gera o BR Code PIX para um valor. Usado pela tela de pagamento para
   * renderizar o QR Code sem depender de PSP externo.
   *
   * Devolve `{ available: false, reason }` quando a chave não está cadastrada
   * ou é inválida — nunca lança, porque a venda em dinheiro/cartão continua
   * funcionando mesmo sem PIX configurado.
   */
  async generatePixCharge(slug: string, amountCents: number, txid?: string, description?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const settings = await this.prisma.storeSetting.findUnique({
      where: { tenantId: tenant.id },
    });

    const pixKey = settings?.pixKey ?? null;
    const validation = validatePixKey(pixKey);
    if (!validation.valid) {
      return { available: false, reason: validation.reason ?? 'Chave PIX não cadastrada.', amountCents };
    }

    const amount = Number(amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { available: false, reason: 'Valor inválido para cobrança PIX.', amountCents };
    }

    const brCode = buildPixBrCode({
      pixKey: pixKey as string,
      merchantName: settings?.pixReceiverName || settings?.storeName || tenant.companyName,
      merchantCity: settings?.pixReceiverCity,
      amountCents: amount,
      txid,
      description,
    });

    if (!brCode) {
      return { available: false, reason: 'Não foi possível gerar o QR Code. Verifique a chave PIX.', amountCents };
    }

    return {
      available: true,
      amountCents: amount,
      payload: brCode.payload,
      keyType: brCode.keyType,
      // O recebedor volta pronto para a tela exibir "Pix para <nome>".
      receiverName: settings?.pixReceiverName || settings?.storeName || tenant.companyName,
    };
  }

  async updateStoreSettings(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    // A chave PIX é validada na escrita para o erro aparecer no formulário
    // (com a explicação do dígito verificador) em vez de virar um QR quebrado
    // no caixa na hora de receber.
    let pixKeyPatch: { pixKey?: string | null } = {};
    if (data.pixKey !== undefined) {
      const raw = typeof data.pixKey === 'string' ? data.pixKey.trim() : '';
      if (!raw) {
        pixKeyPatch = { pixKey: null };
      } else {
        const check = validatePixKey(raw);
        if (!check.valid) {
          throw new BadRequestException(check.reason ?? 'Chave PIX inválida.');
        }
        pixKeyPatch = { pixKey: raw };
      }
    }

    return this.prisma.storeSetting.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        storeName: data.storeName ?? tenant.companyName,
        legalName: data.legalName ?? tenant.companyName,
        cnpj: data.cnpj ?? tenant.cnpj,
        stateRegistration: data.stateRegistration ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        thermalPrinter: data.thermalPrinter ?? '80mm',
        fiscalType: data.fiscalType ?? 'SIMPLES_NACIONAL',
        nfceEnvironment: data.nfceEnvironment ?? 'HOMOLOGATION',
        nfceCscId: data.nfceCscId ?? null,
        nfceCscToken: data.nfceCscToken ?? null,
        maxCashierDiscount: data.maxCashierDiscount !== undefined ? Number(data.maxCashierDiscount) : 10,
        managerPin: data.managerPin ?? '1234',
        enabledPaymentMethods: data.enabledPaymentMethods ?? 'DINHEIRO,PIX,CARTAO_DEBITO,CARTAO_CREDITO,VALE,FIADO',
        pixKey: pixKeyPatch.pixKey ?? null,
        pixReceiverName: data.pixReceiverName ?? data.storeName ?? tenant.companyName,
        pixReceiverCity: data.pixReceiverCity ?? null,
      },
      update: {
        storeName: data.storeName,
        legalName: data.legalName,
        cnpj: data.cnpj,
        stateRegistration: data.stateRegistration,
        address: data.address,
        phone: data.phone,
        thermalPrinter: data.thermalPrinter,
        fiscalType: data.fiscalType,
        nfceEnvironment: data.nfceEnvironment,
        nfceCscId: data.nfceCscId,
        nfceCscToken: data.nfceCscToken,
        maxCashierDiscount: data.maxCashierDiscount !== undefined ? Number(data.maxCashierDiscount) : undefined,
        managerPin: data.managerPin,
        enabledPaymentMethods: data.enabledPaymentMethods,
        // Só sobrescreve a chave quando ela veio no payload: um PUT parcial
        // vindo de outra tela (que não conhece esse campo) apagaria o cadastro.
        ...pixKeyPatch,
        pixReceiverName: data.pixReceiverName,
        pixReceiverCity: data.pixReceiverCity,
      },
    });
  }

  // ─── Logo do estabelecimento (Personalização) ──────────────────────────────

  /**
   * Lê a logo atual da empresa.
   * `logoUrl: null` significa "sem logo" — a UI mostra a padrão.
   */
  async getBrandingLogo(slug: string) {
    const tenant = await this.getTenantBySlug(slug);
    const company = await this.prisma.company.findUnique({
      where: { id: tenant.id },
      select: { branding: true },
    });

    return { logoUrl: readLogoFromBranding(this.parseBrandingSafe(company?.branding)) };
  }

  /**
   * Define a logo da empresa a partir de um data URL validado.
   *
   * O `branding` é um JSON compartilhado com outras chaves (tema, setup, flags
   * de QR/tablet). Por isso o update faz merge em vez de sobrescrever — trocar
   * a logo não pode apagar a cor do painel nem as configurações de mesa.
   */
  async updateBrandingLogo(slug: string, dataUrl: unknown) {
    const tenant = await this.getTenantBySlug(slug);

    const validation = validateLogoDataUrl(dataUrl);
    if (!validation.ok) {
      throw new BadRequestException(validation.message);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: tenant.id },
      select: { branding: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const branding = {
      ...this.parseBrandingSafe(company.branding),
      logoUrl: validation.dataUrl,
      logoMime: validation.mime,
      logoUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.company.update({
      where: { id: tenant.id },
      data: { branding: JSON.stringify(branding) },
    });

    return {
      logoUrl: validation.dataUrl,
      mime: validation.mime,
      bytes: validation.bytes,
    };
  }

  /** Remove a logo, voltando à padrão. O restante do branding é preservado. */
  async removeBrandingLogo(slug: string) {
    const tenant = await this.getTenantBySlug(slug);

    const company = await this.prisma.company.findUnique({
      where: { id: tenant.id },
      select: { branding: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const branding = this.parseBrandingSafe(company.branding);
    delete branding.logoUrl;
    delete branding.logoMime;
    branding.logoUpdatedAt = new Date().toISOString();

    await this.prisma.company.update({
      where: { id: tenant.id },
      data: { branding: JSON.stringify(branding) },
    });

    return { logoUrl: null };
  }

  /**
   * Lê o campo `branding` com tolerância a JSON inválido.
   * Um valor corrompido no banco não pode derrubar a personalização.
   */
  private parseBrandingSafe(raw: string | null | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      // JSON corrompido não pode derrubar a personalização.
      return {};
    }
  }

  // ─── Central de Personalização & Modais de Pedido ─────────────────────────

  async getModifierGroups(slug: string, productId?: string) {
    const tenant = await this.getTenantBySlug(slug);
    const where: any = {
      product: {
        OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
      },
    };
    if (productId) {
      where.productId = productId;
    }

    const groups = await this.prisma.productModifierGroup.findMany({
      where,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        product: {
          select: { id: true, name: true, categoryId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { groups };
  }

  async createModifierGroup(slug: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);

    let targetProductId = data.productId;
    if (targetProductId) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: targetProductId,
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      });
      if (!product) {
        throw new NotFoundException('Produto de destino não encontrado');
      }
    } else {
      const anyProduct = await this.prisma.product.findFirst({
        where: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      });
      if (!anyProduct) {
        throw new BadRequestException('Cadastre pelo menos um produto no cardápio antes de configurar grupos de personalização');
      }
      targetProductId = anyProduct.id;
    }

    const group = await this.prisma.productModifierGroup.create({
      data: {
        productId: targetProductId,
        name: data.name.trim(),
        minSelectable: Number(data.minSelectable ?? 0),
        maxSelectable: Number(data.maxSelectable ?? 1),
        isRequired: Boolean(data.isRequired),
        items: Array.isArray(data.items) && data.items.length > 0 ? {
          create: data.items.map((item: any) => ({
            name: item.name.trim(),
            priceCents: Math.round(Number(item.priceCents || 0)),
          })),
        } : undefined,
      },
      include: {
        items: true,
        product: { select: { id: true, name: true } },
      },
    });

    if (Array.isArray(data.additionalProductIds) && data.additionalProductIds.length > 0) {
      for (const extraProdId of data.additionalProductIds) {
        if (extraProdId !== targetProductId) {
          await this.prisma.productModifierGroup.create({
            data: {
              productId: extraProdId,
              name: data.name.trim(),
              minSelectable: Number(data.minSelectable ?? 0),
              maxSelectable: Number(data.maxSelectable ?? 1),
              isRequired: Boolean(data.isRequired),
              items: Array.isArray(data.items) && data.items.length > 0 ? {
                create: data.items.map((item: any) => ({
                  name: item.name.trim(),
                  priceCents: Math.round(Number(item.priceCents || 0)),
                })),
              } : undefined,
            },
          });
        }
      }
    }

    return group;
  }

  async updateModifierGroup(slug: string, groupId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const existing = await this.prisma.productModifierGroup.findFirst({
      where: {
        id: groupId,
        product: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Grupo de modificadores não encontrado');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.minSelectable !== undefined) updateData.minSelectable = Number(data.minSelectable);
    if (data.maxSelectable !== undefined) updateData.maxSelectable = Number(data.maxSelectable);
    if (data.isRequired !== undefined) updateData.isRequired = Boolean(data.isRequired);
    if (data.productId !== undefined) updateData.productId = data.productId;

    return this.prisma.productModifierGroup.update({
      where: { id: groupId },
      data: updateData,
      include: {
        items: true,
        product: { select: { id: true, name: true } },
      },
    });
  }

  async deleteModifierGroup(slug: string, groupId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const existing = await this.prisma.productModifierGroup.findFirst({
      where: {
        id: groupId,
        product: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Grupo de modificadores não encontrado');
    }

    await this.prisma.productModifierGroup.delete({
      where: { id: groupId },
    });

    return { success: true };
  }

  async addModifierItem(slug: string, groupId: string, data: any) {
    const tenant = await this.getTenantBySlug(slug);
    const group = await this.prisma.productModifierGroup.findFirst({
      where: {
        id: groupId,
        product: {
          OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo de modificadores não encontrado');
    }

    return this.prisma.productModifierItem.create({
      data: {
        groupId: group.id,
        name: data.name.trim(),
        priceCents: Math.round(Number(data.priceCents || 0)),
      },
    });
  }

  async deleteModifierItem(slug: string, groupId: string, itemId: string) {
    const tenant = await this.getTenantBySlug(slug);
    const item = await this.prisma.productModifierItem.findFirst({
      where: {
        id: itemId,
        groupId,
        group: {
          product: {
            OR: [{ tenantId: tenant.id }, { companyId: tenant.id }],
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Opção de modificador não encontrada');
    }

    await this.prisma.productModifierItem.delete({
      where: { id: itemId },
    });

    return { success: true };
  }

  // ─── Módulo de Notas de Compra (ERP & Gastro) ─────────────────────────────

  private async getEntityIds(slug: string) {
    const s = slug.toLowerCase();
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: s },
    });
    const company = await this.prisma.company.findFirst({
      where: { slug: s },
    });
    if (!tenant && !company) {
      throw new NotFoundException(`Estabelecimento "${slug}" não encontrado`);
    }
    return {
      tenantId: tenant?.id || null,
      companyId: company?.id || null,
    };
  }

  async listPurchaseNotes(slug: string, status?: string) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const notes = await this.prisma.purchaseNote.findMany({
      where: {
        OR: orConditions,
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((note) => {
      const total = note.items.length;
      const bought = note.items.filter((i) => i.status === 'BOUGHT').length;
      const notBought = note.items.filter((i) => i.status === 'NOT_BOUGHT').length;
      const pending = note.items.filter((i) => i.status === 'PENDING').length;

      return {
        ...note,
        stats: {
          total,
          bought,
          notBought,
          pending,
        },
      };
    });
  }

  async getPurchaseNote(slug: string, id: string) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: {
        id,
        OR: orConditions,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Nota de compra não encontrada');
    }

    const total = note.items.length;
    const bought = note.items.filter((i) => i.status === 'BOUGHT').length;
    const notBought = note.items.filter((i) => i.status === 'NOT_BOUGHT').length;
    const pending = note.items.filter((i) => i.status === 'PENDING').length;

    return {
      ...note,
      stats: {
        total,
        bought,
        notBought,
        pending,
      },
    };
  }

  async createPurchaseNote(slug: string, data: any) {
    const { tenantId, companyId } = await this.getEntityIds(slug);

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('A nota deve conter pelo menos um item');
    }

    const validItems = data.items
      .filter((i: any) => i && i.itemName && String(i.itemName).trim().length > 0)
      .map((i: any) => ({
        itemName: String(i.itemName).trim(),
        quantity: String(i.quantity || '1 un').trim(),
        status: 'PENDING',
      }));

    if (validItems.length === 0) {
      throw new BadRequestException('Adicione itens válidos com nome e quantidade');
    }

    const note = await this.prisma.purchaseNote.create({
      data: {
        tenantId,
        companyId,
        title: (data.title || 'Nota de Compra').trim(),
        createdByName: data.createdByName ? String(data.createdByName).trim() : 'Cozinha',
        notes: data.notes ? String(data.notes).trim() : null,
        status: 'PENDING',
        items: {
          create: validItems,
        },
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const total = note.items.length;
    return {
      ...note,
      stats: {
        total,
        bought: 0,
        notBought: 0,
        pending: total,
      },
    };
  }

  async updatePurchaseNoteStatus(slug: string, id: string, data: any) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id, OR: orConditions },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    const updateData: any = {};
    if (data.status) {
      const allowed = ['PENDING', 'IN_PROGRESS', 'CONFIRMED', 'PARTIAL'];
      if (!allowed.includes(data.status)) {
        throw new BadRequestException(`Status inválido: ${data.status}`);
      }
      updateData.status = data.status;
    }
    if (data.buyerName !== undefined) {
      updateData.buyerName = data.buyerName ? String(data.buyerName).trim() : null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes ? String(data.notes).trim() : null;
    }

    const updated = await this.prisma.purchaseNote.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const total = updated.items.length;
    const bought = updated.items.filter((i) => i.status === 'BOUGHT').length;
    const notBought = updated.items.filter((i) => i.status === 'NOT_BOUGHT').length;
    const pending = updated.items.filter((i) => i.status === 'PENDING').length;

    return {
      ...updated,
      stats: {
        total,
        bought,
        notBought,
        pending,
      },
    };
  }

  async updatePurchaseNoteItem(slug: string, noteId: string, itemId: string, data: any) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id: noteId, OR: orConditions },
      include: { items: true },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    const existingItem = note.items.find((i) => i.id === itemId);
    if (!existingItem) throw new NotFoundException('Item da nota não encontrado');

    const allowedStatuses = ['PENDING', 'BOUGHT', 'NOT_BOUGHT'];
    if (data.status && !allowedStatuses.includes(data.status)) {
      throw new BadRequestException(`Status de item inválido: ${data.status}`);
    }

    // Atualiza o item
    await this.prisma.purchaseNoteItem.update({
      where: { id: itemId },
      data: {
        status: data.status,
        buyerNotes: data.buyerNotes !== undefined ? (data.buyerNotes ? String(data.buyerNotes).trim() : null) : existingItem.buyerNotes,
      },
    });

    // Recalcula o status geral da nota
    const allItems = await this.prisma.purchaseNoteItem.findMany({
      where: { purchaseNoteId: noteId },
    });

    const total = allItems.length;
    const bought = allItems.filter((i) => i.status === 'BOUGHT').length;
    const notBought = allItems.filter((i) => i.status === 'NOT_BOUGHT').length;
    const pending = allItems.filter((i) => i.status === 'PENDING').length;

    let computedStatus = note.status;

    if (total > 0) {
      if (pending === 0) {
        if (notBought === 0 && bought === total) {
          computedStatus = 'CONFIRMED'; // 🟢 Confirmada (100% comprado)
        } else {
          computedStatus = 'PARTIAL'; // 🟠 Parcial (algum item não foi comprado)
        }
      } else {
        if (bought > 0 || notBought > 0) {
          computedStatus = 'IN_PROGRESS'; // 🔵 Em compra (responsável em andamento)
        }
      }
    }

    const updatedNote = await this.prisma.purchaseNote.update({
      where: { id: noteId },
      data: {
        status: computedStatus,
        buyerName: data.buyerName ? String(data.buyerName).trim() : note.buyerName,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      ...updatedNote,
      stats: {
        total,
        bought,
        notBought,
        pending,
      },
    };
  }

  async addItemsToPurchaseNote(slug: string, noteId: string, items: Array<{ itemName: string; quantity: string }>) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id: noteId, OR: orConditions },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    const validItems = items
      .filter((i) => i && i.itemName && String(i.itemName).trim().length > 0)
      .map((i) => ({
        purchaseNoteId: noteId,
        itemName: String(i.itemName).trim(),
        quantity: String(i.quantity || '1 un').trim(),
        status: 'PENDING',
      }));

    if (validItems.length > 0) {
      await this.prisma.purchaseNoteItem.createMany({
        data: validItems,
      });
    }

    return this.getPurchaseNote(slug, noteId);
  }

  async deletePurchaseNote(slug: string, id: string) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id, OR: orConditions },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    // Estorno junto: movimentos de caixa e despesa automática vinculados somem
    // com a nota — senão o caixa ficaria abatido por uma compra que não existe.
    await this.prisma.$transaction(async (tx) => {
      await tx.cashMovement.deleteMany({ where: { purchaseNoteId: id } });
      await tx.billPayable.deleteMany({ where: { purchaseNoteId: id } });
      await tx.purchaseNote.delete({ where: { id } });
    });

    return { success: true };
  }

  /**
   * Confirma o pagamento da nota de compra e abate no caixa do turno.
   *
   * Fluxo: valida total × parcelas (único, combinado ou espelhando o rateio
   * por item) → grava na nota/itens → apaga lançamentos anteriores da mesma
   * nota (reconfirmação não duplica) → cria um movimento COMPRA por canal no
   * caixa ABERTO (se não houver turno aberto, o pagamento fica registrado na
   * nota + despesa, sem movimento de turno) → cria a despesa PAGA (alimenta
   * DRE, fluxo de caixa e o abatimento do fechamento).
   */
  async confirmPurchaseNote(
    slug: string,
    id: string,
    payload: {
      totalCents: number;
      payments: { method: string; amountCents: number }[];
      items?: { itemId: string; priceCents?: number; paymentMethod?: string }[];
      supplierName?: string;
    },
    operator?: { id?: string; name?: string },
  ) {
    const { tenantId, companyId } = await this.getEntityIds(slug);
    const orConditions: any[] = [];
    if (tenantId) orConditions.push({ tenantId });
    if (companyId) orConditions.push({ companyId });

    const note = await this.prisma.purchaseNote.findFirst({
      where: { id, OR: orConditions },
      include: { items: true },
    });
    if (!note) throw new NotFoundException('Nota de compra não encontrada');

    let totalCents: number;
    let payments: { method: string; amountCents: number }[];
    try {
      ({ totalCents, payments } = validatePurchasePayment(payload.totalCents, payload.payments));
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'Pagamento inválido');
    }

    // Rateio por item (opcional): se algum item tem preço, a soma de TODOS os
    // preços precisa fechar no total — senão o rateio mente sobre o gasto.
    const itemPatches: { id: string; priceCents: number; paymentMethod: string | null }[] = [];
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      for (const it of payload.items) {
        const existing = note.items.find((i) => i.id === it.itemId);
        if (!existing) throw new BadRequestException('Item não pertence a esta nota');
        const priceCents = Math.round(Number(it.priceCents) || 0);
        if (priceCents < 0) throw new BadRequestException(`Preço inválido em "${existing.itemName}"`);
        let method: string | null = null;
        if (priceCents > 0) {
          const m = normalizePaymentMethodOrOther(it.paymentMethod);
          if (!(PURCHASE_PAYMENT_METHODS as readonly string[]).includes(m)) {
            throw new BadRequestException(`Canal inválido em "${existing.itemName}"`);
          }
          method = m;
        }
        itemPatches.push({ id: existing.id, priceCents, paymentMethod: method });
      }
      if (itemPatches.some((p) => p.priceCents > 0)) {
        const itemsSum = itemPatches.reduce((s, p) => s + p.priceCents, 0);
        if (itemsSum !== totalCents) {
          throw new BadRequestException(
            `A soma dos itens precisa fechar no total da nota (itens: ${itemsSum}, total: ${totalCents}).`,
          );
        }
      }
    }

    const supplierName = payload.supplierName?.trim()?.slice(0, 120) || null;
    const breakdown = payments.map((p) => `${paymentMethodLabel(p.method)} ${brlCents(p.amountCents)}`).join(' + ');

    const result = await this.prisma.$transaction(async (tx) => {
      for (const patch of itemPatches) {
        await tx.purchaseNoteItem.update({
          where: { id: patch.id },
          data: { priceCents: patch.priceCents, paymentMethod: patch.paymentMethod },
        });
      }

      await tx.purchaseNote.update({
        where: { id },
        data: {
          totalCents,
          paymentsJson: JSON.stringify(payments),
          paidAt: new Date(),
          supplierName,
        },
      });

      // Reconfirmação: apaga os lançamentos anteriores antes de recriar.
      await tx.cashMovement.deleteMany({ where: { purchaseNoteId: id } });
      await tx.billPayable.deleteMany({ where: { purchaseNoteId: id } });

      // Abatimento por canal no turno atual (só existe com caixa aberto).
      const openRegister = tenantId
        ? await tx.cashRegister.findFirst({
            where: { tenantId, status: 'OPEN' },
            orderBy: { openedAt: 'desc' },
          })
        : null;

      const movements: any[] = [];
      if (openRegister) {
        for (const p of payments) {
          movements.push(
            await tx.cashMovement.create({
              data: {
                tenantId: tenantId || '',
                cashRegisterId: openRegister.id,
                type: 'COMPRA',
                amountCents: p.amountCents,
                reason: `Compra insumos — ${note.title} (${paymentMethodLabel(p.method)})`,
                operatorId: operator?.id || null,
                paymentMethod: p.method,
                purchaseNoteId: id,
              },
            }),
          );
        }
      }

      // Despesa paga automática: alimenta DRE, fluxo de caixa e fechamento.
      const bill = tenantId
        ? await tx.billPayable.create({
            data: {
              tenantId,
              description: `Compra insumos — ${note.title}`,
              category: 'FORNECEDOR',
              amountCents: totalCents,
              dueDate: new Date(),
              paidAt: new Date(),
              status: 'PAID',
              notes: `${breakdown}${supplierName ? ` • Fornecedor: ${supplierName}` : ''}`,
              purchaseNoteId: id,
            },
          })
        : null;

      return { movements, bill, registerOpen: Boolean(openRegister) };
    });

    await this.audit.recordChangeSafe({
      userId: operator?.id,
      action: 'PURCHASE_NOTE_PAID',
      targetType: 'PurchaseNote',
      targetId: id,
      before: { totalCents: (note as any).totalCents ?? 0, paidAt: (note as any).paidAt ?? null },
      after: { totalCents, paidAt: new Date(), payments },
    });

    return {
      ...(await this.getPurchaseNote(slug, id)),
      payment: { movements: result.movements, bill: result.bill, registerOpen: result.registerOpen },
    };
  }
}

/** Moeda curta para motivos/observações (sem locale pesado no service). */
function brlCents(cents: number): string {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

// ─── Calendário: recorrência e janelas ───────────────────────────────────

type CalendarFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

interface CalendarRule {
  freq: CalendarFreq;
  interval: number;
  until?: string;
  count?: number;
}

function parseCalendarRecurrence(raw: unknown): CalendarRule | null {
  if (!raw) return null;
  try {
    const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!r || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) return null;
    return {
      freq: r.freq as CalendarFreq,
      interval: Math.min(365, Math.max(1, Math.round(Number(r.interval) || 1))),
      until: r.until ? String(r.until) : undefined,
      count: r.count !== undefined ? Math.min(500, Math.max(1, Math.round(Number(r.count) || 1))) : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeCalendarRecurrence(raw: unknown): CalendarRule | null {
  if (!raw) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  return parseCalendarRecurrence(raw);
}

function readCalendarExceptions(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function sanitizeCalendarColor(raw: unknown): string {
  const v = String(raw || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#0E54F8';
}

function normalizeCalendarRange(
  data: { startsAt?: unknown; endsAt?: unknown; allDay?: unknown },
  fallbackStartIso?: string,
): { startsAt: Date; endsAt: Date; allDay: boolean } {
  const allDay = Boolean(data?.allDay);
  let startsAt = data?.startsAt ? new Date(String(data.startsAt)) : fallbackStartIso ? new Date(fallbackStartIso) : new Date();
  if (Number.isNaN(startsAt.getTime())) startsAt = new Date();
  let endsAt = data?.endsAt ? new Date(String(data.endsAt)) : new Date(startsAt.getTime() + 60 * 60000);
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    endsAt = new Date(startsAt.getTime() + 60 * 60000);
  }
  if (allDay) {
    startsAt = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
    endsAt = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate() + 1);
  }
  return { startsAt, endsAt, allDay };
}

function shapeCalendarEvent(e: any, occurrenceIso: string | null) {
  return {
    id: occurrenceIso ? `${e.id}@${occurrenceIso}` : e.id,
    eventId: e.id,
    source: 'EVENT',
    readonly: false,
    title: e.title,
    description: e.description,
    location: e.location,
    startsAt: occurrenceIso ? new Date(occurrenceIso) : e.startsAt,
    endsAt: occurrenceIso
      ? new Date(new Date(occurrenceIso).getTime() + (new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()))
      : e.endsAt,
    allDay: Boolean(e.allDay),
    color: e.color || '#0E54F8',
    category: e.category || 'Compromisso',
    recurrence: e.recurrence,
    reminderMin: e.reminderMin,
    guests: (() => {
      try {
        const g = typeof e.guests === 'string' ? JSON.parse(e.guests) : e.guests;
        return Array.isArray(g) ? g : [];
      } catch {
        return [];
      }
    })(),
  };
}

function expandCalendarRecurrence(head: any, rule: CalendarRule, from: Date, to: Date): any[] {
  const out: any[] = [];
  const exceptions = new Set(readCalendarExceptions((head as any).recurrenceExceptions));
  const baseStart = new Date((head as any).startsAt);
  const until = rule.until && !Number.isNaN(new Date(rule.until).getTime()) ? new Date(rule.until) : null;
  const maxCount = rule.count ?? 500;
  let cursor = new Date(baseStart);
  let index = 0;
  let guard = 0;
  while (guard < 2000) {
    guard++;
    if (until && cursor > until) break;
    if (index >= maxCount) break;
    if (cursor > to) break;
    if (cursor >= from) {
      const iso = cursor.toISOString();
      if (!exceptions.has(iso)) {
        out.push(shapeCalendarEvent(head, iso));
        if (out.length >= 200) break;
      }
    }
    index++;
    cursor = advanceCalendarDate(cursor, rule);
  }
  return out;
}

function advanceCalendarDate(d: Date, rule: CalendarRule): Date {
  const next = new Date(d);
  const step = rule.interval || 1;
  if (rule.freq === 'DAILY') next.setDate(next.getDate() + step);
  else if (rule.freq === 'WEEKLY') next.setDate(next.getDate() + 7 * step);
  else if (rule.freq === 'MONTHLY') next.setMonth(next.getMonth() + step);
  else next.setFullYear(next.getFullYear() + step);
  return next;
}

