const { PrismaClient } = require("c:/Users/tanpa/Documents/ProjetoSaaS/packages/database/node_modules/@prisma/client");
const prisma = new PrismaClient();

async function seedSimulatedProducts() {
  console.log('--- Criando produtos simulados com fotos reais para Restaurante do Gordo ---');

  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'restaurante-do-gordo' },
  });

  if (!tenant) {
    console.error('Tenant restaurante-do-gordo não encontrado!');
    process.exit(1);
  }

  const simulatedProducts = [
    {
      category: 'Aves & Grelhados',
      name: 'Frango Grelhado Especial',
      description: 'Peito de frango suculento marinado em ervas finas, servido com salada fresca e molho artesanal.',
      salePriceCents: 1800, // R$ 18,00
      imageUrl: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 45,
      unit: 'UN',
    },
    {
      category: 'Sobremesas',
      name: 'Bolo Cítrico Tropical',
      description: 'Fatia fofa de bolo artesanal com cobertura cítrica de laranja e fatias caramelizadas.',
      salePriceCents: 850, // R$ 8,50
      imageUrl: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 25,
      unit: 'UN',
    },
    {
      category: 'Frutos do Mar',
      name: 'Salada de Camarão Picante',
      description: 'Camarões grelhados salteados em especiarias leves sobre cama de folhas nobres e molho cítrico.',
      salePriceCents: 1200, // R$ 12,00
      imageUrl: 'https://images.unsplash.com/photo-1551248429-40975aa4de74?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 30,
      unit: 'UN',
    },
    {
      category: 'Japonês',
      name: 'Combo Sushi Roll Especial',
      description: 'Rolls de salmão fresco com cream cheese, cebolinha fresca e gergelim tostado.',
      salePriceCents: 3000, // R$ 30,00
      imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 50,
      unit: 'UN',
    },
    {
      category: 'Massas',
      name: 'Spaghetti Carbonara Nobre',
      description: 'Spaghetti al dente com pancetta crocante, gemas selecionadas, queijo pecorino e pimenta preta moída.',
      salePriceCents: 1500, // R$ 15,00
      imageUrl: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 40,
      unit: 'UN',
    },
    {
      category: 'Burgers',
      name: 'Cheeseburger Clássico Artesanal',
      description: 'Blend 180g de carne nobre grelhada no fogo, queijo cheddar derretido, alface, tomate e pão brioche amanteigado.',
      salePriceCents: 1000, // R$ 10,00
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 60,
      unit: 'UN',
    },
    {
      category: 'Massas',
      name: 'Penne Clássico Italiano',
      description: 'Penne grano duro ao molho pomodoro rústico, manjericão fresco e queijo parmesão ralado na hora.',
      salePriceCents: 2200, // R$ 22,00
      imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281041?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 35,
      unit: 'UN',
    },
    {
      category: 'Pizzas',
      name: 'Pizza Supreme Crocante',
      description: 'Massa fermentada 48h, molho pelati italiano, mozzarella fior di latte, pepperoni artesanal e orégano fresco.',
      salePriceCents: 4500, // R$ 45,00
      imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
      stockQuantity: 20,
      unit: 'UN',
    },
  ];

  for (const item of simulatedProducts) {
    let cat = await prisma.productCategory.findFirst({
      where: { companyId: tenant.id, name: item.category },
    });

    if (!cat) {
      cat = await prisma.productCategory.create({
        data: {
          companyId: tenant.id,
          name: item.category,
          active: true,
          order: 1,
        },
      });
      console.log(`+ Categoria criada: ${cat.name}`);
    }

    const existingProd = await prisma.product.findFirst({
      where: { companyId: tenant.id, name: item.name },
    });

    if (!existingProd) {
      const prod = await prisma.product.create({
        data: {
          companyId: tenant.id,
          tenantId: tenant.id,
          categoryId: cat.id,
          name: item.name,
          description: item.description,
          salePriceCents: item.salePriceCents,
          imageUrl: item.imageUrl,
          stockQuantity: item.stockQuantity,
          unit: item.unit,
          isActive: true,
          minStockAlert: 5,
        },
      });
      console.log(`+ Produto criado: ${prod.name} (R$ ${prod.salePriceCents / 100})`);
    } else {
      await prisma.product.update({
        where: { id: existingProd.id },
        data: {
          imageUrl: item.imageUrl,
          salePriceCents: item.salePriceCents,
          description: item.description,
          isActive: true,
        },
      });
      console.log(`~ Produto atualizado com foto: ${existingProd.name}`);
    }
  }

  console.log('✅ Todos os produtos simulados foram inseridos com sucesso com fotos reais!');
  await prisma.$disconnect();
}

seedSimulatedProducts().catch((e) => {
  console.error(e);
  process.exit(1);
});
