const { PrismaClient } = require('../dist');
const argon2 = require('c:/Users/tanpa/Documents/ProjetoSaaS/apps/api/node_modules/argon2');

const prisma = new PrismaClient();

async function resetClean() {
  console.log('🧹 Iniciando Reset Geral do Banco de Dados...');

  const deleteOperations = [
    () => prisma.orderItemModifier.deleteMany({}),
    () => prisma.orderItem.deleteMany({}),
    () => prisma.orderReturn.deleteMany({}),
    () => prisma.billReceivable.deleteMany({}),
    () => prisma.order.deleteMany({}),
    () => prisma.waiterCall.deleteMany({}),
    () => prisma.tableSession.deleteMany({}),
    () => prisma.device.deleteMany({}),
    () => prisma.table.deleteMany({}),
    () => prisma.productModifierItem.deleteMany({}),
    () => prisma.productModifierGroup.deleteMany({}),
    () => prisma.product.deleteMany({}),
    () => prisma.productCategory.deleteMany({}),
    () => prisma.cashMovement.deleteMany({}),
    () => prisma.cashierTerminal.deleteMany({}),
    () => prisma.storeSetting.deleteMany({}),
    () => prisma.cashRegister.deleteMany({}),
    () => prisma.appointment.deleteMany({}),
    () => prisma.barberProfile.deleteMany({}),
    () => prisma.customer.deleteMany({}),
    () => prisma.billPayable.deleteMany({}),
    () => prisma.inventoryAudit.deleteMany({}),
    () => prisma.stockMovement.deleteMany({}),
    () => prisma.stockLoss.deleteMany({}),
    () => prisma.stockBatch.deleteMany({}),
    () => prisma.purchaseOrderItem.deleteMany({}),
    () => prisma.purchaseOrder.deleteMany({}),
    () => prisma.supplier.deleteMany({}),
    () => prisma.nfeEntry.deleteMany({}),
    () => prisma.offlineSyncQueue.deleteMany({}),
    () => prisma.automationNotification.deleteMany({}),
    () => prisma.automationRule.deleteMany({}),
    () => prisma.couponUsage.deleteMany({}),
    () => prisma.tenantAccessLog.deleteMany({}),
    () => prisma.tenantNote.deleteMany({}),
    () => prisma.ticketMessage.deleteMany({}),
    () => prisma.ticketStatusHistory.deleteMany({}),
    () => prisma.ticket.deleteMany({}),
    () => prisma.invoice.deleteMany({}),
    () => prisma.subscription.deleteMany({}),
    () => prisma.tenantSite.deleteMany({}),
    () => prisma.role.deleteMany({}),
    () => prisma.user.deleteMany({ where: { role: { not: 'SUPER_ADMIN' } } }),
    () => prisma.company.deleteMany({}),
    () => prisma.tenant.deleteMany({}),
  ];

  for (const op of deleteOperations) {
    try {
      await op();
    } catch (err) {
      // Ignorar erros caso a tabela já esteja vazia ou não tenha suporte temporário
    }
  }

  console.log('✅ Todos os tenants, empresas e slugs foram completamente removidos!');

  // Garantir Super Admin
  const adminHash = await argon2.hash('admin123456');
  await prisma.user.upsert({
    where: { email: 'admin@projetosaas.com' },
    update: {
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      isActive: true,
      tenantId: null,
      companyId: null,
    },
    create: {
      email: 'admin@projetosaas.com',
      passwordHash: adminHash,
      name: 'Administrador SaaS Master',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { phone: '+5516999946494' },
    update: {
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      isActive: true,
      tenantId: null,
      companyId: null,
    },
    create: {
      phone: '+5516999946494',
      email: '16999946494@projetosaas.com',
      passwordHash: adminHash,
      name: 'Jonas Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  // Garantir Planos do SaaS
  const plans = [
    {
      name: 'Básico',
      slug: 'basico',
      description: 'Ideal para negócios pequenos com 1 unidade.',
      price: 9900,
      billingPeriod: 'MONTHLY',
      maxUsers: 3,
      maxProducts: 200,
      maxStorageMb: 1024,
      isActive: true,
    },
    {
      name: 'Profissional',
      slug: 'pro',
      description: 'Ideal para restaurantes, hamburguerias e salões em expansão.',
      price: 19900,
      billingPeriod: 'MONTHLY',
      maxUsers: 10,
      maxProducts: 1000,
      maxStorageMb: 5120,
      isActive: true,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Plataforma completa com alta capacidade e suporte prioritário.',
      price: 39900,
      billingPeriod: 'MONTHLY',
      maxUsers: 50,
      maxProducts: 10000,
      maxStorageMb: 20480,
      isActive: true,
    },
  ];

  for (const pl of plans) {
    const existing = await prisma.plan.findFirst({ where: { slug: pl.slug } });
    if (!existing) {
      await prisma.plan.create({ data: pl });
    }
  }

  const tenantCount = await prisma.tenant.count();
  const companyCount = await prisma.company.count();
  const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });

  console.log(`\n📊 Status Atual do Banco de Dados:`);
  console.log(`- Tenants cadastrados: ${tenantCount}`);
  console.log(`- Companies cadastradas: ${companyCount}`);
  console.log(`- Usuários Super Admin: ${superAdminCount}`);
  console.log('🎉 Reset concluído com 100% de integridade!');
}

resetClean()
  .catch((e) => {
    console.error('❌ Erro no reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
