import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Criando usuario de teste para o numero 16999946494...');

  const passwordHash = await argon2.hash('admin123456');

  // Buscar primeiro tenant para associar se necessario (ex: Barbearia)
  const tenant = (await prisma.tenant.findFirst({
    where: { niche: 'BARBERSHOP' },
  })) || (await prisma.tenant.findFirst());

  // Criar ou atualizar usuario com phone +5516999946494
  const user1 = await prisma.user.upsert({
    where: { phone: '+5516999946494' },
    update: {
      name: 'Jonas (Teste 16999946494)',
      email: '16999946494@projetosaas.com',
      role: 'SUPER_ADMIN',
      passwordHash,
      isActive: true,
      tenantId: tenant?.id || null,
    },
    create: {
      phone: '+5516999946494',
      name: 'Jonas (Teste 16999946494)',
      email: '16999946494@projetosaas.com',
      role: 'SUPER_ADMIN',
      passwordHash,
      isActive: true,
      tenantId: tenant?.id || null,
    },
  });

  console.log('Usuario principal criado/atualizado:', {
    id: user1.id,
    phone: user1.phone,
    email: user1.email,
    name: user1.name,
    role: user1.role,
    tenantId: user1.tenantId,
  });

  // Criar cliente de teste caso queira testar agendamentos
  if (tenant) {
    const customer = await prisma.customer.upsert({
      where: {
        id: 'cust-test-16999946494',
      },
      update: {
        name: 'Jonas Cliente Teste',
        phone: '(16) 99994-6494',
        email: '16999946494@projetosaas.com',
      },
      create: {
        id: 'cust-test-16999946494',
        tenantId: tenant.id,
        name: 'Jonas Cliente Teste',
        phone: '(16) 99994-6494',
        email: '16999946494@projetosaas.com',
      },
    });
    console.log('Customer criado no tenant:', tenant.companyName, customer.id);
  }

  // Vincular BarberProfile se existir
  try {
    await prisma.barberProfile.upsert({
      where: { userId: user1.id },
      update: {
        displayName: 'Jonas Barbeiro Master',
        bio: 'Barbeiro especialista e Super Admin de testes',
        isActive: true,
      },
      create: {
        userId: user1.id,
        displayName: 'Jonas Barbeiro Master',
        bio: 'Barbeiro especialista e Super Admin de testes',
        isActive: true,
        commissionPercent: 50,
      },
    });
    console.log('BarberProfile vinculado com sucesso.');
  } catch (err) {
    console.log('BarberProfile notice:', err.message);
  }

  console.log('\n=============================================');
  console.log('USUARIO DE TESTE PRONTO PARA USO:');
  console.log('Telefone: 16999946494 ou +5516999946494');
  console.log('E-mail:   16999946494@projetosaas.com');
  console.log('Senha:    admin123456');
  console.log('Funcao:   SUPER_ADMIN (acesso total)');
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar usuario:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
