import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const supermarkets = await prisma.tenant.findMany({
    where: { niche: 'SUPERMARKET' },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, phone: true, isActive: true } },
      categories: { select: { id: true, name: true, slug: true } },
      products: { select: { id: true, name: true, price: true, sku: true, stockQuantity: true, category: { select: { name: true } } } },
      orders: { select: { id: true, totalCents: true, status: true } },
      subscriptions: { include: { plan: true } },
      site: true,
    }
  });

  console.log('=== SUPERMARKET TENANTS ===');
  for (const s of supermarkets) {
    console.log(\n--- Tenant:  () ---);
    console.log('ID:', s.id);
    console.log('Status:', s.status);
    console.log('Email:', s.email);
    console.log('Trial ends:', s.trialEndsAt);
    console.log('Users:', JSON.stringify(s.users));
    console.log('Categories count:', s.categories.length, s.categories.map(c => c.name));
    console.log('Products count:', s.products.length, s.products.map(p => ${p.name} (R$ )));
    console.log('Orders count:', s.orders.length);
    console.log('Subscription:', s.subscriptions.map(sub => ${sub.plan?.name || 'Nenhum'} ()));
    console.log('Site template:', s.site?.templateKey);
  }
}

main().catch(console.error).finally(() => prisma.());
