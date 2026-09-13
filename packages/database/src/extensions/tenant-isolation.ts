import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

/** Chave usada pelo TenantContextMiddleware (`cls.set('tenantId', ...)`). */
export const CLS_TENANT_KEY = 'tenantId';

/** Models que NUNCA devem ser filtrados por tenant (tabelas de plataforma). */
const GLOBAL_MODELS = new Set(['Tenant', 'User', 'RefreshToken', 'RecoveryCode', 'Plan', 'Coupon', 'Invoice']);

/**
 * Aviso de isolamento multi-tenant.
 *
 * IMPORTANTE — o nome deste arquivo é histórico. NÃO há RLS em uso neste
 * projeto: o `schema.prisma` usa `provider = "sqlite"`, que não suporta
 * Row-Level Security, e os services escopam as consultas explicitamente com
 * `where: { tenantId: tenant.id }`.
 *
 * A versão anterior deste arquivo emulava RLS via
 * `SELECT set_config('app.current_tenant_id', ...)` — comando que só existe no
 * PostgreSQL. Como o client nunca era estendido (ver `database.module.ts`), o
 * código nunca executava; se tivesse executado, quebraria em runtime.
 *
 * O que este middleware faz agora: registra em log qualquer leitura de model
 * *tenant-scoped* feita SEM contexto de tenant e SEM filtro de `tenantId` no
 * `where`. Não bloqueia a query (para não derrubar rotas legítimas de Super
 * Admin), mas torna o vazamento cross-tenant visível durante o desenvolvimento.
 *
 * TODO(isolamento): a solução definitiva é migrar para PostgreSQL e aplicar RLS
 * de verdade, ou adotar um wrapper que injete `tenantId` obrigatoriamente.
 */
export const tenantIsolationExtension = (cls: ClsService) =>
  Prisma.defineExtension({
    name: 'tenantIsolationAudit',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = cls.get<string>(CLS_TENANT_KEY);

          // Com contexto de tenant, o esperado é que o service já filtre.
          // Sem contexto (Super Admin), a ausência de filtro é legítima.
          if (tenantId || GLOBAL_MODELS.has(model)) {
            return query(args);
          }

          const isRead = operation === 'findFirst' || operation === 'findMany' || operation === 'findUnique';
          const where = (args as any)?.where;
          const hasTenantFilter = where && ('tenantId' in where || 'tenant' in where);

          if (isRead && !hasTenantFilter && process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(
              `[tenant-isolation] ${model}.${operation} executado sem contexto de tenant e sem filtro tenantId — confirme se é intencional.`,
            );
          }

          return query(args);
        },
      },
    },
  });
