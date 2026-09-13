import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { tenantIsolationExtension } from './extensions/tenant-isolation';

export * from '@prisma/client';
export { tenantIsolationExtension, CLS_TENANT_KEY } from './extensions/tenant-isolation';

/**
 * Cria um PrismaClient com a extensão de auditoria de escopo de tenant.
 *
 * ATENÇÃO: apesar do nome histórico, não há RLS neste projeto — o provider é
 * SQLite e o isolamento é feito explicitamente nos services
 * (`where: { tenantId }`). A extensão apenas emite avisos em desenvolvimento.
 */
export function createPrismaClient(cls?: ClsService) {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  if (cls) {
    return prisma.$extends(tenantIsolationExtension(cls));
  }

  return prisma;
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
