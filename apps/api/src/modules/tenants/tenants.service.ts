import { BadRequestException, ConflictException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  createManagedTenantSchema,
  NICHE_DEFAULT_CATEGORIES,
  NICHE_DEFAULT_PRODUCTS,
  TENANT_STATUS,
  SUBSCRIPTION_STATUS,
  AUTOMATION_TRIGGER,
} from '@projeto-saas/shared-types';
import { SlugService } from '../../common/services/slug.service';

@Injectable()
export class TenantsService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private readonly slugService: SlugService,
  ) {}

  async findAll(query: any) {
    const { page = 1, limit = 20, niche, status, search, planId } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (niche) where.niche = niche;
    if (status) where.status = status;
    if (planId) where.subscriptions = { some: { planId, status: SUBSCRIPTION_STATUS.ACTIVE } };
    if (search) {
      const q = String(search).trim();
      if (q.length) {
        where.OR = [
          { companyName: { contains: q } },
          { tradeName: { contains: q } },
          { cnpj: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          { slug: { contains: q } },
        ];
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip: Number(skip),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { users: true, tickets: true, invoices: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { dueDate: 'desc' }, take: 12 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, subject: true, status: true, priority: true, createdAt: true } },
        _count: { select: { tickets: true, users: true, orders: true, products: true, customers: true, appointments: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async validatePhone(phoneRaw: string, actor?: any) {
    if (!phoneRaw || !phoneRaw.trim()) {
      return { available: true, formatted: '', message: '' };
    }

    const digits = phoneRaw.replace(/\D/g, '');
    if (digits.length < 10) {
      return { available: true, formatted: phoneRaw, message: 'Informe DDD + número (10 ou 11 dígitos)' };
    }

    const without55 = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
    const normalizedPhone = `+55${without55}`;
    const actorId = actor?.id || actor?.sub;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: digits },
          { phone: without55 },
          { phone: phoneRaw.trim() },
        ],
      },
      select: {
        id: true,
        name: true,
        role: true,
        tenantId: true,
        tenant: { select: { companyName: true, tradeName: true } },
      },
    });

    if (!existingUser) {
      return {
        available: true,
        isSuperAdmin: false,
        formatted: normalizedPhone,
        message: 'Número livre para cadastro',
      };
    }

    const isSuperAdmin = existingUser.role === 'SUPER_ADMIN' || (actorId && actorId === existingUser.id);
    const isOrphan = !existingUser.tenantId;

    if (isSuperAdmin || isOrphan) {
      return {
        available: true,
        isSuperAdmin: true,
        formatted: normalizedPhone,
        message: 'Seu número de Super Admin (será vinculado a esta empresa)',
      };
    }

    const companyName = existingUser.tenant?.tradeName || existingUser.tenant?.companyName || 'outra empresa';

    return {
      available: false,
      isSuperAdmin: false,
      formatted: normalizedPhone,
      message: `Número já vinculado à empresa "${companyName}" (${existingUser.name})`,
    };
  }

  async create(data: any, actor?: any) {
    if (actor && actor.role !== 'SUPER_ADMIN') {
      throw new ConflictException('Somente o super administrador pode criar empresas');
    }

    const parsed = createManagedTenantSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const errorMsg = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${(errs as string[]).join(', ')}`)
        .join('; ');
      throw new BadRequestException(errorMsg || 'Dados de empresa inválidos');
    }

    const input = parsed.data;

    let normalizedAdminPhone: string | undefined = undefined;
    let digits = '';
    let without55 = '';
    if (input.phone) {
      digits = input.phone.replace(/\D/g, '');
      if (digits) {
        without55 = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
        normalizedAdminPhone = `+55${without55}`;
      }
    }

    const actorId = actor?.id || actor?.sub;

    const [existingUserByEmail, existingUserByPhone, existingTenant] = await Promise.all([
      input.adminEmail
        ? this.prisma.user.findUnique({
            where: { email: input.adminEmail },
            select: { id: true, role: true, tenantId: true, companyId: true, name: true, phone: true, email: true },
          })
        : Promise.resolve(null),
      normalizedAdminPhone
        ? this.prisma.user.findFirst({
            where: {
              OR: [
                { phone: normalizedAdminPhone },
                { phone: digits },
                { phone: without55 },
                { phone: input.phone },
              ],
            },
            select: { id: true, role: true, tenantId: true, companyId: true, name: true, email: true, phone: true },
          })
        : Promise.resolve(null),
      input.cnpj
        ? this.prisma.tenant.findUnique({ where: { cnpj: input.cnpj }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    if (existingTenant) {
      throw new ConflictException(`O CNPJ "${input.cnpj}" já está cadastrado`);
    }

    // Se o telefone já existe e NÃO pertence ao Super Admin ou a um usuário sem tenant:
    if (existingUserByPhone) {
      const isSuperAdminOrOrphan =
        existingUserByPhone.role === 'SUPER_ADMIN' ||
        (actorId && actorId === existingUserByPhone.id) ||
        !existingUserByPhone.tenantId;
      if (!isSuperAdminOrOrphan) {
        throw new ConflictException(`O número de WhatsApp "${input.phone}" já está vinculado à empresa de outro usuário.`);
      }
    }

    // Se o email já existe e NÃO pertence ao Super Admin ou a um usuário sem tenant:
    if (existingUserByEmail) {
      const isSameUser = existingUserByPhone && existingUserByPhone.id === existingUserByEmail.id;
      const isSuperAdminOrOrphan =
        existingUserByEmail.role === 'SUPER_ADMIN' ||
        (actorId && actorId === existingUserByEmail.id) ||
        !existingUserByEmail.tenantId;
      if (!isSameUser && !isSuperAdminOrOrphan) {
        throw new ConflictException(`O e-mail de administrador "${input.adminEmail}" já está cadastrado no sistema.`);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const preferred = (data as any).slug
          ? this.slugService.normalize((data as any).slug)
          : this.slugService.normalize(input.tradeName || input.companyName || 'empresa');
        const slug = await this.slugService.generateAvailable(preferred);

        const companyEmail = (input.email && input.email.trim().length > 0)
          ? input.email.trim()
          : input.adminEmail || `contato@${slug}.com`;

        // Trial is strictly controlled: only granted if not explicitly set to ACTIVE
        const isTrial = input.status !== TENANT_STATUS.ACTIVE;
        const trialEndsAt = isTrial ? new Date(Date.now() + (input.trialDays || 14) * 86400000) : null;
        const tenantStatus = isTrial ? TENANT_STATUS.TRIAL : TENANT_STATUS.ACTIVE;

        const tenant = await tx.tenant.create({
          data: {
            companyName: input.companyName,
            tradeName: input.tradeName || undefined,
            slug,
            cnpj: input.cnpj || undefined,
            niche: input.niche,
            email: companyEmail,
            phone: input.phone || undefined,
            address: input.address || undefined,
            status: tenantStatus,
            trialEndsAt,
          },
        });

        // Criar a Company (limite interno do tenant no Restaurant OS)
        const restCat = (input as any).restaurantCategory || 'BURGER_HOUSE';
        const company = await tx.company.create({
          data: {
            id: tenant.id,
            name: input.companyName,
            slug,
            cnpj: input.cnpj || null,
            category: restCat,
            plan: 'PRO',
            active: true,
            branding: JSON.stringify({
              primaryColor: (input as any).primaryColor || '#E63946',
              logoUrl: (input as any).logo || null,
              setupCompleted: false,
            }),
          },
        });

        // Role Admin do Restaurante
        const adminRole = await tx.role.create({
          data: {
            companyId: company.id,
            name: 'ADMIN',
            permissions: JSON.stringify(['*']),
          },
        });

        // Vincular ou criar o Administrador da Empresa
        const targetExistingUser =
          existingUserByPhone ||
          (existingUserByEmail &&
          (existingUserByEmail.role === 'SUPER_ADMIN' ||
            (actorId && actorId === existingUserByEmail.id) ||
            !existingUserByEmail.tenantId)
            ? existingUserByEmail
            : null);

        if (targetExistingUser) {
          const updateData: any = {
            tenantId: tenant.id,
            companyId: company.id,
            roleId: adminRole.id,
            isActive: true,
          };
          if (normalizedAdminPhone) {
            updateData.phone = normalizedAdminPhone;
          }
          if (input.adminPassword && input.adminPassword.trim().length >= 6) {
            updateData.passwordHash = await argon2.hash(input.adminPassword.trim());
          }
          if (input.adminName && input.adminName.trim().length > 0) {
            updateData.name = input.adminName.trim();
          }
          if (input.adminEmail && !input.adminEmail.endsWith('@projetosaas.com')) {
            const emailHolder = await tx.user.findUnique({ where: { email: input.adminEmail } });
            if (!emailHolder || emailHolder.id === targetExistingUser.id) {
              updateData.email = input.adminEmail;
            }
          }

          await tx.user.update({
            where: { id: targetExistingUser.id },
            data: updateData,
          });
        } else {
          await tx.user.create({
            data: {
              email: input.adminEmail,
              phone: normalizedAdminPhone,
              passwordHash: await argon2.hash(input.adminPassword),
              name: input.adminName,
              role: 'TENANT_ADMIN',
              tenantId: tenant.id,
              companyId: company.id,
              roleId: adminRole.id,
              isActive: true,
            },
          });
        }

      // Gerar as N Mesas com Tokens Opacos e Hashes Seguros (se tableCount > 0)
      const tableCount = Number((input as any).tableCount) || 0;
      const createdTablesWithTokens = [];

      for (let i = 1; i <= tableCount; i++) {
        const rawToken = crypto.randomBytes(24).toString('hex');
        const qrTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const tableLabel = `Mesa ${String(i).padStart(2, '0')}`;

        const table = await tx.table.create({
          data: {
            companyId: company.id,
            number: i,
            label: tableLabel,
            capacity: 4,
            status: 'FREE',
            qrTokenHash,
          },
        });

        createdTablesWithTokens.push({
          id: table.id,
          number: i,
          label: tableLabel,
          qrToken: rawToken, // Exclusivo no retorno da criação para impressão imediata
        });
      }

      // 1. Initial Store Settings (PIN, thermal printer, fiscal environment)
      await tx.storeSetting.create({
        data: {
          tenantId: tenant.id,
          storeName: input.tradeName || input.companyName,
          legalName: input.companyName,
          cnpj: input.cnpj || null,
          address: input.address || null,
          phone: input.phone || null,
          managerPin: '1234',
          thermalPrinter: '80mm',
          enabledPaymentMethods: 'DINHEIRO,PIX,CARTAO_DEBITO,CARTAO_CREDITO,VALE,FIADO',
          nfceEnvironment: 'HOMOLOGATION',
          maxCashierDiscount: 10,
        },
      });

      // 2. Initial Primary Checkout Terminal (PDV-01)
      await tx.cashierTerminal.create({
        data: {
          tenantId: tenant.id,
          code: 'PDV-01',
          name: 'Caixa Principal 01',
          status: 'ACTIVE',
        },
      });

      // 3. Initial Subscription linked to Plan
      let plan = null;
      if (input.planId) {
        plan = await tx.plan.findUnique({ where: { id: input.planId } });
      }
      if (!plan) {
        plan = (await tx.plan.findFirst({ where: { slug: 'pro' } })) || (await tx.plan.findFirst());
      }

      if (plan) {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            status: isTrial ? SUBSCRIPTION_STATUS.TRIALING : SUBSCRIPTION_STATUS.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndsAt || new Date(Date.now() + 30 * 86400000),
          },
        });
      }

      // 4. Starter Categories & Products (com Suporte a Catálogo Estático Versionado & Modificadores)
      let seededFromCatalog = false;
      let presetFile = 'burger-house.json';
      if (restCat === 'PIZZERIA') presetFile = 'pizzeria.json';
      else if (restCat === 'RESTAURANT') presetFile = 'restaurant.json';
      else if (restCat === 'JAPANESE') presetFile = 'japanese.json';
      else if (restCat === 'PASTRY') presetFile = 'pastry.json';

      let presetPath = path.join(__dirname, 'seed-catalog', presetFile);
      if (!fs.existsSync(presetPath)) {
        presetPath = path.join(process.cwd(), 'src', 'modules', 'tenants', 'seed-catalog', presetFile);
      }
      if (!fs.existsSync(presetPath)) {
        presetPath = path.join(process.cwd(), 'apps', 'api', 'src', 'modules', 'tenants', 'seed-catalog', presetFile);
      }
      if (fs.existsSync(presetPath)) {
        try {
          const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
          if (presetData && Array.isArray(presetData.categories)) {
            for (const catData of presetData.categories) {
              const category = await tx.productCategory.create({
                data: {
                  tenantId: tenant.id,
                  companyId: company.id,
                  name: catData.name,
                  sortOrder: catData.order || 0,
                  order: catData.order || 0,
                  active: true,
                },
              });

              if (Array.isArray(catData.products)) {
                for (const prodData of catData.products) {
                  const product = await tx.product.create({
                    data: {
                      tenantId: tenant.id,
                      companyId: company.id,
                      categoryId: category.id,
                      name: prodData.name,
                      description: prodData.description || null,
                      salePriceCents: prodData.priceCents || 2500,
                      costPriceCents: Math.round((prodData.priceCents || 2500) * 0.45),
                      stockQuantity: 50,
                      minStockAlert: 5,
                      unit: 'UN',
                      isActive: true,
                    },
                  });

                  if (Array.isArray(prodData.modifierGroups)) {
                    for (const modGroup of prodData.modifierGroups) {
                      const group = await tx.productModifierGroup.create({
                        data: {
                          productId: product.id,
                          name: modGroup.name,
                          minSelectable: modGroup.minSelectable ?? 0,
                          maxSelectable: modGroup.maxSelectable ?? 1,
                          isRequired: modGroup.isRequired ?? false,
                        },
                      });

                      if (Array.isArray(modGroup.items)) {
                        for (const item of modGroup.items) {
                          await tx.productModifierItem.create({
                            data: {
                              groupId: group.id,
                              name: item.name,
                              priceCents: item.priceCents || 0,
                            },
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
            seededFromCatalog = true;
          }
        } catch {
          seededFromCatalog = false;
        }
      }

      if (!seededFromCatalog) {
        const catTemplates = NICHE_DEFAULT_CATEGORIES[input.niche] || [];
        const createdCats = [];
        for (let i = 0; i < catTemplates.length; i++) {
          const cat = await tx.productCategory.create({
            data: {
              tenantId: tenant.id,
              companyId: company.id,
              name: catTemplates[i].name,
              color: catTemplates[i].color,
              sortOrder: i,
              order: i,
            },
          });
          createdCats.push(cat);
        }

        const prodTemplates = NICHE_DEFAULT_PRODUCTS[input.niche] || [];
        for (const prod of prodTemplates) {
          const assignedCat = createdCats[prod.categoryIndex]?.id || null;
          await tx.product.create({
            data: {
              tenantId: tenant.id,
              companyId: company.id,
              categoryId: assignedCat,
              name: prod.name,
              salePriceCents: prod.priceCents,
              costPriceCents: Math.round(prod.priceCents * 0.45),
              stockQuantity: 40,
              minStockAlert: 8,
              unit: prod.unit,
              isActive: true,
            },
          });
        }
      }

      // 5. Initial Automation Rules & Notifications
      await tx.automationRule.createMany({
        data: [
          {
            tenantId: tenant.id,
            trigger: AUTOMATION_TRIGGER.STOCK_BELOW_MIN,
            config: JSON.stringify({ notifyAlert: true, threshold: 8 }),
            isEnabled: true,
          },
          {
            tenantId: tenant.id,
            trigger: AUTOMATION_TRIGGER.DAILY_CLOSING,
            config: JSON.stringify({ autoSummary: true, time: '22:00' }),
            isEnabled: true,
          },
          {
            tenantId: tenant.id,
            trigger: AUTOMATION_TRIGGER.CLIENT_INACTIVE_30D,
            config: JSON.stringify({ discountCoupon: 'VOLTE10', days: 30 }),
            isEnabled: true,
          },
        ],
      });

      await tx.automationNotification.create({
        data: {
          tenantId: tenant.id,
          type: 'SYSTEM_SETUP',
          title: 'Restaurante provisionado com sucesso!',
          content: `Tudo pronto para ${input.companyName}! ${tableCount} mesas criadas com QR Codes, catálogo ${restCat} ativo e caixa configurado.`,
        },
      });

      // 6. Tenant Site with Visual Identity & Branding
      const templateKey = input.niche === 'RESTAURANT' ? 'bistro' : input.niche === 'BARBERSHOP' ? 'studio' : 'market';
      await tx.tenantSite.create({
        data: {
          tenantId: tenant.id,
          templateKey,
          theme: JSON.stringify({
            primaryColor: input.primaryColor || '#E63946',
            logo: input.logo || null,
            features: input.features || [],
          }),
          content: JSON.stringify({
            description: input.description || '',
          }),
          isPublished: true,
        },
      });

      return {
        ...tenant,
        company,
        tables: createdTablesWithTokens,
      };
    });
  } catch (err: any) {
    if (err instanceof ConflictException || err instanceof BadRequestException || err instanceof NotFoundException) {
      throw err;
    }
    if (err?.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : (err.meta?.target || 'campo único');
      if (String(target).includes('phone')) {
        throw new ConflictException(`O telefone/WhatsApp "${input.phone || ''}" já está em uso.`);
      }
      if (String(target).includes('email')) {
        throw new ConflictException(`O e-mail "${input.adminEmail || ''}" já está em uso.`);
      }
      if (String(target).includes('cnpj')) {
        throw new ConflictException(`O CNPJ "${input.cnpj || ''}" já está cadastrado.`);
      }
      if (String(target).includes('slug')) {
        throw new ConflictException(`O identificador "${(data as any).slug || ''}" já está em uso.`);
      }
      throw new ConflictException(`Conflito de unicidade no campo: ${target}.`);
    }
    throw err;
  }
}

  async update(id: string, data: any) {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  async suspend(id: string, reason: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { status: TENANT_STATUS.SUSPENDED },
    });
  }

  async reactivate(id: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { status: TENANT_STATUS.ACTIVE },
    });
  }

  async cancel(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id },
        data: { status: TENANT_STATUS.CANCELED },
      });
      await tx.subscription.updateMany({
        where: { tenantId: id, status: { not: SUBSCRIPTION_STATUS.CANCELED } },
        data: { status: SUBSCRIPTION_STATUS.CANCELED, canceledAt: new Date() },
      });
      return tenant;
    });
  }

  async extendTrial(id: string, days: number = 7) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException();
    const baseDate = tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
    const newEnd = new Date(baseDate.getTime() + days * 86400000);
    return this.prisma.tenant.update({ where: { id }, data: { trialEndsAt: newEnd } });
  }

  async viewAs(tenantId: string, adminUserId: string, reason: string = 'Support investigation') {
    await this.prisma.tenantAccessLog.create({
      data: { tenantId, adminUserId, reason },
    });
    return this.findOne(tenantId);
  }

  async getNotes(tenantId: string) {
    return this.prisma.tenantNote.findMany({
      where: { tenantId },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(tenantId: string, authorId: string, content: string) {
    return this.prisma.tenantNote.create({
      data: { tenantId, authorId, content },
    });
  }
}
