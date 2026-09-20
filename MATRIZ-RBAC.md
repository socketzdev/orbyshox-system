# Matriz de Papéis × Permissões (RBAC) — VALIDADA

> **Status:** matriz **validada** em 13/09/2026. Etapa 2 em execução.
> **Achado de origem:** H10 (RBAC inoperante) + C8 (trilha de auditoria) — `AUDITORIA-MARKETPLACE.md`.
> **Escopo da Etapa 2:** PDV, NF-e, fornecedores, lotes de estoque, financeiro.

## Decisões validadas

| #   | Decisão                                  | Escolha                                                                                                                                                |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Promover Garçom e Cozinha a papéis reais | **Sim** — `WAITER` e `KITCHEN` em `EMPLOYEE_ROLES`. Nada de depender de texto livre em `position` para regra de segurança                              |
| D2  | Janela de edição do garçom               | **15 min** como padrão, configurável por loja (`ORDER_EDIT_WINDOW_MINUTES`). A condição **principal** é `status === 'PENDING'`; o tempo é camada extra |
| D3  | Trilha de auditoria                      | **Reusar `AuditLog`** com `metadata` estruturado `{before, after, fields}`. Sem tabela nova                                                            |
| D4  | Aprovação fora da janela                 | **Só PIN do gerente** na Etapa 2 (reaproveita `authorize-manager`). Fila de aprovação fica para a Etapa 3                                              |
| —   | `CASHIER` marcar conta como paga         | **Mantém ⚠️** (permitido com trilha). Não bloquear                                                                                                     |
| —   | `STOCKIST` editar lote                   | **Mantém ⚠️**, restrito a validade e status. Quantidade **sempre** via movimento de estoque rastreado (Kardex)                                         |
| —   | Apagar lote / fornecedor / conta         | **Só `TENANT_ADMIN`**, sem exceção para gerente                                                                                                        |
| —   | Escopo de R1                             | **Criar o endpoint de edição de pedido** (não existia), com a regra completa                                                                           |

### Três correções à matriz, encontradas durante a implementação

1. **Ler a equipe ≠ gerir a equipe.** A matriz dizia "Gerenciar funcionários ❌ gerente". Mas
   `GET /employees` é usado por `appointments-page.tsx` para montar a lista de profissionais —
   gatear a leitura com `manage` quebraria a agenda para todo não-admin. Passou a valer:
   **Read liberado** para os papéis operacionais, **Create/Update/Delete exclusivo do `TENANT_ADMIN`**.

2. **`TENANT_OWNER` não existia em lista nenhuma.** Encontrado no banco (1 usuário) e tratado pelo
   front como admin. Com o RBAC ligado ele ficaria **sem nenhuma permissão**. O factory passou a
   reconhecê-lo como equivalente a `TENANT_ADMIN`, e a migração B4 normaliza o valor gravado.

3. **⚠️ O SALÃO NÃO ENTRA NO RBAC DE ROTA — a matriz estava errada para mesas.** As linhas
   "Criar / editar mesa ❌ garçom" e "Apagar mesa ✅ só admin" foram escritas sem olhar a tela.
   `restaurant-tables-page.tsx` **é** o mapa de mesas e **é** a tela inicial do garçom
   (`resolvePortalDestination` manda `WAITER` para `${base}/tables`). Essa única tela chama
   criar mesa, editar, apagar, parear tablet, girar QR, abrir/fechar sessão, transferir e
   lançar pedido — tudo do garçom. No salão, "operacional" e "administrativo" são a mesma
   tela do mesmo papel.

   **Correção aplicada:** `restaurant.controller.ts` foi **revertido integralmente** (voltou a
   ficar sem RBAC) e `WAITER` recuperou `Manage` sobre `Table`/`TableSession`/`WaiterCall`.

   **Lição de processo:** a ordem correta é **rota → tela → papel → matriz**. A matriz diz o que
   o negócio quer; o frontend diz o que a tela faz. Gatear pelo papel sem ver a tela quebra
   fluxo real — foi o mesmo erro de `GET /employees`, pego antes de subir.

### O que fica de fora da Etapa 2 (por decisão, não por esquecimento)

| Controller                                                                                                                         | Rotas | RBAC | Motivo                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------------------------------------------------------- |
| `restaurant.controller.ts`                                                                                                         | 26    | ❌   | Salão é tela única por papel — ver correção 3             |
| `dashboard`, `search`, `client-sites`, `settings`, `staff`, `plans`, `billing`, `tickets`, `tenants`, `knowledge`, `audit`, `auth` | —     | ❌   | Rotas de plataforma, cobertas por `@Roles` + `RolesGuard` |

Cobertura final do RBAC de rota: **`marketplace/` (5 controllers) + `tenant-app.controller.ts`**.

### Regra do lote (quantidade)

Decisão: o PATCH de lote **continua aceitando** alteração de quantidade, desde que **sempre** gere
um `StockMovement` com `operatorId` e trilha `{before, after}`. Ou seja: a alteração é rastreada,
nunca uma edição livre sem histórico. Restrição de campos (validade e status pelo estoquista,
preço de venda fora do estoquista) é aplicada no serviço, não no guard.

---

## 1. Estado atual — por que o RBAC está inoperante

Levantamento feito no código, não apenas no relatório da auditoria.

| Componente           | Existe?                                            | Está aplicado? | Evidência                                                                     |
| -------------------- | -------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `PoliciesGuard`      | ✅ `common/guards/policies.guard.ts`               | ❌             | Não aparece em nenhum `@UseGuards` nem em `APP_GUARD` (`app.module.ts:82-94`) |
| `@CheckPolicies`     | ✅ `common/decorators/check-policies.decorator.ts` | ❌             | Zero usos fora do próprio arquivo                                             |
| `CaslAbilityFactory` | ✅ `common/casl/casl-ability.factory.ts`           | ❌             | Só é injetado pelo `PoliciesGuard`, que ninguém registra                      |

Guards realmente ativos (`app.module.ts`): `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard` → `TwoFactorGuard`.

`RolesGuard` só reage a metadata `@Roles(...)`, e isso hoje aparece **apenas** em `tenants.controller.ts` (rotas de plataforma). Os 5 controllers de `marketplace/`, o `restaurant.controller.ts` e o `tenant-app.controller.ts` têm só `JwtAuthGuard + TenantOwnershipGuard` — ou seja, **qualquer usuário autenticado do tenant passa**. É exatamente o H10.

### Achado adicional (não está na auditoria)

O `CaslAbilityFactory` **não tem nenhum `case` para papéis de tenant**. Ele cobre só `SUPER_ADMIN`, `SUPPORT_MANAGER`, `SUPPORT_AGENT`, `FINANCE`, `DEV`.

```ts
switch (user.role) {
  case 'SUPER_ADMIN': ...
  case 'SUPPORT_MANAGER': ...
  // ... nenhum caso para TENANT_ADMIN, STORE_MANAGER, CASHIER, STOCKIST, TENANT_EMPLOYEE
  default: /* ability vazia → todo can() retorna false */
}
```

**Consequência prática:** se a Etapa 2 fosse só "plugar o `PoliciesGuard`", o `TENANT_ADMIN` (o dono da loja) ficaria bloqueado de tudo. O factory precisa ser **reescrito**, não apenas conectado.

---

## 2. Inventário de papéis

Há **duas taxonomias convivendo** no projeto, e elas não se falam:

**A. Papéis de plataforma** — gravados em `User.role`, usados por `RolesGuard` e pelo CASL.
`SUPER_ADMIN`, `SUPPORT_MANAGER`, `SUPPORT_AGENT`, `FINANCE`, `DEV`

**B. Papéis de tenant (funcionários)** — definidos em `packages/shared-types/src/erp.ts:166` (`EMPLOYEE_ROLES`), aceitos no `createEmployeeSchema`, mas **ignorados pelo CASL**.
`TENANT_ADMIN`, `TENANT_EMPLOYEE`, `STORE_MANAGER`, `CASHIER`, `STOCKIST`

**C. "Garçom" e "cozinha" não são papéis.** Não existem em nenhuma das listas. O front os _adivinha_ por texto livre no campo `User.position` (`apps/web/src/lib/role-routing.ts`: `pos.includes('garcom')`, `'cozinh'`, `'gerente'`...).

### Mapeamento proposto (business → código)

| Nome de negócio (seu pedido) | Papel no código    | Situação hoje             |
| ---------------------------- | ------------------ | ------------------------- |
| Admin da loja                | `TENANT_ADMIN`     | existe, sem permissões    |
| Gerente                      | `STORE_MANAGER`    | existe, sem permissões    |
| Caixa                        | `CASHIER`          | existe, sem permissões    |
| Estoquista                   | `STOCKIST`         | existe, sem permissões    |
| **Garçom**                   | **não existe**     | só `position` texto livre |
| Cozinha / KDS                | **não existe**     | só `position` texto livre |
| Genérico                     | `TENANT_EMPLOYEE`  | existe, sem permissões    |
| Plataforma                   | `SUPER_ADMIN` etc. | já funcionava             |

> ⚠️ **Decisão necessária (D1):** promovemos **Garçom** (e talvez **Cozinha**) a papéis reais em `EMPLOYEE_ROLES`, ou mantemos a regra baseada em `position`? Sem isso, "garçom pode editar só o que ele lançou" não tem sujeito identificável no banco. Recomendo promover a papéis reais — `position` é texto livre e um erro de digitação viraria escalada ou bloqueio de privilégio.

---

## 3. Legenda

| Símbolo | Significado                                                                                   |
| ------- | --------------------------------------------------------------------------------------------- |
| ✅      | Permitido, sem restrição adicional                                                            |
| ⚠️      | Permitido **com condição** (trilha de auditoria / janela de tempo / aprovação superior / PIN) |
| ❌      | Negado                                                                                        |
| —       | Não se aplica ao papel                                                                        |

`Super` = SUPER_ADMIN (acesso irrestrito, cross-tenant). Operações de plataforma não entram nesta matriz.

---

## 4. Matriz por módulo

### 4.1 PDV / Vendas

| Operação                                        | Garçom | Caixa | Estoquista | Gerente | Admin |
| ----------------------------------------------- | :----: | :---: | :--------: | :-----: | :---: |
| Ver pedidos que ele mesmo lançou                |   ✅   |  ✅   |     —      |   ✅    |  ✅   |
| Ver todos os pedidos da loja                    |   ❌   |  ✅   |     ❌     |   ✅    |  ✅   |
| Lançar pedido / venda                           |   ✅   |  ✅   |     ❌     |   ✅    |  ✅   |
| **Editar pedido próprio — dentro da janela**    |   ⚠️   |  ⚠️   |     ❌     |   ✅    |  ✅   |
| Editar pedido de terceiro                       |   ❌   |  ⚠️   |     ❌     |   ✅    |  ✅   |
| **Editar pedido fechado / pago / sincronizado** |   ❌   |  ❌   |     ❌     |   ⚠️    |  ✅   |
| Cancelar venda (`pos/cancel-sale`)              |   ❌   |  ⚠️   |     ❌     |   ✅    |  ✅   |
| Registrar devolução (`pos/returns`)             |   ❌   |  ⚠️   |     ❌     |   ✅    |  ✅   |
| Abrir / fechar caixa                            |   ❌   |  ✅   |     ❌     |   ✅    |  ✅   |
| Sangria / reforço (`cash-register/movement`)    |   ❌   |  ✅   |     ❌     |   ✅    |  ✅   |

### 4.2 Salão / Restaurante

| Operação                         | Garçom | Caixa | Estoquista | Gerente | Admin |
| -------------------------------- | :----: | :---: | :--------: | :-----: | :---: |
| Ver mesas e sessões              |   ✅   |  ✅   |     ❌     |   ✅    |  ✅   |
| Abrir / fechar sessão de mesa    |   ✅   |  ✅   |     ❌     |   ✅    |  ✅   |
| Transferir mesa                  |   ✅   |  ✅   |     ❌     |   ✅    |  ✅   |
| Atualizar status do pedido (KDS) |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| Responder chamada de garçom      |   ✅   |  ✅   |     ❌     |   ✅    |  ✅   |
| Criar / editar mesa              |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| Apagar mesa                      |   ❌   |  ❌   |     ❌     |   ❌    |  ✅   |

### 4.3 Marketplace / Compras

| Operação                                           | Garçom | Caixa | Estoquista | Gerente | Admin |
| -------------------------------------------------- | :----: | :---: | :--------: | :-----: | :---: |
| Ver fornecedores                                   |   ❌   |  ❌   |     ✅     |   ✅    |  ✅   |
| Criar / editar fornecedor                          |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| **Apagar fornecedor**                              |   ❌   |  ❌   |     ❌     |   ❌    |  ✅   |
| Ver pedidos de compra                              |   ❌   |  ❌   |     ✅     |   ✅    |  ✅   |
| Criar pedido de compra                             |   ❌   |  ❌   |     ✅     |   ✅    |  ✅   |
| Enviar / cancelar pedido de compra                 |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| **Receber pedido** (gera lote + estoque)           |   ❌   |  ❌   |     ✅     |   ✅    |  ✅   |
| Importar NF-e                                      |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| Reconciliar itens da NF-e                          |   ❌   |  ❌   |     ✅     |   ✅    |  ✅   |
| **Finalizar NF-e** (gera estoque + contas a pagar) |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |

### 4.4 Estoque

| Operação                                  | Garçom |        Caixa        | Estoquista | Gerente | Admin |
| ----------------------------------------- | :----: | :-----------------: | :--------: | :-----: | :---: |
| Ver produtos / saldo de estoque           |   ❌   | ✅ (leitura p/ PDV) |     ✅     |   ✅    |  ✅   |
| Criar / editar produto                    |   ❌   |         ❌          |     ⚠️     |   ✅    |  ✅   |
| **Editar preço de venda**                 |   ❌   |         ❌          |     ❌     |   ✅    |  ✅   |
| Ajuste de estoque (`adjust-stock`)        |   ❌   |         ❌          |     ✅     |   ✅    |  ✅   |
| Registrar perda / avaria (`stock/losses`) |   ❌   |         ❌          |     ✅     |   ✅    |  ✅   |
| Inventário — contagem                     |   ❌   |         ❌          |     ✅     |   ✅    |  ✅   |
| Inventário — reconciliar                  |   ❌   |         ❌          |     ❌     |   ✅    |  ✅   |
| **Editar lote** (`batches` PATCH)         |   ❌   |         ❌          |     ⚠️     |   ✅    |  ✅   |
| **Apagar lote** (`batches` DELETE)        |   ❌   |         ❌          |     ❌     |   ❌    |  ✅   |
| Ver Kardex (`stock/movements`)            |   ❌   |         ❌          |     ✅     |   ✅    |  ✅   |

### 4.5 Financeiro

| Operação                                 | Garçom | Caixa | Estoquista | Gerente | Admin |
| ---------------------------------------- | :----: | :---: | :--------: | :-----: | :---: |
| Ver contas a pagar / receber             |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| Criar conta a pagar / receber            |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| Marcar como pago / recebido              |   ❌   |  ⚠️   |     ❌     |   ✅    |  ✅   |
| **Apagar conta a pagar / receber**       |   ❌   |  ❌   |     ❌     |   ❌    |  ✅   |
| Fluxo de caixa / relatórios              |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |
| Ver relatório de vendas do próprio turno |   ✅   |  ✅   |     ❌     |   ✅    |  ✅   |

### 4.6 Administração

| Operação                                     | Garçom | Caixa | Estoquista | Gerente | Admin |
| -------------------------------------------- | :----: | :---: | :--------: | :-----: | :---: |
| Gerenciar funcionários (criar/editar/apagar) |   ❌   |  ❌   |     ❌     |   ❌    |  ✅   |
| Configurações da loja (`settings/store`)     |   ❌   |  ❌   |     ❌     |   ⚠️    |  ✅   |
| Aprovar correção fora da janela              |   ❌   |  ❌   |     ❌     |   ✅    |  ✅   |

### 4.7 Copiloto IA (agente)

A IA executa com o cargo do operador (`CaslAbilityFactory`, mesma matriz acima) — o portão fica em `checkToolAccess` (`ai-tools.service.ts`). GLOBAL exige Super Admin; TENANT exige empresa do token; sem permissão mapeada, bloqueado.

| Operação via IA                                                                |                  Garçom                  |           Caixa            |         Estoquista         |    Gerente    |     Admin      |
| ------------------------------------------------------------------------------ | :--------------------------------------: | :------------------------: | :------------------------: | :-----------: | :------------: |
| Consultas (mesas, cardápio, tarefas, alunos, OS, contas, produtos, calendário) |        Leitura do próprio sujeito        | Leitura do próprio sujeito | Leitura do próprio sujeito |      Sim      |      Sim       |
| Lançar pedido / abrir comanda / criar tarefa, OS, aluno, check-in              |         Sim (sujeitos próprios)          |          Parcial           |            Não             |      Sim      |      Sim       |
| Fechar conta (comanda)                                                         |              Sim + confirm               |       Sim + confirm        |            Não             | Sim + confirm | Sim + confirm  |
| Desconto, preço, baixa financeira, concluir OS, excluir série/calendário       |               Não (papel)                |            Não             |            Não             | Sim + confirm | Sim + confirm  |
| Métricas globais / tickets da plataforma                                       |                   Não                    |            Não             |            Não             |      Não      | Só Super Admin |
| Excluir empresa                                                                | Não existe tool — só suporte, fora da IA |                            |                            |               |                |

Sujeito novo: `CalendarEvent` (gerente lê/cria/atualiza; caixa e funcionário genérico só leem).

---

## 5. Regras de negócio a implementar (Etapa 2)

### R1 — "Correção de erro operacional" ≠ "operação sensível"

O que define a fronteira não é o endpoint, é o **estado do registro + autoria + tempo**:

|          | Correção de erro operacional                      | Operação sensível                                      |
| -------- | ------------------------------------------------- | ------------------------------------------------------ |
| Quem     | Autor do lançamento                               | Papel superior                                         |
| O quê    | Ajustar itens/observação de um pedido             | Finalizar NF-e, apagar fornecedor/lote, mexer em preço |
| Quando   | Dentro da janela (X min) e pedido ainda `PENDING` | Qualquer momento                                       |
| Rastro   | Trilha de auditoria obrigatória                   | Trilha + aprovação                                     |
| Bloqueio | Silencioso se fora da janela                      | Exige aprovação explícita                              |

**Janela do garçom — condições cumulativas (todas precisam ser verdadeiras):**

1. `order.createdById === user.id` (autoria)
2. `order.status === 'PENDING'` — ainda não foi para a cozinha/PDV
3. `now - order.createdAt <= X minutos`
4. Não altera preço, desconto nem valor total

> **Decisão necessária (D2):** valor de **X**. Proponho **15 minutos** como padrão, configurável em `Setting` (ex.: `ORDER_EDIT_WINDOW_MINUTES`). Confirma?

### R2 — Trilha de auditoria sem sobrescrever (endereça C8)

Toda edição pós-lançamento grava **quem, quando, valor anterior e valor posterior**.

Hoje:

- `AuditLog` existe (`userId`, `action`, `targetType`, `targetId`, `metadata` String, `ipAddress`).
- O `AuditInterceptor` só registra `{ method, url }` — **não guarda valor anterior nem posterior**.
- `StockMovement` já tem `operatorId`, `quantity`, `balanceAfter`, `type` — bom para estoque, **mas `batches.update/remove` não grava nada nele** (é o C8).

Proposta: estender o `metadata` do `AuditLog` para um JSON estruturado `{ before, after, fields: [] }` em toda edição sensível, e fazer `batches.update/remove` gravarem `StockMovement` (junto com o C8).

> **Decisão necessária (D3):** reusar `AuditLog` com `metadata` estruturado, ou criar tabela dedicada (`EntityRevision`) para permitir consulta e reversão? Recomendo **reusar `AuditLog`** (menos migração, já tem índices por `targetType/targetId`).

### R3 — Correção fora da janela exige aprovação superior

Se o pedido já está fechado, pago ou sincronizado (ou passou da janela), a edição **não acontece livremente**: vira uma **solicitação de correção** que um Gerente/Admin aprova.

Já existe uma base reaproveitável: `POST /pos/authorize-manager` (autorização por PIN em `StoreSetting`). Dá para usar o mesmo mecanismo como "assinatura" da aprovação.

> **Decisão necessária (D4):** aprovação por **PIN do gerente** (fluxo atual, mais rápido) ou por **fila de aprovação** (o gerente aprova depois, fora do balcão)? Recomendo PIN para o caso "cliente ainda na mesa" e fila para o caso "dia seguinte".

---

## 6. Bloqueadores técnicos (precisam de mudança de schema)

Nenhum destes é opcional — sem eles, R1 e R2 não são implementáveis.

| #   | Bloqueador                                                                                                                              | Onde                                     | Correção necessária                                                               | Status                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| B1  | **`Order` não tem autor.** Não há `createdById`/`waiterId` no model `Order` (schema.prisma:561). E `createOrder()` não recebe `userId`. | `schema.prisma`, `tenant-app.service.ts` | Adicionar `createdById String?` + relação + backfill; passar o usuário na criação | **aguardando aprovação** (`MIGRACOES-RBAC.md`) |
| B2  | **`CaslAbilityFactory` sem casos de tenant**                                                                                            | `casl-ability.factory.ts`                | Reescrever com sujeitos por módulo e papéis de tenant                             | **feito**                                      |
| B3  | **Sem trilha antes/depois**                                                                                                             | `audit.service.ts`                       | `recordChange()` com `metadata` estruturado `{before, after, fields}`             | **feito**                                      |
| B4  | **Garçom não é papel**                                                                                                                  | `erp.ts:166`                             | Adicionar `WAITER`/`KITCHEN` + backfill de `position` → `role`                    | **aguardando aprovação** (`MIGRACOES-RBAC.md`) |
| B5  | **`batches.update/remove` fora do Kardex**                                                                                              | `batches.service.ts`                     | Ajustar `stockQuantity` + gravar `StockMovement` (é o C8)                         | **feito**                                      |
| B6  | **Sem valor de janela configurável**                                                                                                    | —                                        | Nova chave em `Setting` (`ORDER_EDIT_WINDOW_MINUTES`)                             | junto de R1                                    |

---

## 7. Plano da Etapa 2 — execução

| #   | Passo                                                                                         | Status                         |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | **B2** — Reescrever `CaslAbilityFactory` com os papéis de tenant e sujeitos                   | ✅ feito (32 testes)           |
| 2   | **B1 + B4** — Migrações de schema e de papéis                                                 | ⏸ **aguardando sua aprovação** |
| 3   | **Registrar `PoliciesGuard`** como `APP_GUARD` após o `JwtAuthGuard`, respeitando `@Public()` | ✅ feito                       |
| 4   | **Aplicar `@CheckPolicies`** nos endpoints críticos                                           | ✅ feito                       |
| 5   | **R1** — Autoria + janela + status no endpoint de edição de pedido                            | ⏸ depende de B1                |
| 6   | **R2 / B3 / B5** — Trilha `{before, after}`; Kardex em `batches.update/remove`                | ✅ feito                       |
| 7   | **R3** — Aprovação por PIN fora da janela                                                     | ⏸ depende de B1                |
| 8   | **Testes** — unitários do factory + verificação por papel em runtime                          | ✅ feito                       |

### Verificação executada

- `tsc --noEmit` limpo · `jest` **118 testes / 13 suítes** · `nest build` OK
- Aplicação sobe sem erro de injeção de dependência
- **26 casos de autorização em runtime**, com token forjado para `garcom@gordo.com`
  (`TENANT_EMPLOYEE`) e `tanpasa3@gmail.com` (`TENANT_ADMIN`):
  o garçom recebe **403** em Kardex, contas a pagar, fluxo de caixa, configurações da
  loja, aprovação por PIN, finalizar NF-e, apagar lote, apagar conta a pagar, listar
  NF-e e listar fornecedores. O admin passa pelo guard e chega ao serviço — `404`
  para recurso inexistente, `200` nas leituras. É a diferença entre 403 e 404 que
  prova que o guard é quem está barrando.

### Pendências de UI (não bloqueiam a segurança)

- Botões de ação que o papel não pode executar ainda aparecem (ex.: "Apagar lote"
  para o gerente). Devem ser escondidos por permissão numa passada de frontend.
- `CASHIER` tem `Update` em contas a pagar/receber (⚠️ marcar como paga) mas **não
  tem `Read`** — conforme a matriz. Na prática ele não consegue _achar_ a conta na
  tela, então o ⚠️ fica inalcançável pela UI. **Precisa da sua decisão:** liberar
  `Read` para o caixa, ou remover o ⚠️ e deixar a baixa só com gerente/admin?

---

## 8. Decisões já tomadas

Todas as perguntas desta seção foram respondidas — ver **Decisões validadas** no topo.
O que permanece aberto:

1. **Aprovação das migrações B1 e B4** — proposta em `MIGRACOES-RBAC.md`. Não executo
   nada antes do seu OK.
2. **`CASHIER` e contas a pagar** — o ⚠️ "marcar como paga" está inalcançável pela UI
   porque `Read` está negado (ver Pendências de UI acima).
