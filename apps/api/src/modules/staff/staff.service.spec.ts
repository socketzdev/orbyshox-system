import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service';

/**
 * Estes testes protegem a correção de vazamento de dados: `findOne`,
 * `deactivate` e `activate` devolviam o registro COMPLETO do usuário
 * (incluindo `passwordHash` e `twoFactorSecret`) por não usarem `select`.
 */
describe('StaffService', () => {
  let service: StaffService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new StaffService(prisma);
  });

  describe('findOne', () => {
    it('pede explicitamente um conjunto seguro de campos ao Prisma', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ana', email: 'a@b.com' });

      await service.findOne('u1');

      const args = prisma.user.findUnique.mock.calls[0][0];
      expect(args.select).toBeDefined();
      expect(args.include).toBeUndefined();
      // Campos sensíveis nunca podem estar na projeção.
      expect(args.select.passwordHash).toBeUndefined();
      expect(args.select.twoFactorSecret).toBeUndefined();
      expect(args.select._count).toEqual({ select: { auditLogs: true } });
    });

    it('lança 404 quando o usuário não existe (antes devolvia null)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate / activate', () => {
    it('deactivate projeta apenas campos seguros', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({ id: 'u1', isActive: false });

      await service.deactivate('u1');

      const args = prisma.user.update.mock.calls[0][0];
      expect(args.select.passwordHash).toBeUndefined();
      expect(args.select.twoFactorSecret).toBeUndefined();
    });

    it('deactivate lança 404 para id inexistente', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('x')).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('sanitize (via update)', () => {
    it('ignora tentativa de mass assignment de role não permitida', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'SUPPORT_AGENT' });
      await expect(service.update('u1', { role: 'HACKER' })).rejects.toThrow(BadRequestException);
    });

    it('ignora passwordHash e twoFactorSecret injetados no corpo', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'SUPPORT_AGENT' });
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await service.update('u1', {
        name: 'Novo Nome',
        passwordHash: 'injetado',
        twoFactorSecret: 'injetado',
      });

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.passwordHash).toBeUndefined();
      expect(data.twoFactorSecret).toBeUndefined();
      expect(data.name).toBe('Novo Nome');
    });

    it('rejeita e-mail duplicado com 409', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', role: 'SUPPORT_AGENT' })
        .mockResolvedValueOnce({ id: 'u2', email: 'outro@b.com' });

      await expect(service.update('u1', { email: 'outro@b.com' })).rejects.toThrow(ConflictException);
    });
  });

  describe('create', () => {
    it('exige senha com pelo menos 8 caracteres', async () => {
      await expect(service.create({ name: 'X', email: 'x@y.com', password: '123' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('nunca devolve o hash na resposta (select explícito)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'x@y.com' });

      await service.create({ name: 'X', email: 'x@y.com', password: 'senha-forte' });

      const args = prisma.user.create.mock.calls[0][0];
      expect(args.select.passwordHash).toBeUndefined();
      expect(args.data.passwordHash).not.toBe('senha-forte'); // deve ser hash
      expect(args.data.passwordHash).toMatch(/^\$argon2/);
    });
  });
});
