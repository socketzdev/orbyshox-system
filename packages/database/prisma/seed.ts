import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  USER_ROLE,
  TENANT_STATUS,
  SUBSCRIPTION_STATUS,
  INVOICE_STATUS,
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_CATEGORY,
  COUPON_DISCOUNT_TYPE,
  BILLING_PERIOD,
} from '@projeto-saas/shared-types';

const prisma = new PrismaClient();

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('Seeding database...');

  await prisma.systemSetting.deleteMany({});
  await prisma.planFeature.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.plan.deleteMany({});

  const adminPassword = 'admin123456';
  const adminHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@projetosaas.com' },
    update: {
      passwordHash: adminHash,
      role: USER_ROLE.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      email: 'admin@projetosaas.com',
      passwordHash: adminHash,
      name: 'Administrador',
      role: USER_ROLE.SUPER_ADMIN,
      is2faEnabled: false,
      isActive: true,
    },
  });

  const staffSeed = [
    { email: 'finance@projetosaas.com', name: 'Marina Financeiro', role: USER_ROLE.FINANCE },
    { email: 'support.manager@projetosaas.com', name: 'Bruno Suporte', role: USER_ROLE.SUPPORT_MANAGER },
    { email: 'dev@projetosaas.com', name: 'Carla Dev', role: USER_ROLE.DEV },
    { email: 'agent@projetosaas.com', name: 'Diego Agente', role: USER_ROLE.SUPPORT_AGENT },
  ];
  for (const staff of staffSeed) {
    await prisma.user.upsert({
      where: { email: staff.email },
      update: { role: staff.role, isActive: true },
      create: {
        email: staff.email,
        name: staff.name,
        role: staff.role,
        passwordHash: adminHash,
        isActive: true,
      },
    });
  }

  const customUser = await prisma.user.upsert({
    where: { phone: '+5516999946494' },
    update: {
      phone: '+5516999946494',
      email: '16999946494@projetosaas.com',
      name: 'Jonas',
      role: USER_ROLE.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      phone: '+5516999946494',
      email: '16999946494@projetosaas.com',
      name: 'Jonas',
      role: USER_ROLE.SUPER_ADMIN,
      passwordHash: adminHash,
      isActive: true,
    },
  });

  const basicPlan = await prisma.plan.create({
    data: {
      name: 'Básico',
      slug: 'basico',
      description: 'Ideal para negócios pequenos com uma unidade e poucos usuários.',
      price: 9900,
      billingPeriod: BILLING_PERIOD.MONTHLY,
      maxUsers: 2,
      maxUnits: 1,
      isVisible: true,
      features: {
        create: [
          { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
          { featureKey: 'basic_reports', featureLabel: 'Relatórios Básicos', enabled: true },
          { featureKey: 'advanced_reports', featureLabel: 'Relatórios Avançados', enabled: false },
          { featureKey: 'multi_unit', featureLabel: 'Multi-unidade', enabled: false },
        ],
      },
    },
  });

  const proPlan = await prisma.plan.create({
    data: {
      name: 'Pro',
      slug: 'pro',
      description: 'Para negócios em crescimento que precisam de relatórios avançados.',
      price: 19900,
      billingPeriod: BILLING_PERIOD.MONTHLY,
      maxUsers: 10,
      maxUnits: 3,
      isVisible: true,
      features: {
        create: [
          { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
          { featureKey: 'basic_reports', featureLabel: 'Relatórios Básicos', enabled: true },
          { featureKey: 'advanced_reports', featureLabel: 'Relatórios Avançados', enabled: true },
          { featureKey: 'multi_unit', featureLabel: 'Multi-unidade', enabled: false },
        ],
      },
    },
  });

  const enterprisePlan = await prisma.plan.create({
    data: {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Para redes com múltiplas unidades e suporte prioritário.',
      price: 49900,
      billingPeriod: BILLING_PERIOD.MONTHLY,
      maxUsers: 50,
      maxUnits: 20,
      isVisible: true,
      features: {
        create: [
          { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
          { featureKey: 'basic_reports', featureLabel: 'Relatórios Básicos', enabled: true },
          { featureKey: 'advanced_reports', featureLabel: 'Relatórios Avançados', enabled: true },
          { featureKey: 'multi_unit', featureLabel: 'Multi-unidade', enabled: true },
          { featureKey: 'priority_support', featureLabel: 'Suporte Prioritário', enabled: true },
        ],
      },
    },
  });

  const coupons = [
    {
      code: 'BEMVINDO10',
      description: '10% de desconto nos dois primeiros meses para novos clientes',
      discountType: COUPON_DISCOUNT_TYPE.PERCENTAGE,
      discountValue: 10,
      maxUses: 100,
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
    {
      code: 'BLACKFRIDAY',
      description: '30% de desconto na Black Friday',
      discountType: COUPON_DISCOUNT_TYPE.PERCENTAGE,
      discountValue: 30,
      maxUses: 50,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
    {
      code: 'DESCONTO50',
      description: 'R$50 de desconto no plano Pro',
      discountType: COUPON_DISCOUNT_TYPE.FIXED_AMOUNT,
      discountValue: 5000,
      maxUses: 20,
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isActive: true,
      planId: proPlan.id,
    },
  ];
  for (const coupon of coupons) {
    await prisma.coupon.create({ data: coupon });
  }

  const tenants = [
    {
      companyName: 'Restaurante Sabor & Arte LTDA',
      tradeName: 'Sabor & Arte',
      cnpj: '12.345.678/0001-01',
      niche: 'RESTAURANT',
      email: 'contato@saborarte.com.br',
      phone: '(11) 99999-0001',
      status: TENANT_STATUS.ACTIVE,
      planId: proPlan.id,
      address: 'Rua das Flores, 250 · São Paulo - SP',
    },
    {
      companyName: 'Barbearia Dom Corte LTDA',
      tradeName: 'Dom Corte',
      cnpj: '12.345.678/0001-02',
      niche: 'BARBERSHOP',
      email: 'contato@domcorte.com.br',
      phone: '(11) 99999-0002',
      status: TENANT_STATUS.ACTIVE,
      planId: proPlan.id,
      address: 'Av. Central, 480 · São Paulo - SP',
    },
    {
      companyName: 'Supermercado Economia Total LTDA',
      tradeName: 'Economia Total',
      cnpj: '12.345.678/0001-03',
      niche: 'SUPERMARKET',
      email: 'contato@economiatotal.com.br',
      phone: '(16) 99994-6494',
      status: TENANT_STATUS.TRIAL,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      planId: basicPlan.id,
      address: 'Rua das Palmeiras, 900 · São Paulo - SP',
    },
    {
      companyName: 'Pizzaria Bella Napoli LTDA',
      tradeName: 'Bella Napoli',
      cnpj: '12.345.678/0001-04',
      niche: 'RESTAURANT',
      email: 'contato@bellanapoli.com.br',
      phone: '(11) 99999-0004',
      status: TENANT_STATUS.ACTIVE,
      planId: enterprisePlan.id,
      address: 'Rua Itália, 100 · São Paulo - SP',
    },
    {
      companyName: 'Barbearia Kings LTDA',
      tradeName: 'Kings Barber',
      cnpj: '12.345.678/0001-05',
      niche: 'BARBERSHOP',
      email: 'contato@kingsbarber.com.br',
      phone: '(11) 99999-0005',
      status: TENANT_STATUS.PAST_DUE,
      planId: proPlan.id,
      address: 'Rua da Moda, 333 · São Paulo - SP',
    },
  ];

  for (const tenantData of tenants) {
    const { planId, ...tenantFields } = tenantData;
    const slug = slugify(tenantFields.tradeName || tenantFields.companyName);

    const tenant = await prisma.tenant.upsert({
      where: { cnpj: tenantFields.cnpj! },
      update: { status: tenantFields.status, slug },
      create: { ...tenantFields, slug },
    });

    const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
    if (!existingSub) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId,
          status:
            tenantFields.status === TENANT_STATUS.ACTIVE
              ? SUBSCRIPTION_STATUS.ACTIVE
              : tenantFields.status === TENANT_STATUS.PAST_DUE
              ? SUBSCRIPTION_STATUS.PAST_DUE
              : SUBSCRIPTION_STATUS.TRIALING,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await prisma.user.upsert({
      where: { email: tenantFields.email },
      update: { tenantId: tenant.id, role: USER_ROLE.TENANT_ADMIN, isActive: true, phone: tenantFields.phone },
      create: {
        email: tenantFields.email,
        name: `Admin ${tenantFields.tradeName}`,
        role: USER_ROLE.TENANT_ADMIN,
        passwordHash: adminHash,
        phone: tenantFields.phone,
        tenantId: tenant.id,
        isActive: true,
      },
    });

    await prisma.tenantSite.upsert({
      where: { tenantId: tenant.id },
      update: { isPublished: true },
      create: {
        tenantId: tenant.id,
        templateKey:
          tenantFields.niche === 'RESTAURANT'
            ? 'bistro'
            : tenantFields.niche === 'BARBERSHOP'
            ? 'studio'
            : 'market',
        theme: '{}',
        content: '{}',
        isPublished: true,
      },
    });

    if (tenantFields.status === TENANT_STATUS.ACTIVE) {
      const subscriptionId = (await prisma.subscription.findFirst({ where: { tenantId: tenant.id } }))!.id;
      for (let i = 0; i < 3; i++) {
        const dueDate = new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000);
        await prisma.invoice.create({
          data: {
            tenantId: tenant.id,
            subscriptionId,
            amountCents: 19900,
            status: INVOICE_STATUS.PAID,
            dueDate,
            paidAt: i === 0 ? new Date() : new Date(dueDate.getTime() + 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    if (tenantFields.status === TENANT_STATUS.PAST_DUE) {
      const subscriptionId = (await prisma.subscription.findFirst({ where: { tenantId: tenant.id } }))!.id;
      await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId,
          amountCents: 19900,
          status: INVOICE_STATUS.OVERDUE,
          dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  const firstTenant = await prisma.tenant.findFirst();
  if (firstTenant) {
    await prisma.ticket.create({
      data: {
        tenantId: firstTenant.id,
        createdById: admin.id,
        subject: 'Não consigo emitir relatórios financeiros',
        category: TICKET_CATEGORY.TECHNICAL,
        priority: TICKET_PRIORITY.HIGH,
        status: TICKET_STATUS.OPEN,
        slaDeadline: new Date(Date.now() + 2 * 3600 * 1000),
        messages: {
          create: [
            {
              authorId: admin.id,
              content: 'Cliente relata erro ao gerar o DRE do mês corrente.',
              isInternal: false,
              isFromCustomer: true,
            },
          ],
        },
      },
    });
  }

  await prisma.knowledgeArticle.create({
    data: {
      title: 'Como configurar o webhook do Stripe',
      content: '# Stripe Webhook\n1. Acesse Developers > Webhooks\n2. Adicione a URL .../api/v1/billing/webhook\n3. Copie o signing secret para STRIPE_WEBHOOK_SECRET',
      category: 'Pagamentos',
      authorId: admin.id,
      isPublished: true,
    },
  });

  await prisma.knowledgeArticle.create({
    data: {
      title: 'Boas-vindas ao painel Super Admin',
      content: 'Use este espaço para publicar manuais internos, FAQs e procedimentos para a equipe.',
      category: 'Onboarding',
      authorId: admin.id,
      isPublished: true,
    },
  });

  const settings: Array<{ key: string; value: string; description: string }> = [
    { key: 'TRIAL_DURATION_DAYS', value: '14', description: 'Duração padrão do trial em dias' },
    { key: 'TRIAL_REQUIRE_CARD', value: 'false', description: 'Exigir cartão no trial' },
    { key: 'DEFAULT_CURRENCY', value: '"BRL"', description: 'Moeda padrão' },
    { key: 'DELINQUENCY_SUSPEND_DAYS', value: '7', description: 'Dias para suspender por inadimplência' },
    { key: 'DELINQUENCY_CANCEL_DAYS', value: '30', description: 'Dias para cancelar por inadimplência' },
    { key: 'DELINQUENCY_CONFIG', value: JSON.stringify({ suspend_days: 7, cancel_days: 30 }), description: 'Configuração completa de inadimplência' },
    { key: 'TRIAL_COMMUNICATION_CONFIG', value: JSON.stringify({ d1: true, d7: true, d13: true }), description: 'Cronograma de comunicação do trial' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: s,
    });
  }

  await prisma.emailTemplate.upsert({
    where: { slug: 'welcome' },
    update: {},
    create: {
      slug: 'welcome',
      name: 'Boas-vindas',
      subject: 'Bem-vindo ao {{platformName}}',
      bodyHtml: '<h1>Olá {{name}}</h1><p>Seu acesso ao painel já está liberado.</p>',
      bodyText: 'Olá {{name}}, seu acesso ao painel já está liberado.',
      variables: 'name, platformName',
    },
  });
  await prisma.emailTemplate.upsert({
    where: { slug: 'payment_failed' },
    update: {},
    create: {
      slug: 'payment_failed',
      name: 'Pagamento recusado',
      subject: 'Não conseguimos processar seu pagamento',
      bodyHtml: '<p>Olá {{name}}, identificamos um problema no pagamento do seu plano.</p>',
      bodyText: 'Olá {{name}}, identificamos um problema no pagamento.',
      variables: 'name',
    },
  });

  console.log('Seed concluído com sucesso.');
  console.log(`Admin: admin@projetosaas.com / ${adminPassword}`);
  console.log(`Tenants: ${tenants.length}`);
  console.log('Plan(s): basic, pro, enterprise');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
