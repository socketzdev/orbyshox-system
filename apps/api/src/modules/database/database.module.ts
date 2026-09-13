import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { tenantIsolationExtension } from '@projeto-saas/database';

const prismaProvider = {
  provide: 'PRISMA',
  useFactory: (cls: ClsService) => {
    const base = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['warn', 'error'],
    });

    // Nota: o nome "tenantIsolation" é histórico — não há RLS neste projeto
    // (SQLite). A extensão hoje apenas emite avisos de leitura sem escopo de
    // tenant em desenvolvimento. Ela era definida mas nunca aplicada, então a
    // chave CLS divergente (`tenantId` vs `TENANT_ID`) passava despercebida.
    return base.$extends(tenantIsolationExtension(cls));
  },
  inject: [ClsService],
};

@Global()
@Module({
  providers: [prismaProvider],
  exports: [prismaProvider],
})
export class DatabaseModule {}
