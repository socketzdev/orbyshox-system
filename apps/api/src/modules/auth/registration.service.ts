import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { TENANT_STATUS, USER_ROLE } from '@projeto-saas/shared-types';
import { NotificationsService } from '../notifications/notifications.service';
import { VerificationService } from './verification.service';

export type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  companyName: string;
  tradeName?: string;
  niche: string;
  slug: string;
  phone?: string;
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

@Injectable()
export class RegistrationService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private readonly verification: VerificationService,
    private readonly notifications: NotificationsService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.toLowerCase();
    const slug = slugify(input.slug || input.tradeName || input.companyName);

    // Trial and tenant onboarding is strictly restricted to Super Admin
    throw new ForbiddenException(
      'O período de testes (Trial) e a ativação de empresas são liberados exclusivamente pelo Super Administrador da plataforma. Entre em contato com a equipe comercial.',
    );

    const [existingUser, existingTenant, existingSlug] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.tenant.findFirst({ where: { email } }),
      this.prisma.tenant.findUnique({ where: { slug } }),
    ]);

    if (existingUser || existingTenant) throw new ConflictException('Este e-mail j\u00e1 possui uma conta');
    if (existingSlug) throw new ConflictException('Este endere\u00e7o de empresa j\u00e1 est\u00e1 em uso');

    const passwordHash = await argon2.hash(input.password);

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          companyName: input.companyName,
          tradeName: input.tradeName ?? null,
          slug,
          niche: input.niche,
          email,
          phone: input.phone ?? null,
          status: TENANT_STATUS.TRIAL,
          trialEndsAt,
        },
      });

      await tx.tenantSite.create({
        data: {
          tenantId: createdTenant.id,
          templateKey: input.niche === 'RESTAURANT' ? 'bistro' : input.niche === 'BARBERSHOP' ? 'studio' : 'market',
          theme: '{}',
          content: '{}',
          isPublished: true,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: input.fullName,
          role: USER_ROLE.TENANT_ADMIN,
          tenantId: createdTenant.id,
          isActive: false,
        },
      });

      return { tenant: createdTenant, user: createdUser };
    });

    const verification = await this.verification.issueEmailVerification(email);
    await this.notifications.sendWelcome({ email, companyName: tenant.companyName, verificationUrl: verification.token });

    return { tenant, user: { id: user.id, email: user.email, name: user.name }, verificationToken: verification.token };
  }

  verifySlug(slug: string) {
    const normalized = slugify(slug);
    return { slug: normalized, valid: normalized.length >= 3 };
  }
}
