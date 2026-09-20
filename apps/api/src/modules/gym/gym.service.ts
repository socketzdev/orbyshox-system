import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EXERCISE_DATASET_SEED } from './exercise-dataset.seed';

/**
 * Gestão fitness da vertical ACADEMIA.
 *
 * Escopo sempre por tenant (`tenantId || companyId` — Company.id == Tenant.id
 * por invariante de criação em TenantsService). Matrícula gera conta a receber
 * (mensalidade) no Financeiro; check-in valida situação do aluno na hora.
 */

export interface CreateStudentDto {
  name: string;
  phone?: string;
  email?: string;
  document?: string;
  birthDate?: string;
  planName?: string;
  notes?: string;
}

export interface CreateEnrollmentDto {
  studentId: string;
  plan: string;
  startDate: string;
  endDate: string;
  priceCents: number;
  notes?: string;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * GIFs demonstrativos servidos pelo front (`/exercise-gifs/<slug>.gif`),
 * casados com o dataset público de exercícios. Chave = nome normalizado.
 */
export const EXERCISE_GIF_SLUGS: Record<string, string> = {
  'agachamento livre': 'agachamento-livre',
  'leg press 45': 'leg-press-45',
  'cadeira extensora': 'cadeira-extensora',
  'hack machine': 'hack-machine',
  'afundo com halteres': 'afundo-com-halteres',
  'stiff com barra': 'stiff-com-barra',
  'mesa flexora': 'mesa-flexora',
  'cadeira flexora': 'cadeira-flexora',
  'elevacao pelvica': 'elevacao-pelvica',
  'cadeira abdutora': 'cadeira-abdutora',
  'supino reto com barra': 'supino-reto-com-barra',
  'supino inclinado com halteres': 'supino-inclinado-com-halteres',
  'crucifixo': 'crucifixo',
  'puxada alta': 'puxada-alta',
  'remada baixa': 'remada-baixa',
  'remada curvada': 'remada-curvada',
  'desenvolvimento com halteres': 'desenvolvimento-com-halteres',
  'elevacao lateral': 'elevacao-lateral',
  'rosca direta': 'rosca-direta',
  'rosca martelo': 'rosca-martelo',
  'triceps pulley': 'triceps-pulley',
  'triceps testa': 'triceps-testa',
  'abdominal supra': 'abdominal-supra',
  'prancha': 'prancha',
  'panturrilha em pe': 'panturrilha-em-pe',
  'esteira': 'esteira',
  'bicicleta': 'bicicleta',
  'burpee': 'burpee',
  'flexao de braco': 'flexao-de-braco',
  'barra fixa': 'barra-fixa',
};

@Injectable()
export class GymService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  static normalizeExerciseName(raw: string): string {
    return String(raw || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tid(companyId?: string, tenantId?: string): string {
    const id = tenantId || companyId;
    if (!id) throw new BadRequestException('Tenant não identificado.');
    return id;
  }

  // ─── Alunos ──────────────────────────────────────────────────────────────

  async listStudents(companyId?: string, tenantId?: string, filters?: { search?: string; status?: string }) {
    const id = this.tid(companyId, tenantId);
    const where: any = { tenantId: id };
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters?.search) {
      const s = String(filters.search);
      where.OR = [
        { name: { contains: s } },
        { phone: { contains: s } },
        { email: { contains: s } },
      ];
    }
    return this.prisma.gymStudent.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 300,
      include: {
        enrollments: { where: { status: 'ATIVA' }, take: 1, orderBy: { endDate: 'desc' } },
        checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  async getStudent(companyId: string | undefined, tenantId: string | undefined, id: string) {
    const tid = this.tid(companyId, tenantId);
    const student = await this.prisma.gymStudent.findFirst({
      where: { id, tenantId: tid },
      include: {
        enrollments: { orderBy: { createdAt: 'desc' } },
        checkIns: { orderBy: { createdAt: 'desc' }, take: 30 },
        workouts: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    return student;
  }

  async createStudent(companyId: string | undefined, tenantId: string | undefined, dto: CreateStudentDto) {
    const id = this.tid(companyId, tenantId);
    if (!dto.name?.trim()) throw new BadRequestException('Nome do aluno é obrigatório.');
    return this.prisma.gymStudent.create({
      data: {
        tenantId: id,
        name: dto.name.trim().slice(0, 120),
        phone: dto.phone?.trim()?.slice(0, 30) || null,
        email: dto.email?.trim()?.slice(0, 120) || null,
        document: dto.document?.trim()?.slice(0, 30) || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        planName: dto.planName?.trim()?.slice(0, 80) || null,
        notes: dto.notes?.trim()?.slice(0, 1000) || null,
        status: 'ATIVO',
      },
    });
  }

  async updateStudent(companyId: string | undefined, tenantId: string | undefined, id: string, dto: Partial<CreateStudentDto & { status: string }>) {
    const tid = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymStudent.findFirst({ where: { id, tenantId: tid } });
    if (!existing) throw new NotFoundException('Aluno não encontrado.');
    const data: any = {};
    if (dto.name !== undefined) data.name = String(dto.name).trim().slice(0, 120);
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.document !== undefined) data.document = dto.document?.trim() || null;
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.planName !== undefined) data.planName = dto.planName?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.status !== undefined) {
      if (!['ATIVO', 'PENDENTE', 'VENCIDO', 'PAUSADO', 'CANCELADO'].includes(dto.status)) {
        throw new BadRequestException('Status inválido.');
      }
      data.status = dto.status;
    }
    return this.prisma.gymStudent.update({ where: { id }, data });
  }

  async deleteStudent(companyId: string | undefined, tenantId: string | undefined, id: string) {
    const tid = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymStudent.findFirst({ where: { id, tenantId: tid } });
    if (!existing) throw new NotFoundException('Aluno não encontrado.');
    await this.prisma.gymStudent.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── Matrículas (geram mensalidade no Financeiro) ─────────────────────────

  async listEnrollments(companyId?: string, tenantId?: string, status?: string) {
    const id = this.tid(companyId, tenantId);
    return this.prisma.gymEnrollment.findMany({
      where: { tenantId: id, ...(status && status !== 'ALL' ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { student: { select: { id: true, name: true, phone: true, status: true, dueDate: true } } },
    });
  }

  async createEnrollment(companyId: string | undefined, tenantId: string | undefined, dto: CreateEnrollmentDto) {
    const id = this.tid(companyId, tenantId);
    const student = await this.prisma.gymStudent.findFirst({ where: { id: dto.studentId, tenantId: id } });
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Período da matrícula inválido.');
    }
    const price = Math.max(0, Math.round(Number(dto.priceCents) || 0));

    // Mensalidade no Financeiro vencendo no fim do plano.
    const bill = await this.prisma.billReceivable.create({
      data: {
        tenantId: id,
        description: `Mensalidade ${dto.plan} — ${student.name}`,
        amountCents: price,
        dueDate: end,
        status: 'PENDING',
        type: 'MENSALIDADE',
        notes: `Matrícula academia (${dto.plan})`,
      },
    });

    // Pausa matrículas ativas anteriores do aluno (upgrade/downgrade/renovação).
    await this.prisma.gymEnrollment.updateMany({
      where: { tenantId: id, studentId: student.id, status: 'ATIVA' },
      data: { status: 'EXPIRADA' },
    });

    const enrollment = await this.prisma.gymEnrollment.create({
      data: {
        tenantId: id,
        studentId: student.id,
        plan: String(dto.plan).slice(0, 80),
        startDate: start,
        endDate: end,
        priceCents: price,
        status: 'ATIVA',
        billReceivableId: bill.id,
        notes: dto.notes?.slice(0, 1000) || null,
      },
      include: { student: true },
    });

    await this.prisma.gymStudent.update({
      where: { id: student.id },
      data: { planName: enrollment.plan, dueDate: end, status: 'ATIVO' },
    });

    return enrollment;
  }

  async setEnrollmentStatus(companyId: string | undefined, tenantId: string | undefined, id: string, status: string) {
    const tid = this.tid(companyId, tenantId);
    if (!['ATIVA', 'PAUSADA', 'CANCELADA', 'EXPIRADA'].includes(status)) {
      throw new BadRequestException('Status inválido.');
    }
    const enrollment = await this.prisma.gymEnrollment.findFirst({
      where: { id, tenantId: tid },
      include: { student: true },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada.');
    const updated = await this.prisma.gymEnrollment.update({ where: { id }, data: { status } });
    // Reflete no aluno: pausa/cancelamento bloqueiam a catraca.
    if (status === 'PAUSADA') {
      await this.prisma.gymStudent.update({ where: { id: enrollment.studentId }, data: { status: 'PAUSADO' } });
    } else if (status === 'CANCELADA') {
      await this.prisma.gymStudent.update({ where: { id: enrollment.studentId }, data: { status: 'CANCELADO' } });
      if (enrollment.billReceivableId) {
        await this.prisma.billReceivable.updateMany({
          where: { id: enrollment.billReceivableId, status: 'PENDING' },
          data: { status: 'CANCELED' },
        });
      }
    } else if (status === 'ATIVA') {
      await this.prisma.gymStudent.update({
        where: { id: enrollment.studentId },
        data: { status: 'ATIVO', planName: enrollment.plan, dueDate: enrollment.endDate },
      });
    }
    return updated;
  }

  // ─── Check-in / catraca ───────────────────────────────────────────────────

  /** Situação de acesso: ATIVO em dia libera; resto bloqueia com motivo. */
  private accessSituation(student: any, now: Date): { ok: boolean; reason: string | null } {
    if (student.status === 'PAUSADO') return { ok: false, reason: 'Matrícula pausada' };
    if (student.status === 'CANCELADO') return { ok: false, reason: 'Matrícula cancelada' };
    if (student.dueDate && new Date(student.dueDate).getTime() < now.getTime()) {
      return { ok: false, reason: 'Mensalidade vencida' };
    }
    if (student.status === 'VENCIDO' || student.status === 'PENDENTE') {
      return { ok: false, reason: 'Pagamento pendente' };
    }
    return { ok: true, reason: null };
  }

  async checkIn(companyId: string | undefined, tenantId: string | undefined, studentId: string, method: string) {
    const id = this.tid(companyId, tenantId);
    const student = await this.prisma.gymStudent.findFirst({ where: { id: studentId, tenantId: id } });
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    const now = new Date();
    const situation = this.accessSituation(student, now);
    const record = await this.prisma.gymCheckIn.create({
      data: {
        tenantId: id,
        studentId: student.id,
        method: method === 'QR_CODE' ? 'QR_CODE' : 'MANUAL',
        blocked: !situation.ok,
        blockReason: situation.reason,
      },
      include: { student: { select: { id: true, name: true, planName: true, status: true, dueDate: true } } },
    });
    return { ...record, allowed: situation.ok, reason: situation.reason };
  }

  async todayCheckIns(companyId?: string, tenantId?: string) {
    const id = this.tid(companyId, tenantId);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const list = await this.prisma.gymCheckIn.findMany({
      where: { tenantId: id, createdAt: { gte: start } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { student: { select: { id: true, name: true, planName: true, status: true } } },
    });
    const presentIds = new Set(list.filter((c) => !c.blocked).map((c) => c.studentId));
    return { total: list.length, present: presentIds.size, blocked: list.filter((c) => c.blocked).length, list };
  }

  async studentHistory(companyId: string | undefined, tenantId: string | undefined, studentId: string) {
    const id = this.tid(companyId, tenantId);
    return this.prisma.gymCheckIn.findMany({
      where: { tenantId: id, studentId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }

  // ─── Biblioteca de movimentos ────────────────────────────────────────────

  static readonly MUSCLE_GROUPS = [
    'QUADRICEPS', 'POSTERIOR', 'GLUTEO', 'PEITORAL', 'COSTAS', 'OMBRO',
    'BICEPS', 'TRICEPS', 'ABDOMEN', 'PANTURRILHA', 'ANTEBRACO', 'CARDIO', 'CORPO_INTEIRO', 'OUTRO',
  ];

  static readonly WEEK_DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

  private inferMediaType(url: string | null | undefined): string | null {
    if (!url) return null;
    const u = url.toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YOUTUBE';
    if (/\.(gif)(\?|$)/.test(u)) return 'GIF';
    return 'VIDEO';
  }

  async listExercises(companyId?: string, tenantId?: string, filters?: { search?: string; muscleGroup?: string }) {
    const id = this.tid(companyId, tenantId);
    const where: any = { tenantId: id, isActive: true };
    if (filters?.muscleGroup && filters.muscleGroup !== 'ALL') where.muscleGroup = filters.muscleGroup;
    if (filters?.search) {
      const s = String(filters.search);
      where.OR = [{ name: { contains: s } }, { equipment: { contains: s } }];
    }
    return this.prisma.gymExercise.findMany({ where, orderBy: { name: 'asc' }, take: 500 });
  }

  async createExercise(companyId: string | undefined, tenantId: string | undefined, dto: any) {
    const id = this.tid(companyId, tenantId);
    if (!dto?.name?.trim()) throw new BadRequestException('Nome do exercício é obrigatório.');
    const muscleGroup = String(dto.muscleGroup || 'OUTRO').toUpperCase();
    if (!GymService.MUSCLE_GROUPS.includes(muscleGroup)) throw new BadRequestException('Grupo muscular inválido.');
    const mediaUrl = dto?.mediaUrl ? String(dto.mediaUrl).trim().slice(0, 12_000_000) : null;
    if (mediaUrl && !/^https?:\/\/.+/i.test(mediaUrl) && !/^data:(video\/(mp4|webm)|image\/gif);base64,/i.test(mediaUrl)) {
      throw new BadRequestException('Mídia inválida: envie URL http(s) ou arquivo MP4/WebM/GIF.');
    }
    const dup = await this.prisma.gymExercise.findFirst({
      where: { tenantId: id, name: dto.name.trim(), isActive: true },
    });
    if (dup) throw new BadRequestException('Este exercício já está na biblioteca.');
    return this.prisma.gymExercise.create({
      data: {
        tenantId: id,
        name: String(dto.name).trim().slice(0, 120),
        equipment: dto?.equipment ? String(dto.equipment).slice(0, 120) : null,
        muscleGroup,
        mediaUrl,
        mediaType: dto?.mediaType ? String(dto.mediaType).slice(0, 10) : this.inferMediaType(mediaUrl),
        notes: dto?.notes ? String(dto.notes).slice(0, 1000) : null,
      },
    });
  }

  async updateExercise(companyId: string | undefined, tenantId: string | undefined, exId: string, dto: any) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymExercise.findFirst({ where: { id: exId, tenantId: id } });
    if (!existing) throw new NotFoundException('Exercício não encontrado.');
    const data: any = {};
    if (dto?.name !== undefined) {
      if (!String(dto.name).trim()) throw new BadRequestException('Nome do exercício é obrigatório.');
      data.name = String(dto.name).trim().slice(0, 120);
    }
    if (dto?.equipment !== undefined) data.equipment = dto.equipment ? String(dto.equipment).slice(0, 120) : null;
    if (dto?.muscleGroup !== undefined) {
      const mg = String(dto.muscleGroup).toUpperCase();
      if (!GymService.MUSCLE_GROUPS.includes(mg)) throw new BadRequestException('Grupo muscular inválido.');
      data.muscleGroup = mg;
    }
    if (dto?.mediaUrl !== undefined) {
      const url = dto.mediaUrl ? String(dto.mediaUrl).trim().slice(0, 12_000_000) : null;
      if (url && !/^https?:\/\/.+/i.test(url) && !/^data:(video\/(mp4|webm)|image\/gif);base64,/i.test(url)) {
        throw new BadRequestException('Mídia inválida: envie URL http(s) ou arquivo MP4/WebM/GIF.');
      }
      data.mediaUrl = url;
      data.mediaType = dto?.mediaType ? String(dto.mediaType).slice(0, 10) : this.inferMediaType(url);
    }
    if (dto?.notes !== undefined) data.notes = dto.notes ? String(dto.notes).slice(0, 1000) : null;
    if (dto?.isActive !== undefined) data.isActive = Boolean(dto.isActive);
    return this.prisma.gymExercise.update({ where: { id: exId }, data });
  }

  async deleteExercise(companyId: string | undefined, tenantId: string | undefined, exId: string) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymExercise.findFirst({ where: { id: exId, tenantId: id } });
    if (!existing) throw new NotFoundException('Exercício não encontrado.');
    const used = await this.prisma.gymWorkoutItem.count({ where: { exerciseId: exId } });
    // Com ficha usando, desativa em vez de apagar: preserva o histórico.
    if (used > 0) {
      return this.prisma.gymExercise.update({ where: { id: exId }, data: { isActive: false } });
    }
    await this.prisma.gymExercise.delete({ where: { id: exId } });
    return { deleted: true, id: exId };
  }

  /** Biblioteca inicial (~30 movimentos) quando a academia ainda não tem nenhuma. */
  async seedDefaultExercises(companyId: string | undefined, tenantId: string | undefined) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymExercise.count({ where: { tenantId: id } });
    if (existing > 0) throw new BadRequestException('A biblioteca já possui exercícios.');
    // GIF demonstrativo servido pelo front (/exercise-gifs/<slug>.gif).
    const base: Array<[string, string, string, string]> = [
      ['Agachamento Livre', 'Barra e anilhas', 'QUADRICEPS', 'agachamento-livre'],
      ['Leg Press 45°', 'Leg press', 'QUADRICEPS', 'leg-press-45'],
      ['Cadeira Extensora', 'Máquina extensora', 'QUADRICEPS', 'cadeira-extensora'],
      ['Hack Machine', 'Hack machine', 'QUADRICEPS', 'hack-machine'],
      ['Afundo com Halteres', 'Halteres', 'QUADRICEPS', 'afundo-com-halteres'],
      ['Stiff com Barra', 'Barra e anilhas', 'POSTERIOR', 'stiff-com-barra'],
      ['Mesa Flexora', 'Máquina flexora', 'POSTERIOR', 'mesa-flexora'],
      ['Cadeira Flexora', 'Máquina flexora', 'POSTERIOR', 'cadeira-flexora'],
      ['Elevação Pélvica', 'Barra e banco', 'GLUTEO', 'elevacao-pelvica'],
      ['Cadeira Abdutora', 'Máquina abdutora', 'GLUTEO', 'cadeira-abdutora'],
      ['Supino Reto com Barra', 'Banco reto e barra', 'PEITORAL', 'supino-reto-com-barra'],
      ['Supino Inclinado com Halteres', 'Banco inclinado e halteres', 'PEITORAL', 'supino-inclinado-com-halteres'],
      ['Crucifixo', 'Banco e halteres', 'PEITORAL', 'crucifixo'],
      ['Puxada Alta', 'Pulley alto', 'COSTAS', 'puxada-alta'],
      ['Remada Baixa', 'Pulley baixo', 'COSTAS', 'remada-baixa'],
      ['Remada Curvada', 'Barra e anilhas', 'COSTAS', 'remada-curvada'],
      ['Desenvolvimento com Halteres', 'Banco e halteres', 'OMBRO', 'desenvolvimento-com-halteres'],
      ['Elevação Lateral', 'Halteres', 'OMBRO', 'elevacao-lateral'],
      ['Rosca Direta', 'Barra W', 'BICEPS', 'rosca-direta'],
      ['Rosca Martelo', 'Halteres', 'BICEPS', 'rosca-martelo'],
      ['Tríceps Pulley', 'Pulley alto e corda', 'TRICEPS', 'triceps-pulley'],
      ['Tríceps Testa', 'Barra W e banco', 'TRICEPS', 'triceps-testa'],
      ['Abdominal Supra', 'Colchonete', 'ABDOMEN', 'abdominal-supra'],
      ['Prancha', 'Colchonete', 'ABDOMEN', 'prancha'],
      ['Panturrilha em Pé', 'Máquina ou step', 'PANTURRILHA', 'panturrilha-em-pe'],
      ['Esteira', 'Esteira', 'CARDIO', 'esteira'],
      ['Bicicleta', 'Bicicleta ergométrica', 'CARDIO', 'bicicleta'],
      ['Burpee', 'Peso corporal', 'CORPO_INTEIRO', 'burpee'],
      ['Flexão de Braço', 'Peso corporal', 'CORPO_INTEIRO', 'flexao-de-braco'],
      ['Barra Fixa', 'Barra fixa', 'COSTAS', 'barra-fixa'],
    ];
    await this.prisma.gymExercise.createMany({
      data: base.map(([name, equipment, muscleGroup, gif]) => ({
        tenantId: id,
        name,
        equipment,
        muscleGroup,
        mediaUrl: `/exercise-gifs/${gif}.gif`,
        mediaType: 'GIF',
      })),
    });
    return { seeded: base.length };
  }

  /**
   * Importa o dataset completo (~1300 movimentos com GIF) para a biblioteca
   * da academia. Pula os que já existem (nome normalizado) — pode rodar de
   * novo sem duplicar. Inserção em lotes para não estourar o SQLite.
   */
  async importDataset(companyId: string | undefined, tenantId: string | undefined) {
    const id = this.tid(companyId, tenantId);
    const current = await this.prisma.gymExercise.findMany({
      where: { tenantId: id },
      select: { name: true },
      take: 5000,
    });
    const known = new Set(current.map((c) => GymService.normalizeExerciseName(c.name)));
    const fresh = EXERCISE_DATASET_SEED.filter((s) => !known.has(GymService.normalizeExerciseName(s.name)));
    for (const s of fresh) known.add(GymService.normalizeExerciseName(s.name));

    let imported = 0;
    for (let i = 0; i < fresh.length; i += 200) {
      const batch = fresh.slice(i, i + 200);
      await this.prisma.gymExercise.createMany({
        data: batch.map((s) => ({
          tenantId: id,
          name: s.name.slice(0, 120),
          equipment: s.equipment.slice(0, 120),
          muscleGroup: GymService.MUSCLE_GROUPS.includes(s.muscleGroup) ? s.muscleGroup : 'OUTRO',
          mediaUrl: `/exercise-gifs/ds/${s.gif}.gif`,
          mediaType: 'GIF',
        })),
      });
      imported += batch.length;
    }
    return { imported, skipped: EXERCISE_DATASET_SEED.length - fresh.length, total: EXERCISE_DATASET_SEED.length };
  }

  /**
   * Preenche o GIF de quem já carregou a base antes dos GIFs existirem:
   * casa por nome normalizado e só toca exercícios ainda sem mídia.
   */
  async fillMissingExerciseMedia(companyId: string | undefined, tenantId: string | undefined) {
    const id = this.tid(companyId, tenantId);
    const slugOf = (name: string): string | null => {
      const key = GymService.normalizeExerciseName(name);
      return EXERCISE_GIF_SLUGS[key] || null;
    };
    const bare = await this.prisma.gymExercise.findMany({
      where: { tenantId: id, OR: [{ mediaUrl: null }, { mediaUrl: '' }] },
      select: { id: true, name: true },
      take: 500,
    });
    let filled = 0;
    for (const ex of bare) {
      const slug = slugOf(ex.name);
      if (!slug) continue;
      await this.prisma.gymExercise.update({
        where: { id: ex.id },
        data: { mediaUrl: `/exercise-gifs/${slug}.gif`, mediaType: 'GIF' },
      });
      filled++;
    }
    return { filled, total: bare.length };
  }

  // ─── Treinos (fichas com itens vinculados) ────────────────────────────────

  private validateItem(e: any, index: number): { exerciseId: string; sets: number; reps: number; load: string | null; restSeconds: number | null; notes: string | null } {
    const sets = Math.round(Number(e?.sets));
    const reps = Math.round(Number(e?.reps));
    if (!e?.exerciseId) throw new BadRequestException(`Item ${index + 1}: exercício é obrigatório.`);
    if (!Number.isFinite(sets) || sets < 1 || sets > 20) {
      throw new BadRequestException(`Item ${index + 1}: séries devem estar entre 1 e 20.`);
    }
    // Diretriz do sistema: repetições estritamente entre 0 e 40.
    if (!Number.isFinite(reps) || reps < 0 || reps > 40) {
      throw new BadRequestException(`Item ${index + 1}: repetições devem estar entre 0 e 40.`);
    }
    const rest = e?.restSeconds === undefined || e?.restSeconds === null || e?.restSeconds === '' ? null : Math.round(Number(e.restSeconds));
    if (rest !== null && (!Number.isFinite(rest) || rest < 0 || rest > 600)) {
      throw new BadRequestException(`Item ${index + 1}: descanso inválido (0–600s).`);
    }
    return {
      exerciseId: String(e.exerciseId),
      sets,
      reps,
      load: e?.load ? String(e.load).slice(0, 40) : null,
      restSeconds: rest,
      notes: e?.notes ? String(e.notes).slice(0, 500) : null,
    };
  }

  async listWorkouts(companyId?: string, tenantId?: string, studentId?: string, dayOfWeek?: string) {
    const id = this.tid(companyId, tenantId);
    const where: any = { tenantId: id };
    if (studentId) where.studentId = studentId;
    if (dayOfWeek && dayOfWeek !== 'ALL') where.dayOfWeek = dayOfWeek;
    return this.prisma.gymWorkout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        student: { select: { id: true, name: true } },
        items: { orderBy: { position: 'asc' }, include: { exercise: true } },
      },
    });
  }

  async getWorkout(companyId: string | undefined, tenantId: string | undefined, workoutId: string) {
    const id = this.tid(companyId, tenantId);
    const workout = await this.prisma.gymWorkout.findFirst({
      where: { id: workoutId, tenantId: id },
      include: {
        student: { select: { id: true, name: true } },
        items: { orderBy: { position: 'asc' }, include: { exercise: true } },
      },
    });
    if (!workout) throw new NotFoundException('Treino não encontrado.');
    return workout;
  }

  async createWorkout(companyId: string | undefined, tenantId: string | undefined, dto: any) {
    const id = this.tid(companyId, tenantId);
    if (!dto?.studentId) throw new BadRequestException('Aluno é obrigatório.');
    if (!dto?.title?.trim()) throw new BadRequestException('Título da ficha é obrigatório.');
    const student = await this.prisma.gymStudent.findFirst({ where: { id: String(dto.studentId), tenantId: id } });
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    const dayOfWeek = dto?.dayOfWeek ? String(dto.dayOfWeek).toUpperCase() : null;
    if (dayOfWeek && !GymService.WEEK_DAYS.includes(dayOfWeek)) throw new BadRequestException('Dia da semana inválido.');

    const rawItems: any[] = Array.isArray(dto.items) ? dto.items.slice(0, 60) : [];
    if (rawItems.length === 0) throw new BadRequestException('A ficha precisa de ao menos 1 exercício.');
    const items = rawItems.map((e: any, i: number) => this.validateItem(e, i));
    const exerciseIds: string[] = [...new Set(items.map((it) => it.exerciseId))];
    const found = await this.prisma.gymExercise.findMany({
      where: { tenantId: id, id: { in: exerciseIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== exerciseIds.length) {
      throw new BadRequestException('Um ou mais exercícios não existem na biblioteca.');
    }

    return this.prisma.gymWorkout.create({
      data: {
        tenantId: id,
        studentId: student.id,
        title: String(dto.title).trim().slice(0, 120),
        dayOfWeek,
        coach: dto.coach ? String(dto.coach).slice(0, 80) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        notes: dto.notes ? String(dto.notes).slice(0, 1000) : null,
        items: {
          create: items.map((it: { exerciseId: string; sets: number; reps: number; load: string | null; restSeconds: number | null; notes: string | null }, i: number) => ({ tenantId: id, position: i, ...it })),
        },
      },
      include: { items: { orderBy: { position: 'asc' }, include: { exercise: true } } },
    });
  }

  async updateWorkout(companyId: string | undefined, tenantId: string | undefined, workoutId: string, dto: any) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymWorkout.findFirst({ where: { id: workoutId, tenantId: id } });
    if (!existing) throw new NotFoundException('Treino não encontrado.');
    const data: any = {};
    if (dto?.title !== undefined) {
      if (!String(dto.title).trim()) throw new BadRequestException('Título da ficha é obrigatório.');
      data.title = String(dto.title).trim().slice(0, 120);
    }
    if (dto?.dayOfWeek !== undefined) {
      const d = dto.dayOfWeek ? String(dto.dayOfWeek).toUpperCase() : null;
      if (d && !GymService.WEEK_DAYS.includes(d)) throw new BadRequestException('Dia da semana inválido.');
      data.dayOfWeek = d;
    }
    if (dto?.coach !== undefined) data.coach = dto.coach ? String(dto.coach).slice(0, 80) : null;
    if (dto?.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto?.notes !== undefined) data.notes = dto.notes ? String(dto.notes).slice(0, 1000) : null;

    // Troca completa dos itens quando enviada (ordem = sequência da ficha).
    if (dto?.items !== undefined) {
      const rawItems: any[] = Array.isArray(dto.items) ? dto.items.slice(0, 60) : [];
      if (rawItems.length === 0) throw new BadRequestException('A ficha precisa de ao menos 1 exercício.');
      const items = rawItems.map((e: any, i: number) => this.validateItem(e, i));
      const exerciseIds: string[] = [...new Set(items.map((it) => it.exerciseId))];
      const found = await this.prisma.gymExercise.findMany({
        where: { tenantId: id, id: { in: exerciseIds }, isActive: true },
        select: { id: true },
      });
      if (found.length !== exerciseIds.length) {
        throw new BadRequestException('Um ou mais exercícios não existem na biblioteca.');
      }
      await this.prisma.gymWorkoutItem.deleteMany({ where: { workoutId } });
      await this.prisma.gymWorkoutItem.createMany({
        data: items.map((it: { exerciseId: string; sets: number; reps: number; load: string | null; restSeconds: number | null; notes: string | null }, i: number) => ({ tenantId: id, workoutId, position: i, ...it })),
      });
    }

    return this.prisma.gymWorkout.update({
      where: { id: workoutId },
      data,
      include: { items: { orderBy: { position: 'asc' }, include: { exercise: true } } },
    });
  }

  async deleteWorkout(companyId: string | undefined, tenantId: string | undefined, id: string) {
    const tid = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymWorkout.findFirst({ where: { id, tenantId: tid } });
    if (!existing) throw new NotFoundException('Treino não encontrado.');
    await this.prisma.gymWorkout.delete({ where: { id } });
    return { deleted: true, id };
  }

  /**
   * Duplica uma ficha (ex: repetir o treino de segunda na quinta): copia
   * cabeçalho + itens na ordem, opcionalmente em outro dia e/ou aluno.
   */
  async duplicateWorkout(
    companyId: string | undefined,
    tenantId: string | undefined,
    workoutId: string,
    dto: any,
  ) {
    const id = this.tid(companyId, tenantId);
    const source = await this.prisma.gymWorkout.findFirst({
      where: { id: workoutId, tenantId: id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!source) throw new NotFoundException('Treino não encontrado.');

    let studentId = source.studentId;
    if (dto?.studentId) {
      const student = await this.prisma.gymStudent.findFirst({ where: { id: String(dto.studentId), tenantId: id } });
      if (!student) throw new NotFoundException('Aluno não encontrado.');
      studentId = student.id;
    }
    let dayOfWeek: string | null = source.dayOfWeek;
    if (dto?.dayOfWeek !== undefined) {
      dayOfWeek = dto.dayOfWeek ? String(dto.dayOfWeek).toUpperCase() : null;
      if (dayOfWeek && !GymService.WEEK_DAYS.includes(dayOfWeek)) throw new BadRequestException('Dia da semana inválido.');
    }

    return this.prisma.gymWorkout.create({
      data: {
        tenantId: id,
        studentId,
        title: dto?.title ? String(dto.title).slice(0, 120) : `${source.title} (cópia)`,
        dayOfWeek,
        coach: source.coach,
        validUntil: source.validUntil,
        notes: source.notes,
        items: {
          create: source.items.map((it) => ({
            tenantId: id,
            exerciseId: it.exerciseId,
            position: it.position,
            sets: it.sets,
            reps: it.reps,
            load: it.load,
            restSeconds: it.restSeconds,
            notes: it.notes,
          })),
        },
      },
      include: { items: { orderBy: { position: 'asc' }, include: { exercise: true } } },
    });
  }

  // ─── Avaliação física ────────────────────────────────────────────────────
  // Protocolos de dobras (densidade corporal → %G por Siri 1961):
  // - POLLOCK_3 ♂ Jackson & Pollock 1978 (peitoral+abdômen+coxa);
  //   ♀ Jackson et al. 1980 (tríceps+suprailíaca+coxa).
  // - POLLOCK_7 ♂ JP78 / ♀ Jackson et al. 1980 (7 dobras clássicas).
  // - PETROSKI_4 ♂ Petroski 1995 eq. PM7, validada para brasileiros
  //   (subescapular+tríceps+suprailíaca+panturrilha medial + idade).

  static readonly ASSESS_PROTOCOLS = ['POLLOCK_3', 'POLLOCK_7', 'PETROSKI_4'] as const;

  private numIn(v: unknown, min: number, max: number, label: string): number | null {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new BadRequestException(`${label} fora do intervalo válido (${min}–${max}).`);
    }
    return n;
  }

  private parseJsonObject(raw: unknown, label: string, maxKeys = 40): Record<string, any> {
    if (raw === undefined || raw === null || raw === '') return {};
    const obj = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { throw new BadRequestException(`${label} inválido (JSON).`); } })() : raw;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new BadRequestException(`${label} inválido.`);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj).slice(0, maxKeys)) {
      if (v === null || v === undefined || v === '') continue;
      out[String(k).slice(0, 40)] = typeof v === 'number' ? v : String(v).slice(0, 500);
    }
    return out;
  }

  private calcBodyComposition(protocol: string, sex: string, age: number, sf: Record<string, number>): { density: number; bodyFatPct: number } {
    const req = (keys: string[]): number => {
      let sum = 0;
      for (const k of keys) {
        const v = Number(sf[k]);
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          throw new BadRequestException(`Dobra "${k}" ausente ou inválida para o protocolo (0–100mm).`);
        }
        sum += v;
      }
      return sum;
    };
    if (!Number.isFinite(age) || age < 5 || age > 100) {
      throw new BadRequestException('Idade inválida para o cálculo (5–100 anos).');
    }
    let density = 0;
    if (protocol === 'POLLOCK_3') {
      if (sex === 'F') {
        const s = req(['triceps', 'suprailiac', 'thigh']);
        density = 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * age;
      } else {
        const s = req(['chest', 'abdomen', 'thigh']);
        density = 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * age;
      }
    } else if (protocol === 'POLLOCK_7') {
      const s = req(['chest', 'axillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh']);
      density = sex === 'F'
        ? 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * age
        : 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * age;
    } else if (protocol === 'PETROSKI_4') {
      if (sex === 'F') throw new BadRequestException('Petroski 4 dobras é validado para o sexo masculino; use Pollock.');
      const s = req(['subscapular', 'triceps', 'suprailiac', 'calf']);
      density = 1.10726863 - 0.00081201 * s + 0.00000212 * s * s - 0.00041761 * age;
    } else {
      throw new BadRequestException('Protocolo inválido (POLLOCK_3, POLLOCK_7 ou PETROSKI_4).');
    }
    if (!(density > 0.9 && density < 1.2)) throw new BadRequestException('Densidade fora do plausível — confira as dobras.');
    return { density: Math.round(density * 100000) / 100000, bodyFatPct: Math.round((495 / density - 450) * 10) / 10 };
  }

  private buildAssessmentPayload(dto: any): { data: any; computed: { bmi: number | null; waistHipRatio: number | null; bodyDensity: number | null; bodyFatPct: number | null } } {
    const anamnesis = this.parseJsonObject(dto?.anamnesis, 'Anamnese');
    const perimetry = this.parseJsonObject(dto?.perimetry, 'Perimetria');
    const skinfolds = this.parseJsonObject(dto?.skinfolds, 'Dobras cutâneas');
    const bioimpedance = this.parseJsonObject(dto?.bioimpedance, 'Bioimpedância');
    const photos = this.parseJsonObject(dto?.photos, 'Fotos');

    for (const [k, v] of Object.entries(photos)) {
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(v))) {
        throw new BadRequestException(`Foto "${k}" inválida: envie imagem JPG/PNG/WebP.`);
      }
      if (String(v).length > 2_100_000) throw new BadRequestException(`Foto "${k}" muito grande (máx ~1,5MB).`);
    }
    const allowedPhotos = ['front', 'back', 'left', 'right'];
    for (const k of Object.keys(photos)) {
      if (!allowedPhotos.includes(k)) throw new BadRequestException(`Foto "${k}" inválida (front, back, left, right).`);
    }

    const heightCm = this.numIn(dto?.heightCm, 100, 250, 'Estatura');
    const weightKg = this.numIn(dto?.weightKg, 20, 400, 'Peso');
    const wingspanCm = this.numIn(dto?.wingspanCm, 100, 280, 'Envergadura');
    const restingHr = dto?.restingHr === undefined || dto?.restingHr === null || dto?.restingHr === '' ? null : Math.round(this.numIn(dto.restingHr, 20, 250, 'FC repouso')!);
    const systolic = this.numIn(dto?.systolic, 50, 300, 'PA sistólica');
    const diastolic = this.numIn(dto?.diastolic, 30, 200, 'PA diastólica');

    const numMap = (obj: Record<string, any>, min: number, max: number, label: string): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${label} "${k}" fora de ${min}–${max}.`);
        out[k] = Math.round(n * 100) / 100;
      }
      return out;
    };
    const perimetryNum = numMap(perimetry, 10, 300, 'Perimetria');
    const skinfoldsNum = numMap(skinfolds, 0, 100, 'Dobra');
    const bioNum = numMap(bioimpedance, 0, 100000, 'Bioimpedância');

    // IMC e RCQ automáticos quando há dados.
    let bmi: number | null = null;
    if (heightCm && weightKg) bmi = Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10;
    let waistHipRatio: number | null = null;
    if (perimetryNum.waist && perimetryNum.hip) {
      waistHipRatio = Math.round((perimetryNum.waist / perimetryNum.hip) * 100) / 100;
    }

    // %G por protocolo quando há dobras + sexo + idade.
    let protocol: string | null = dto?.protocol ? String(dto.protocol).toUpperCase() : null;
    let bodyDensity: number | null = null;
    let bodyFatPct: number | null = null;
    if (protocol) {
      if (!(GymService.ASSESS_PROTOCOLS as readonly string[]).includes(protocol)) {
        throw new BadRequestException('Protocolo inválido (POLLOCK_3, POLLOCK_7 ou PETROSKI_4).');
      }
      const sex = String(anamnesis.sex || '').toUpperCase().startsWith('F') ? 'F' : 'M';
      let age = Number(anamnesis.age);
      if (!Number.isFinite(age) && anamnesis.birthDate) {
        const b = new Date(String(anamnesis.birthDate));
        if (!Number.isNaN(b.getTime())) {
          age = Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000));
        }
      }
      const calc = this.calcBodyComposition(protocol, sex, age, skinfoldsNum);
      bodyDensity = calc.density;
      bodyFatPct = calc.bodyFatPct;
    }

    const goal = dto?.goal ? String(dto.goal).toUpperCase().slice(0, 30) : null;
    if (goal && !['EMAGRECIMENTO', 'HIPERTROFIA', 'REABILITACAO', 'CONDICIONAMENTO', 'OUTRO'].includes(goal)) {
      throw new BadRequestException('Objetivo inválido.');
    }

    return {
      data: {
        date: dto?.date ? new Date(dto.date) : new Date(),
        professional: dto?.professional ? String(dto.professional).slice(0, 80) : null,
        goal,
        anamnesis: JSON.stringify(anamnesis),
        heightCm, weightKg, wingspanCm, restingHr, systolic, diastolic,
        perimetry: JSON.stringify(perimetryNum),
        skinfolds: JSON.stringify(skinfoldsNum),
        bioimpedance: JSON.stringify(bioNum),
        protocol,
        bodyDensity, bodyFatPct, bmi, waistHipRatio,
        photos: JSON.stringify(photos),
        notes: dto?.notes ? String(dto.notes).slice(0, 2000) : null,
      },
      computed: { bmi, waistHipRatio, bodyDensity, bodyFatPct },
    };
  }

  async listAssessments(companyId?: string, tenantId?: string, studentId?: string) {
    const id = this.tid(companyId, tenantId);
    return this.prisma.gymAssessment.findMany({
      where: { tenantId: id, ...(studentId ? { studentId } : {}) },
      orderBy: { date: 'desc' },
      take: 200,
      include: { student: { select: { id: true, name: true } } },
    });
  }

  async getAssessment(companyId: string | undefined, tenantId: string | undefined, assessmentId: string) {
    const id = this.tid(companyId, tenantId);
    const assessment = await this.prisma.gymAssessment.findFirst({
      where: { id: assessmentId, tenantId: id },
      include: { student: { select: { id: true, name: true } } },
    });
    if (!assessment) throw new NotFoundException('Avaliação não encontrada.');
    return assessment;
  }

  async createAssessment(companyId: string | undefined, tenantId: string | undefined, dto: any) {
    const id = this.tid(companyId, tenantId);
    if (!dto?.studentId) throw new BadRequestException('Aluno é obrigatório.');
    const student = await this.prisma.gymStudent.findFirst({ where: { id: String(dto.studentId), tenantId: id } });
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    const { data } = this.buildAssessmentPayload(dto);
    return this.prisma.gymAssessment.create({ data: { ...data, tenantId: id, studentId: student.id } });
  }

  async updateAssessment(companyId: string | undefined, tenantId: string | undefined, assessmentId: string, dto: any) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymAssessment.findFirst({ where: { id: assessmentId, tenantId: id } });
    if (!existing) throw new NotFoundException('Avaliação não encontrada.');
    // Recalcula sobre os valores resultantes (parcial + existente).
    const merged = {
      date: dto?.date ?? existing.date,
      professional: dto?.professional ?? existing.professional,
      goal: dto?.goal ?? existing.goal,
      anamnesis: dto?.anamnesis ?? existing.anamnesis,
      heightCm: dto?.heightCm ?? existing.heightCm,
      weightKg: dto?.weightKg ?? existing.weightKg,
      wingspanCm: dto?.wingspanCm ?? existing.wingspanCm,
      restingHr: dto?.restingHr ?? existing.restingHr,
      systolic: dto?.systolic ?? existing.systolic,
      diastolic: dto?.diastolic ?? existing.diastolic,
      perimetry: dto?.perimetry ?? existing.perimetry,
      skinfolds: dto?.skinfolds ?? existing.skinfolds,
      bioimpedance: dto?.bioimpedance ?? existing.bioimpedance,
      protocol: dto?.protocol ?? existing.protocol,
      photos: dto?.photos ?? existing.photos,
      notes: dto?.notes ?? existing.notes,
    };
    const { data } = this.buildAssessmentPayload(merged);
    return this.prisma.gymAssessment.update({ where: { id: assessmentId }, data });
  }

  async deleteAssessment(companyId: string | undefined, tenantId: string | undefined, assessmentId: string) {
    const id = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymAssessment.findFirst({ where: { id: assessmentId, tenantId: id } });
    if (!existing) throw new NotFoundException('Avaliação não encontrada.');
    await this.prisma.gymAssessment.delete({ where: { id: assessmentId } });
    return { deleted: true, id: assessmentId };
  }

  // ─── Aulas coletivas ──────────────────────────────────────────────────────

  async listClasses(companyId?: string, tenantId?: string, upcomingOnly?: boolean) {
    const id = this.tid(companyId, tenantId);
    const where: any = { tenantId: id };
    if (upcomingOnly) where.startsAt = { gte: new Date() };
    const classes = await this.prisma.gymClass.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      take: 200,
      include: { bookings: { include: { student: { select: { id: true, name: true } } } } },
    });
    return classes.map((c) => ({
      ...c,
      bookedCount: c.bookings.filter((b) => b.status !== 'CANCELADO').length,
      presentCount: c.bookings.filter((b) => b.status === 'PRESENTE').length,
    }));
  }

  async createClass(companyId: string | undefined, tenantId: string | undefined, dto: any) {
    const id = this.tid(companyId, tenantId);
    if (!dto?.title?.trim()) throw new BadRequestException('Nome da aula é obrigatório.');
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Horário inválido.');
    return this.prisma.gymClass.create({
      data: {
        tenantId: id,
        title: String(dto.title).trim().slice(0, 120),
        coach: dto.coach ? String(dto.coach).slice(0, 80) : null,
        room: dto.room ? String(dto.room).slice(0, 60) : null,
        startsAt,
        durationMin: Math.max(15, Math.min(300, Math.round(Number(dto.durationMin) || 60))),
        capacity: Math.max(1, Math.min(500, Math.round(Number(dto.capacity) || 20))),
      },
    });
  }

  async deleteClass(companyId: string | undefined, tenantId: string | undefined, id: string) {
    const tid = this.tid(companyId, tenantId);
    const existing = await this.prisma.gymClass.findFirst({ where: { id, tenantId: tid } });
    if (!existing) throw new NotFoundException('Aula não encontrada.');
    await this.prisma.gymClass.delete({ where: { id } });
    return { deleted: true, id };
  }

  async bookClass(companyId: string | undefined, tenantId: string | undefined, classId: string, studentId: string) {
    const id = this.tid(companyId, tenantId);
    const cls = await this.prisma.gymClass.findFirst({
      where: { id: classId, tenantId: id },
      include: { bookings: true },
    });
    if (!cls) throw new NotFoundException('Aula não encontrada.');
    const student = await this.prisma.gymStudent.findFirst({ where: { id: studentId, tenantId: id } });
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    const active = cls.bookings.filter((b) => b.status !== 'CANCELADO').length;
    if (active >= cls.capacity) throw new BadRequestException('Aula lotada.');
    const existing = cls.bookings.find((b) => b.studentId === studentId && b.status !== 'CANCELADO');
    if (existing) return existing;
    return this.prisma.gymClassBooking.create({
      data: { tenantId: id, classId: cls.id, studentId: student.id, status: 'RESERVADO' },
    });
  }

  async setBookingStatus(companyId: string | undefined, tenantId: string | undefined, bookingId: string, status: string) {
    const tid = this.tid(companyId, tenantId);
    if (!['RESERVADO', 'PRESENTE', 'FALTOU', 'CANCELADO'].includes(status)) {
      throw new BadRequestException('Status inválido.');
    }
    const booking = await this.prisma.gymClassBooking.findFirst({ where: { id: bookingId, tenantId: tid } });
    if (!booking) throw new NotFoundException('Reserva não encontrada.');
    return this.prisma.gymClassBooking.update({ where: { id: bookingId }, data: { status } });
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async dashboard(companyId?: string, tenantId?: string) {
    const id = this.tid(companyId, tenantId);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7 = new Date(now.getTime() + 7 * DAY);

    const [activeStudents, checkinsToday, newEnrollments, expiring, pendingBills, overdueBills, paidMonth, classesToday] =
      await Promise.all([
        this.prisma.gymStudent.count({ where: { tenantId: id, status: 'ATIVO' } }),
        this.prisma.gymCheckIn.findMany({
          where: { tenantId: id, createdAt: { gte: startToday } },
          select: { studentId: true, blocked: true },
          take: 2000,
        }),
        this.prisma.gymEnrollment.count({ where: { tenantId: id, createdAt: { gte: startMonth } } }),
        this.prisma.gymStudent.count({
          where: { tenantId: id, status: 'ATIVO', dueDate: { gte: now, lte: in7 } },
        }),
        this.prisma.billReceivable.aggregate({
          where: { tenantId: id, status: { in: ['PENDING', 'PARTIAL'] } },
          _sum: { amountCents: true, paidCents: true },
          _count: true,
        }),
        this.prisma.billReceivable.count({
          where: { tenantId: id, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } },
        }),
        this.prisma.billReceivable.aggregate({
          where: { tenantId: id, status: 'RECEIVED', receivedAt: { gte: startMonth } },
          _sum: { amountCents: true },
        }),
        this.prisma.gymClass.count({
          where: { tenantId: id, startsAt: { gte: startToday, lt: new Date(startToday.getTime() + DAY) } },
        }),
      ]);

    const presentIds = new Set(checkinsToday.filter((c) => !c.blocked).map((c) => c.studentId));

    return {
      activeStudents,
      presentToday: presentIds.size,
      checkinsToday: checkinsToday.length,
      newEnrollmentsMonth: newEnrollments,
      expiring7d: expiring,
      pendingBills: pendingBills._count,
      pendingCents: (pendingBills._sum.amountCents || 0) - (pendingBills._sum.paidCents || 0),
      overdueBills,
      revenueMonthCents: paidMonth._sum.amountCents || 0,
      classesToday,
    };
  }

  // ─── Relatórios ───────────────────────────────────────────────────────────

  async reports(companyId?: string, tenantId?: string) {
    const id = this.tid(companyId, tenantId);
    const now = new Date();

    const revenueByMonth: Array<{ month: string; cents: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const agg = await this.prisma.billReceivable.aggregate({
        where: { tenantId: id, status: 'RECEIVED', receivedAt: { gte: mStart, lt: mEnd } },
        _sum: { amountCents: true },
      });
      revenueByMonth.push({
        month: `${String(mStart.getMonth() + 1).padStart(2, '0')}/${mStart.getFullYear()}`,
        cents: agg._sum.amountCents || 0,
      });
    }

    const checkins14d: Array<{ day: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const dStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dEnd = new Date(dStart.getTime() + DAY);
      const count = await this.prisma.gymCheckIn.count({
        where: { tenantId: id, createdAt: { gte: dStart, lt: dEnd }, blocked: false },
      });
      checkins14d.push({
        day: `${String(dStart.getDate()).padStart(2, '0')}/${String(dStart.getMonth() + 1).padStart(2, '0')}`,
        count,
      });
    }

    const enrollments = await this.prisma.gymEnrollment.findMany({
      where: { tenantId: id },
      select: { plan: true, status: true },
      take: 2000,
    });
    const byPlan: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const e of enrollments) {
      byPlan[e.plan] = (byPlan[e.plan] || 0) + 1;
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }
    const topPlans = Object.entries(byPlan)
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const overdue = await this.prisma.billReceivable.aggregate({
      where: { tenantId: id, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } },
      _sum: { amountCents: true, paidCents: true },
      _count: true,
    });

    return {
      revenueByMonth,
      checkins14d,
      enrollmentsByStatus: byStatus,
      topPlans,
      delinquency: {
        count: overdue._count,
        cents: (overdue._sum.amountCents || 0) - (overdue._sum.paidCents || 0),
      },
    };
  }
}
