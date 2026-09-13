import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Papéis REAIS da plataforma — alinhado ao que existe em `User.role` no banco
 * e ao `seed.ts`. A lista anterior (`ADMIN`/`SUPPORT`/`VIEWER`) não correspondia
 * a nenhum usuário real e teria rejeitado a criação de operadores legítimos.
 * `TENANT_ADMIN` fica de fora: este módulo gere apenas a equipe interna.
 */
const ALLOWED_ROLES = ['SUPER_ADMIN', 'SUPPORT_MANAGER', 'SUPPORT_AGENT', 'FINANCE', 'DEV'] as const;

/**
 * Campos que o cliente PODE editar. `passwordHash`, `is2faEnabled`,
 * `twoFactorSecret` e `id` ficam de fora — antes o corpo da requisição era
 * repassado direto ao Prisma (`data: any`), permitindo mass assignment
 * (ex.: `{"role":"SUPER_ADMIN"}` ou sobrescrever o hash de senha).
 */
const EDITABLE_FIELDS = ['name', 'email', 'role', 'isActive'] as const;

/**
 * Campos seguros de um usuário interno — nunca inclui `passwordHash`,
 * `twoFactorSecret` nem os `RecoveryCode`s. Antes, `findOne` usava `include`
 * sem `select`, devolvendo o registro COMPLETO do `User` em
 * `GET /staff/:id` (vazamento de hash de senha e segredo TOTP). Os endpoints
 * `deactivate`/`activate` também devolviam o registro inteiro do Prisma.
 */
const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  position: true,
  isActive: true,
  is2faEnabled: true,
  tenantId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class StaffService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async findAll() { return this.prisma.user.findMany({ where: { tenantId: null }, select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true } }); }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...STAFF_SELECT, _count: { select: { auditLogs: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  /** Mantém apenas campos editáveis, aplicando validação de papel/e-mail. */
  private sanitize(data: any, { requireEmail = false } = {}) {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Dados inválidos');
    }

    const clean: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (data[field] !== undefined) clean[field] = data[field];
    }

    if (clean.email !== undefined) {
      if (typeof clean.email !== 'string' || !clean.email.includes('@')) {
        throw new BadRequestException('E-mail inválido');
      }
      clean.email = clean.email.trim().toLowerCase();
    } else if (requireEmail) {
      throw new BadRequestException('E-mail é obrigatório');
    }

    if (clean.role !== undefined && !ALLOWED_ROLES.includes(clean.role)) {
      throw new BadRequestException(
        `Papel inválido. Permitidos: ${ALLOWED_ROLES.join(', ')}`,
      );
    }

    if (clean.isActive !== undefined && typeof clean.isActive !== 'boolean') {
      throw new BadRequestException('isActive deve ser booleano');
    }

    if (Object.keys(clean).length === 0) {
      throw new BadRequestException('Nenhum campo editável informado');
    }

    return clean;
  }

  async create(data: any) {
    if (!data?.name || typeof data.name !== 'string') {
      throw new BadRequestException('Nome é obrigatório');
    }
    if (typeof data.password !== 'string' || data.password.length < 8) {
      throw new BadRequestException('Senha deve ter ao menos 8 caracteres');
    }

    const clean = this.sanitize(data, { requireEmail: true });

    const existing = await this.prisma.user.findUnique({ where: { email: clean.email } });
    if (existing) throw new ConflictException('Já existe um usuário com esse e-mail');

    return this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: clean.email,
        role: clean.role ?? 'SUPPORT_AGENT',
        passwordHash: await argon2.hash(data.password),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
  }

  async update(id: string, data: any) {
    const clean = this.sanitize(data);

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuário não encontrado');

    if (clean.email && clean.email !== target.email) {
      const dup = await this.prisma.user.findUnique({ where: { email: clean.email } });
      if (dup) throw new ConflictException('Já existe um usuário com esse e-mail');
    }

    return this.prisma.user.update({
      where: { id },
      data: clean,
      select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
    });
  }

  async deactivate(id: string) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
    });
  }

  async activate(id: string) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
    });
  }
}
