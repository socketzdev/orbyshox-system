# Migrações pendentes — proposta para aprovação

> **Status: NÃO EXECUTADO.** Este documento existe para você revisar antes de
> qualquer alteração em schema ou em dados.
>
> Propostas neste arquivo: **B1** (autoria do pedido), **B4** (papéis),
> **B5** (nome da comanda). Todas aditivas e reversíveis.
> Descobri que a pasta `prisma/migrations/` está **vazia** — o projeto opera com
> `prisma db push` (schema-first, sem histórico de migração). Isso muda o
> comando, não o risco.

---

## Contexto: o que já foi feito (sem tocar em schema)

B2, registro do `PoliciesGuard` e `@CheckPolicies` nos endpoints críticos estão
implementados, testados e verificados em runtime — 24/24 casos passando, com o
usuário `garcom@gordo.com` recebendo 403 em tudo que é restrito e o
`TENANT_ADMIN` passando. Nada disso exigiu mudança de banco.

O que falta (R1 e o backfill de papéis) depende exatamente das duas migrações
abaixo.

---

## B1 — `Order.createdById`

### Por que

A regra central que você validou — *"garçom só edita pedidos que ele mesmo
lançou"* — não tem como ser verificada hoje. O model `Order`
(`schema.prisma:561`) **não guarda o autor**, e `createOrder()`
(`tenant-app.service.ts:1195`) nunca recebeu o usuário. Sem essa coluna, não há
como distinguir "correção do próprio lançamento" de "edição do pedido alheio".

### Diff proposto no schema

```prisma
model Order {
  id             String   @id @default(uuid())
  // ... campos existentes, intocados ...
  createdById    String?                                    // ← NOVO

  createdBy      User?    @relation("OrderCreator", fields: [createdById], references: [id], onDelete: SetNull)   // ← NOVO

  @@index([createdById])                                    // ← NOVO
}

model User {
  // ... campos existentes, intocados ...
  createdOrders  Order[]  @relation("OrderCreator")          // ← NOVO (back-reference)
}
```

### Efeito real no SQLite

```sql
ALTER TABLE "Order" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Order_createdById_idx" ON "Order"("createdById");
```

**Por que é seguro:**
- Coluna **nova**, **anulável**, sem default que exija reescrita de linha.
- **Nenhuma coluna existente é alterada ou removida.**
- `onDelete: SetNull` — apagar um usuário não apaga pedidos nem quebra FK.
- Não há `NOT NULL` nem constraint que possa falhar nos registros atuais.

### Backfill

**Nenhum.** Os pedidos existentes ficam com `createdById = NULL` — o autor
simplesmente não é conhecido e **não pode ser inferido** com honestidade (o dado
nunca foi coletado). Inventar um autor seria pior que não ter nenhum.

**Consequência que você precisa endossar:** pedidos anteriores à migração não
têm dono. Proponho que a regra R1 os trate como **fail-closed** — "sem autor
registrado" ⇒ não é correção livre ⇒ exige aprovação de gerente. Um garçom não
consegue editar um pedido antigo sem PIN. Prefiro isso a abrir uma exceção
"se não tem autor, deixa passar", que seria justamente o furo que estamos
fechando.

### Rollback

```sql
DROP INDEX "Order_createdById_idx";
ALTER TABLE "Order" DROP COLUMN "createdById";
```
Perda apenas do dado novo (autoria), que é reconstruível pelo AuditLog
(`ORDER_CREATE` já está sendo gravado desde agora — ver R2).

### Comando (após sua aprovação)

```bash
pnpm --filter @projeto-saas/database exec prisma db push
pnpm --filter @projeto-saas/database exec prisma generate
```

---

## B4 — Papéis `WAITER` e `KITCHEN` + backfill de `position`

### Por que

`User.role` é uma coluna **String** (não enum do Prisma), então **não há
migração de schema** aqui. Há duas partes: um ajuste de código e um backfill de
dados.

### Parte 1 — Código (nenhum risco)

`packages/shared-types/src/erp.ts:166`:

```diff
- export const EMPLOYEE_ROLES = ['TENANT_ADMIN', 'TENANT_EMPLOYEE', 'STORE_MANAGER', 'CASHIER', 'STOCKIST'] as const;
+ export const EMPLOYEE_ROLES = ['TENANT_ADMIN', 'TENANT_EMPLOYEE', 'STORE_MANAGER', 'CASHIER', 'STOCKIST', 'WAITER', 'KITCHEN'] as const;
```

Efeito: o formulário de funcionários passa a aceitar esses papéis
(`createEmployeeSchema` / `updateEmployeeSchema` usam `z.enum(EMPLOYEE_ROLES)`).
Nada mais consome essa lista — `USER_ROLE_VALUES` é usado só no módulo de
tickets da plataforma e não é afetado.

### Parte 2 — Backfill de dados

Script pronto e **já rodado em dry-run**: `packages/database/backfill-rbac-roles.js`

Regras, nesta ordem de precedência:

| De | Para | Critério |
| --- | --- | --- |
| `TENANT_EMPLOYEE` | `WAITER` | `position` contém garcom/garçom/salao/salão/atendente/waiter |
| `TENANT_EMPLOYEE` | `KITCHEN` | `position` contém cozinh/chapeiro/pizzaiolo/cook/chef |
| `TENANT_OWNER` | `TENANT_ADMIN` | papel legado que não existe em nenhuma lista |
| qualquer outro | *(inalterado)* | **nunca rebaixa** um `TENANT_ADMIN`/`STORE_MANAGER` |

`position` é **preservado** — continua servindo de rótulo na UI.

### Resultado do dry-run (dados reais, 13/09/2026)

**112 usuários no banco · 20 alterações propostas · 0 ignorados**

```
TENANT_OWNER    → TENANT_ADMIN   1
TENANT_EMPLOYEE → WAITER        18   (17 "Garçom de Salão" + garcom@gordo.com "Garçom")
TENANT_EMPLOYEE → KITCHEN        1   (cozinha@gordo.com "Cozinheira")
```

Nenhum usuário com `position` de garçom/cozinha tem papel superior — não há
conflito a resolver.

### Impacto em permissões

- Os 18 garçons **saem de `TENANT_EMPLOYEE` e entram em `WAITER`**. Hoje, com o
  RBAC já ligado, `TENANT_EMPLOYEE` tem um conjunto mínimo (ler produto/pedido,
  criar pedido). `WAITER` é um conjunto **mais** adequado ao cargo: além disso,
  lê mesas, responde chamadas de garçom e lê relatório do próprio turno — e
  **não** altera desconto/total. Ou seja: a mudança é de ajuste fino, não de
  escalada.
- A cozinheira entra em `KITCHEN`: lê pedidos/produto e muda status de preparo,
  sem acesso a valor, estoque ou financeiro.
- O `TENANT_OWNER` passa a `TENANT_ADMIN`. Hoje ele **não está em nenhuma lista
  de papéis**; se o backfill não rodasse, com o RBAC ligado esse usuário ficaria
  **sem nenhuma permissão**. Por isso o factory já o reconhece como equivalente
  a `TENANT_ADMIN` desde agora, e o backfill apenas normaliza o valor gravado.

### Rollback

O script grava um `AuditLog` por alteração (`action: 'ROLE_BACKFILL'`) com
`before.role` e `before.position`. Reverter é reler esses registros e restaurar
`role`. `position` nunca é tocado, então o dado de origem permanece intacto.

### Comando (após sua aprovação)

```bash
cd packages/database
node backfill-rbac-roles.js          # dry-run, confirma a lista
node backfill-rbac-roles.js --apply  # grava
```

---

## O que eu ainda NÃO vou implementar sem resposta

**R1 (autoria + janela) depende de B1.** E, ao implementar, esbarrei num ponto
de escopo que você provavelmente não sabia: **não existe endpoint de edição de
pedido no sistema.** As únicas mutações de pedido hoje são:

- `POST tenant-app/:slug/orders` — criação
- `PATCH restaurant/orders/:id/status` — mudança de status
- `POST tenant-app/:slug/pos/cancel-sale` — cancelamento

Ou seja, "editar pedido" é uma operação que **precisa ser criada** antes de poder
ser restringida. Vejo duas leituras e prefiro confirmar antes de construir:

**(a)** A regra R1 se aplica aos pontos de mutação que já existem — mudança de
status e cancelamento passam a exigir autoria + janela + status `PENDING`.
Menos código, mas o garçom continua sem conseguir corrigir um item lançado
errado (hoje ele também não consegue — a capacidade nunca existiu).

**(b)** Além disso, criar o endpoint de edição de pedido (`PATCH orders/:id`)
com a regra R1 completa: autor, janela de 15 min configurável, `status PENDING`,
sem alterar preço/desconto, trilha `{before, after}`, e PIN de gerente fora da
janela. Entrega o que você descreveu de fato, com escopo maior.

Minha recomendação é **(b)** — foi o que você pediu na validação, e sem o
endpoint a regra fica sem onde morar.

---

## B5 — `TableSession.comandaName` — ✅ EXECUTADA

> **Executada em 13/09/2026, com aprovação.**
> Backup do banco antes: `/tmp/dev.db.backup-comanda`.
> Comandos rodados: `prisma db push` e `prisma generate`.
> Colunas confirmadas via `PRAGMA table_info("TableSession")`:
> `id, companyId, tableId, status, openedAt, closedAt, createdAt, updatedAt, comandaName, customerCount`.
> As 25 sessões existentes foram preservadas (colunas anuláveis, nada reescrito).

### Por que

O modal de abertura de mesa no "Mapa de Salão & Gestão de Mesas" pede o **nome
da comanda**. Hoje uma comanda é uma `TableSession`, e `TableSession` **não tem
nenhum campo de texto** — só `status`, `openedAt`, `closedAt`. O
`openTableSession` até recebe `data?: { customerCount?, notes? }` no parâmetro,
mas **ignora o valor**: nunca persiste nada.

Sem essa coluna, o nome digitado no modal é validado e usado na confirmação, mas
**não fica gravado em lugar nenhum**.

### Diff proposto no schema

```prisma
model TableSession {
  id           String    @id @default(uuid())
  companyId    String
  tableId      String
  status       String    @default("OPEN") // OPEN, CLOSED
  comandaName  String?                                    // ← NOVO
  customerCount Int?                                       // ← NOVO (opcional)
  openedAt     DateTime  @default(now())
  // ... resto inalterado
}
```

### Efeito real no SQLite

```sql
ALTER TABLE "TableSession" ADD COLUMN "comandaName" TEXT;
ALTER TABLE "TableSession" ADD COLUMN "customerCount" INTEGER;
```

**Por que é seguro:** colunas novas, anuláveis, sem default que reescreva linha.
Nenhuma coluna existente é alterada ou removida. Sessões já abertas ficam com
`NULL` — o front trata `null` exibindo o rótulo da mesa.

### Pendente do seu OK

É uma decisão sua porque mexe em schema. Enquanto não aprovar:

- o modal **funciona** (valida, abre a mesa, mostra feedback no mapa);
- o nome **não é persistido**.

Aproveitar e fazer `comandaName` + `customerCount` juntos evita um segundo
`db push` depois — o `customerCount` já é enviado pelo front hoje e corre o mesmo
risco de ser ignorado.
