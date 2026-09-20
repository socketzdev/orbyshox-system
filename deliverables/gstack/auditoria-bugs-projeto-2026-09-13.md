# Auditoria Completa de Bugs — ProjetoSaaS

**Data**: 2026-09-13
**Cenário**: Auditoria completa (Segurança + QA/Release + Depuração + Revisão de Código)
**Participantes**: Segurança (CSO) · QA Lead · Investigador · Revisor de Código (2 execuções)
**Escopo**: `apps/api` (NestJS 10 + Prisma 5 + SQLite), `apps/web` (React 18 + Vite 5 + TanStack Query v5), `packages/database/prisma`, `.env`, `jest.config.js`, `vitest.config.ts`
**Modo**: **somente leitura — nenhum arquivo foi alterado**

---

## 📌 TL;DR

- **Não há um bug fatal isolado**, mas há um **padrão sistêmico**: operações de leitura‑modificação‑escrita fora de lock/transação (`orderNumber`, estoque, sessão de mesa, fila offline) e — pior — **controles de autorização implementados, testados e não ligados** (`PoliciesGuard`, `TwoFactorGuard`, regras de campo CASL e o `authorizeManager` existem, têm spec e passam; nenhum é consultado onde importa).
- **Achado mais grave do ponto de vista financeiro**: `cancelOrder` **não exige PIN**. `authorizeManager` existe mas **não é chamado por ninguém**. Qualquer CAIXA, GARÇOM ou COZINHA estorna qualquer venda concluída, devolve estoque e cancela título de fiado — sem aprovação e sem rastro de aprovação. O gate de PIN no PDV é só ritual de interface (duas chamadas desacopladas; a segunda nem vai ao servidor).
- **O default `managerPin = '1234'`** está no schema, no serviço e em três pontos do front.
- **O achado nº 1 em impacto é a ausência de `@Roles` nos controllers de plataforma** — qualquer usuário autenticado (inclusive CAIXA ou GARÇOM) lista a base inteira de clientes (`GET /tenants`, com CNPJ/e-mail/telefone/plano/faturas), faz busca global sem escopo, acessa faturas de todos os tenants e escreve configuração global via `PATCH /settings/:key`.
- **A causa raiz é estrutural e única**: todos os guards dão **`return true` quando falta metadado** (`super-admin.guard.ts:20-24`, `roles.guard.ts:28`, `policies.guard.ts:37`). Há 91 usos de `@CheckPolicies` — **nenhum** nos controllers de plataforma. Quem esquece o decorator fica público.
- **Três achados graves foram confirmados por mim direto no código**: (1) o `authorizeManager` **nunca é chamado** no cancelamento nem no desconto; (2) `canUpdate(subject)` não recebe o campo, então as restrições `cannot(Update,'Order',[...])` **não funcionam**; (3) a conta de fechamento de comanda **soma pedidos cancelados** — bug introduzido hoje, no código que eu mesmo escrevi.
- **Eu errei num ponto e retratei**: classifiquei "bypass total de 2FA" como confirmado. **Não existe** — `TwoFactorGuard` é global e `verifyTemp2fa` valida `mfa_pending` (`auth.service.ts:282`). Ver §3.
- **A rota pública do QR (sem login) aceita quantidade sem teto** e o `createOrder` do restaurante **não checa estoque** — uma única requisição com `quantity: 1000000` joga o estoque dos insumos para um negativo enorme.
- **Dois bugs meus**, do trabalho de hoje: a conta somar cancelados (A1) e fechar mesa sem comanda devolver `200` com `receipt: null` (S-4).
- **Falsos positivos descartados**: segredo JWT com "fallback fixo" (não existe — o código lança exceção em produção) e CORS `origin: '*'` no app (não existe — só no WebSocket).
- **Ponto de decisão sua**: o salão está sem RBAC por papel porque você orientou que o mapa é do garçom. Consequência real: o perfil COZINHA consegue apagar mesas.

---

## 🎯 Core Conclusion Card

| Item | Conteúdo |
|---|---|
| **Go / No-Go** | 🔴 **No-Go para produção com clientes reais** — 🟡 Go condicional para uso interno controlado |
| **Severidade** | 🔴 **24 alto** · 🟠 **27 médio** · 🟡 **26 baixo** (77 achados) |
| **Ações P0** | 12 |
| **Cobertura da auditoria** | 🟡 Segurança executada, mas **com 3 falsos positivos descartados pelo líder** (ver §3) — o vazamento cross-tenant real é em `notifications.gateway.ts`, não no do restaurante |
| **Verificação do líder** | 5 achados confirmados no código · 2 descartados · 1 rebaixado |
| **Saúde da suíte** | 🟡 **Enganosa** — passa, mas `kpi-card.spec.ts` **reimplementa** as funções (testa a si mesmo) e specs `e2e` **nunca rodam** |
| **Cobertura real** | 🔴 **~0,2%** de `tenant-app.service.ts` · 0 testes em `restaurant.service.ts` e `restaurant.gateway.ts` |

---

## 1. Conclusões por membro

### 🔎 O PIN hoje não protege, não vincula e não prova (detalhamento do A2)

Três camadas falham juntas, e qualquer uma isoladamente já seria grave:

1. **Não protege (backend).** `authorizeManager` tem **zero chamadores**. `cancelOrder` exige apenas `canUpdate('Order')`, que CAIXA, GARÇOM, COZINHA e TENANT_EMPLOYEE possuem.
2. **Não vincula (frontend).** No PDV, `handleAuthorizeRemoveItem` (`supermarket-pos-page.tsx:449-464`) chama `/pos/authorize-manager` **e depois executa a ação localmente** — o servidor nunca fica sabendo *o que* foi autorizado. `handleAuthorizeCancelCart` (`:501-518`) repete o padrão. São **duas requisições desacopladas, sem token nem protocolo que as una**.
3. **Não prova (auditoria).** `tenant-app.service.ts:2774-2781` grava `MANAGER_PIN_AUTHORIZED` com `targetType: 'StoreSettings'`, `targetId: tenant.id` e `after: { authorized: true }` — **sem referência à venda, ao item, ao desconto ou ao valor**. No log, uma aprovação de estorno de R$ 800 e uma de R$ 2 são indistinguíveis.

Soma-se o **`managerPin` default `'1234'`** em `schema.prisma:1043`, `tenant-app.service.ts:2768, 3017` e `store-settings-page.tsx:57, 117, 824`.

---

### 🛡️ Segurança (OWASP + STRIDE) — executada com `arquivo:linha` e reprodução

A trilha rodou de fato (a primeira execução falhou por permissão de ferramenta; a segunda entregou relatório com evidência e até `curl` reproduzindo o vazamento). **Achados novos e mais graves que os anteriores:**

- **Vazamento cross-tenant real no WebSocket**: `restaurant.gateway.ts:82` usa `this.server.emit(...)` — **broadcast para todos os clientes**, não para a sala `restaurant:<companyId>`. O `join` anterior fica sem efeito na prática. Um cliente de outro tenant recebe `order:new` com dados de pedidos alheios.
- **`client-sites.controller.ts:34, 43, 57`** — Controller `@Public()` onde `publishSite`, `deleteComment` e `addComment` **não filtram `tenantId`/`companyId`** no `where`, mas recebem `user.tenantId`. `deleteComment` é destrutivo e sem checagem de posse.
- **`auth.service.ts:251`** — `jwtService.verify()` **sem fixar `algorithms: ['HS256']`**, diferente dos demais pontos que fixam. Risco de confusão de algoritmo.
- **`billing.service.ts:228`** — webhook de cobrança **sem verificação de assinatura**; corpo aceito como verdade → ativação/estorno indevidos.

Ver detalhes na seção 2.2. Itens **não confirmados / dependentes de ambiente** (CORS efetivo em produção, `npm audit`, `sameSite=strict`) seguem marcados como tal.

### ✅ QA Lead
- **Julgamento**: a suíte passa mas **não protege nada**. `kpi-card.spec.ts` copia as funções de domínio para dentro do teste (self-test); specs `e2e` ficam fora do `rootDir: 'src'` e **nunca são coletadas**; **não existe CI**.
- **Achado mais forte**: o `OrderFlowService` (núcleo de vendas, devoluções, fiado) **não tem nenhum teste** — nenhum arquivo o importa em teste.
- **Alerta de método (corrigido pelo líder)**: a contagem de "0 usos via `@UseGuards`" para `PoliciesGuard` e `TwoFactorGuard` é **falso positivo** — ambos estão registrados como **`APP_GUARD` globais** em `app.module.ts:98, 105`, portanto **são consultados em toda rota**. A leitura correta é outra: o guard global **sem metadados `@CheckPolicies` não tem o que enforçar** — ou seja, **toda rota sem `@CheckPolicies` fica sem verificação de permissão** (autenticada, mas não autorizada). Esse é o defeito real, e é estrutural.
- **Padrão que permanece válido**: **"teste que dá falsa confiança"**. As regras de campo do CASL são avaliadas **sem campo** (confirmado), e a suíte afirma que a **matriz** está correta — mas **nenhum teste afirma que a aplicação a consulta com o payload real**.

### 🔧 Investigador
- **Julgamento**: 24 problemas com `arquivo:linha`. Padrão dominante: **race conditions** em recursos compartilhados e **validações ausentes**.
- **Achado mais forte**: `createOrder` gera `orderNumber` com `findFirst(orderBy desc)+1` **fora de lock**, enquanto já existe `createWithOrderNumber` com retry — usado **apenas na sincronização offline**.

### 🔍 Revisor de Código (2 execuções)
- **Julgamento**: funções gigantes (~460 e ~200 linhas), duplicação entre `tenant-app` e `restaurant`, e **código morto confirmado** (`tables-salon-page.tsx` sem importações; rota legada `/public/qr/:qrToken`).
- **Divergência entre as duas execuções**: uma classificou a baixa de estoque duplicada como CRÍTICA; a outra nem citou. **Rebaixei para MÉDIO** por não conseguir reproduzir sem carrinho real com linhas repetidas.

---

## 2. Achados consolidados

### 🔴 ALTO

| # | Cat. | Local | Problema | Impacto | Correção |
|---|---|---|---|---|---|
| **A1** | Lógica · **CONFIRMADO** | `restaurant.service.ts:779` (`closeTableSession`) | Pedidos da conta são lidos **sem filtrar status** (`where: { tableSessionId: session.id }`) | **Pedidos CANCELADOS entram na conta.** Cliente paga pelo que não consumiu; o recibo que implementei hoje herda o erro | Filtrar `status: { notIn: ['CANCELLED'] }` na leitura, coerente com a linha 830 que já filtra ao marcar COMPLETED |
| **A2** | Autorização · **CONFIRMADO** | `tenant-app.controller.ts:656-665` (`cancelOrder`) + `tenant-app.service.ts:1378, 2763` | **`authorizeManager` não é chamado por ninguém.** `cancelOrder` exige só `canUpdate('Order')` — CAIXA, GARÇOM, COZINHA e TENANT_EMPLOYEE têm. `discountCents` entra sem validação e sem PIN; `Math.max(0, subtotal - discount)` aceita desconto de 100% | **Perda financeira direta**: qualquer operador estorna venda concluída, devolve estoque e cancela título de fiado sem aprovação. O gate de PIN no PDV é ritual de UI (duas chamadas desacopladas; a segunda nem vai ao servidor). Agravante: `managerPin` default `'1234'` (`schema.prisma:1043`, `tenant-app.service.ts:2768,3017`, `store-settings-page.tsx:57,117,824`) | **Custo menor do que parece**: `canApprove('Order')` **já existe** (`casl-ability.factory.ts:25`) e **já é aplicado** em `@Post('pos/authorize-manager')` (`tenant-app.controller.ts:645-647`) — basta **exigir a mesma política em `cancelOrder` e no desconto**, mais validar `reason` e enriquecer a trilha. Remover default `1234` (`schema.prisma:1043`) e forçar troca no primeiro acesso. **O PIN hoje não protege, não vincula e não prova** — ver detalhamento abaixo |
| **A3** | RBAC · **CONFIRMADO** (escopo corrigido) | `common/rbac/policies.ts:29` | `canUpdate = (subject) => ability.can(Action.Update, subject)` — **não recebe o campo** | As regras de campo **não são avaliadas**. Precisões verificadas: **(a)** existe **uma** checagem de campo em produção — `tenant-app.service.ts:1232` (`salePriceCents` em Product) — as demais não; **(b)** em `StockBatch` a whitelist de update é `status/quantity/expiryDate`, então o furo real é **só `quantity`** (`batches.service.ts:106-111`, checagem apenas `>= 0`), que alimenta o delta (130-134) e deixa STOCKIST inflar `product.stockQuantity`; **(c)** as regras de campo de `Order` (`discountCents`/`totalCents`) são **inalcançáveis** — não existe `PATCH orders/:id` no tenant-app, e o `PATCH restaurant/orders/:id/status` só aceita `status`. O vazamento de desconto está na **criação** (`createOrder:1378`), ação `Create`, que `cannot(Update,...)` não cobre de qualquer forma | **Um `if`** validando `quantity` no `updateBatch` + `canUpdate(subject, field?)` para o mecanismo passar a valer. Corrigir o comentário em `batches.controller.ts:35-37`, que afirma falsamente que o filtro é aplicado no serviço |
| **A4** | Segurança | `restaurant.gateway.ts:15,22-57` | WebSocket `/restaurant` aceita `companyId` **sem autenticação** | Qualquer cliente entra em `restaurant:<id>` e ouve pedidos/chamados de **outra empresa** | Validar JWT no handshake e conferir que `companyId` corresponde ao token |
| **A5** | Corrida | `tenant-app.service.ts:1306` e `restaurant.service.ts` | `orderNumber = findFirst(orderBy desc)+1` **fora de lock**; `createWithOrderNumber` (com retry) existe mas só é usado no sync offline | Duas vendas simultâneas → **números duplicados** (SQLite serializa escrita, mas duas transações podem ler o mesmo último número) | Usar `createWithOrderNumber` em **todos** os caminhos + `@@unique([tenantId, orderNumber])` |
| **A6** | Perda de dados | `OfflineSyncService.process()` | Sincronização da fila offline **sem lock de concorrência** e sem idempotência | Reconectar/duas abas → **venda criada duas vezes** | `clientRequestId` + lock por tenant; `updateMany where { clientRequestId, status: 'SYNCED' }` |
| **A7** | Lógica | `restaurant.service.ts` (`resolveByQrToken` / `resolveByDeviceToken`) | Consulta com `orderBy` + paginação sem critério determinístico | Pode devolver a **mesa errada** → pedido lançado na comanda de outro cliente | Busca direta pelo hash (`findFirst where { qrTokenHash }`), sem `orderBy`/`skip`; validar `companyId` |
| **A8** | Autorização · **CORRIGIDO** | `restaurant.controller.ts` (27 rotas) + `app.module.ts:98` | O `PoliciesGuard` **é global** — o defeito não é "guard não usado", e sim que **nenhuma rota do salão tem `@CheckPolicies`**, logo o guard global **não tem o que enforçar**. Resultado: rotas autenticadas mas **sem verificação de permissão** | Qualquer usuário autenticado do tenant executa qualquer ação do salão (incl. apagar mesa) | Adicionar `@CheckPolicies(...)` por rota, ou `@UseGuards(TenantOwnershipGuard)`. **Atenção**: o RBAC por papel aqui foi removido por sua decisão — ver seção 4 |
| **A9b** | Segurança | `auth.service.ts:278`, `verification.service.ts:63` | `jwtService.verify()` **sem fixar `algorithms: ['HS256']`** — o middleware (`tenant-context.middleware.ts:24`) fixa, estes não | **Confusão de algoritmo**: token assinado com outro algoritmo pode ser aceito | Fixar `algorithms: ['HS256']` em todos os `verify` |
| **A9** | Segurança | `tenant-app.controller.ts` / `auth` | PIN comparado com `===` (timing attack) e **sem rate limit** em `/pos/authorize-manager` | Força bruta de PIN de 4 dígitos | Comparação de tempo constante + bloqueio por tentativas |
| **A10** | Testes · **CONFIRMADO** | `kpi-card.spec.ts` | As funções de domínio são **copiadas para dentro do teste** | Teste **nunca exercita o código de produção**; cobertura real do KPI = 0 | Importar as funções reais em vez de reimplementá-las |
| **A11** | Testes | `jest.config.js` (`rootDir: 'src'`) + specs `e2e` | Specs de e2e estão **fora do `rootDir`** e nunca são coletadas; **não há CI** | Regressões graves passam despercebidas | Ajustar `roots`/`testMatch` e publicar workflow de CI |
| **A12** | Lógica | `tenant-app.service.ts` (laço de baixa de estoque) | Quantidade negativa aceita → `decrement` com negativo **aumenta** o estoque | Divergência de inventário | Rejeitar `quantity <= 0` |
| **A13** | Segurança · **CONFIRMADO** | `restaurant.controller.ts:213-224` (`POST public/qr/:qrToken/order`) + `restaurant.service.ts:474` | Rota **pública (sem login)** aceita `quantity` **sem teto**; `createOrder` do restaurante **não checa estoque** | Uma única requisição com `quantity: 1000000` joga o estoque dos insumos para um negativo enorme. (O throttler de 100/min não ajuda: basta 1 requisição) | Validar estoque antes de decrementar; teto de quantidade; rejeitar negativo/zero |
| **A14** | Corrida · **CONFIRMADO** | `restaurant.service.ts` `createOrder` | `MAX+1` **fora de transação**, e como os pedidos do salão têm `tenantId = NULL`, a constraint única **nunca dispara** | Números de pedido **duplicados de forma silenciosa** (ao contrário do tenant-app, que pelo menos estoura `P2002`) | Transação com retry, ou sequência protegida por constraint que realmente valide |
| **A15** | Transação | `restaurant.service.ts:582` | `notifyOrderCreated` **antes do commit** | Cliente é notificado de pedido que pode sofrer rollback | Emitir após o commit |

### 🟠 MÉDIO

| # | Local | Problema | Correção |
|---|---|---|---|
| M1 | `tenant-app.service.ts` | Itens repetidos no carrinho geram decremento/alerta **por linha**, não por produto | Agregar por `productId` antes do laço |
| M2 | Diversos | `Number(x)` sem `Number.isFinite` → `NaN` propaga para total/estoque | Validar e rejeitar com `BadRequestException` |
| M3 | `OrderItem.unitPrice`/`unitPriceCents` | Duas colunas para o mesmo valor; `??` não cai em `0` | Usar `\|\|`; unificar colunas em migração futura |
| M4 | `restaurant-tables-page.tsx`, `kitchen-kds-page.tsx` | Tempo calculado **no render**; `useEffect` do socket depende de `soundEnabled` → reconecta a cada toggle | Fonte única de tempo; guardar flag em ref e conectar uma vez |
| M5 | `restaurant.service.ts` | `resolveByQrToken` duplicado (legado vs canônico) | Remover legado após cobrir com testes |
| M6 | `tables-salon-page.tsx` (1059 linhas) | **Zero importações** — código morto | Remover |
| M7 | `tenant-app.service.ts` | `registerStockLoss` **sem transação** entre baixa e registro da perda | Envolver em `$transaction` |
| M8 | Financeiro | Baixa/estorno de título **sem validar posse** | Checar `tenantId/companyId` e `status` |
| M9 | `tenant-app.service.ts` | Loops com queries dentro de transações longas → timeouts com volume | Restringir por período e paginar |
| M10 | `.env` | `JWT_SECRET` com 28 chars (< 32). **Já lança erro em produção** (correto); só avisa em dev | Gerar 48+ bytes |
| M11 | `tenant-app.service.ts` | `authorizeManager` compara `pin === pin` — se o campo vier **nulo/vazio** para ambos, aprova | Rejeitar PIN ausente antes de comparar |
| M12 | `tenant-app.service.ts` | `void this.prisma...` **fire-and-forget** dentro de transações → erro silencioso | Aguardar ou tratar |
| M13 | `restaurant.controller.ts` | `waiter:call` duplicado (**PATCH** e **POST**) | Manter um só |
| M14 | `tenant-app.controller.ts` | `update-many-stock` e `find-all-stock` duplicados | Unificar |
| M15 | `pos-domain.ts` | `CASH` e `DINHEIRO` como formas distintas → relatório duplica "Dinheiro" | Unificar no domínio |
| M16 | Front | `refetchInterval` de 3s/5s/6s em várias telas simultâneas | Aumentar ou usar WebSocket |
| M17 | `nfe.service.ts:459` | NF-e **sobrescreve** o custo do produto em vez de fazer média ponderada | CMV e margem ficam errados | Média ponderada por quantidade |
| M18 | `billing-metrics.service.ts:20-31` | `calculateMRRHistory` retorna `mrr: 0` (stub) | MRR reportado como zero | Implementar |
| M19 | `restaurant.service.ts:582-583,847,907,1059-1060` | Emissores WebSocket **dentro** de `$transaction` | Cliente é notificado de algo que pode sofrer rollback | Emitir após o commit |
| M20 | `portal-parts.controller.ts:99-107` | `DELETE` sem `:id` (delega pro `:id/:detailId`) | Rota ambígua | Definir contrato |
| M21 | `common/guards/tenant-ownership.guard.ts:24-25` | **Fail-open em dois modos independentes**: (a) rota sem `:slug` → `if (!slug) return true`; (b) rota que **esquece `@UseGuards(...)`** — o guard **não é global**, é aplicado por rota em 6 controllers. Só (a) é pegável por teste unitário; (b) exige teste de integração rota a rota | Tornar o guard global com opt-out explícito, ou adicionar teste que varre as rotas não-`@Public` e falha se alguma não tiver o guard |

### 🟡 BAIXO

`ErrorBoundary` não exibe fallback (B1) · `validateCoupon` com `catch` silencioso (B2) · componente de 830 linhas no KDS (B3) · `useEffect` com deps incompletas (B4) · logs com possível dado sensível (B5) · `Number()` em valores monetários de string (B6) · notificações sem `catch` (B7) · caminho de arquivo não-normalizado em import XML (B8) · `kitchen-kds-page` com cleanup de socket ausente no caminho de erro (B9) · duplicação de lógica entre `tenant-app` e `restaurant` (B10) · falta de `README` de ambiente (B11) · ausência de `npm audit` (B12) · testes acoplados a dados reais (B13) · ícones/imports não utilizados em telas refatoradas (B14)

### ✅ Categorias sem problemas

- **Vazamento de memória**: nenhum `setInterval`/listener órfão relevante — os `useEffect` de socket têm cleanup (o defeito é reconectar demais, já em M4).
- **XSS / injeção de HTML**: nenhum `dangerouslySetInnerHTML` ou HTML injection encontrado.
- **Dependências com CVE conhecida**: ⚠️ **não avaliado** (não rodamos `npm audit`) — não é "sem problemas".
- **Segredo de versão**: sem credenciais em produção no código.

---

### 2.1 Adendo — 8 achados adicionais confirmados (Investigador, com `arquivo:linha`)

| # | Sev. | Local | Problema | Correção |
|---|---|---|---|---|
| S-1 | 🟠 | `tenant-app.service.ts:1378-1379` | `discountCents` **sem teto**: `Math.max(0, subtotal - discount)` aceita desconto maior que o subtotal → venda a R$ 0,00 | Rejeitar `discountCents > subtotalCents` |
| S-2 | 🟠 | `nfe.service.ts:459` | NF-e **sobrescreve** o custo do produto em vez de média ponderada → CMV e margem errados | Média ponderada por quantidade |
| S-3 | 🔴 | `restaurant.controller.ts:213-224` + `restaurant.service.ts:474` | Rota **pública (QR, sem login)** aceita `quantity` sem teto e `createOrder` **não checa estoque** → `quantity: 1000000` gera estoque negativo gigante | Validar estoque antes de decrementar; teto de quantidade |
| S-4 | 🟡 | `restaurant.service.ts:849-857` | Fechar mesa **sem comanda aberta** retorna `200` com `receipt: null` (bug do código de hoje) | Retornar `409` ou sinalizar `noActiveSession` |
| S-5 | 🟠 | `billing-metrics.service.ts:20-31` | `calculateMRRHistory` devolve `mrr: 0` (stub) → MRR reportado como zero | Implementar |
| S-6 | 🟡 | `tenants.service.ts:665-671` | `extendTrial(days)` aceita dias **negativo** → encurta o trial em vez de estender | Validar `days > 0` |
| S-7 | 🟠 | `restaurant.service.ts:582-583, 847, 907, 1059-1060` | Emissores WebSocket **dentro** de `$transaction` → cliente notificado de algo que pode sofrer rollback | Emitir após o commit |
| S-8 | 🟡 | `billing-metrics.service.ts:42-43` | `calculateChurnRate` usa denominador errado (soma não-normalizada) | Normalizar denominador |

**Correção de premissa sobre `orderNumber`** — o defeito tem **duas variantes distintas** e exigem correções diferentes:
- **tenant-app** grava `tenantId` → a constraint única **funciona**: concorrência estoura `P2002` e vira **erro 500** (grave, mas barulhento).
- **restaurante** grava `tenantId = NULL` (só `companyId`) → a constraint **nunca dispara** → números **duplicados em silêncio**.

Também vale citar a armadilha de contrato em `pos/domain/cart.ts:116-126`: `toOrderItemsPayload` produz `unitPriceCents`, mas a API lê `item.unitPrice` → campo ignorado; se um dia o front confiar nisso, todo item vira preço de tabela.

---

## 2.1 Adendo — segunda leva confirmada (investigador) e correção de premissa

| # | Sev. | Local | Problema | Correção |
|---|---|---|---|---|
| **A16** | 🔴 | `restaurant.controller.ts:213-224` + `restaurant.service.ts:435,474` | **Rota pública (QR do cliente, sem login)** aceita `quantity` **sem teto** e `createOrder` do restaurante **não checa estoque**. Uma única requisição com `quantity: 1000000` joga o estoque dos insumos para um negativo gigantesco | `quantity` com teto e validação; checar estoque antes de decrementar; rejeitar `<= 0` |
| **A17** | 🟡 | `restaurant.service.ts:849-857` (`closeTableSession`) — **código meu de hoje** | Fechar mesa **sem sessão aberta** retorna `200` com `receipt: null` | Retornar `409` ou sinalizar `noActiveSession` para o front não abrir modal vazio |
| M17 | 🟠 | `tenant-app.service.ts:1378-1379` | `discountCents` **sem teto**: `Math.max(0, subtotal - discount)` aceita desconto maior que o subtotal (venda a R$ 0,00) | Rejeitar `discountCents > subtotalCents` |
| M18 | 🟠 | `nfe.service.ts:459` | Entrada de NF-e **sobrescreve** o custo do produto em vez de média ponderada | CMV/margem ficam errados — usar média ponderada por quantidade |
| M19 | 🟠 | `billing-metrics.service.ts:20-31` | `calculateMRRHistory` devolve `mrr: 0` (stub) | MRR reportado como zero |
| M20 | 🟠 | `restaurant.service.ts:582-583,847,907,1059-1060` | Emissores WebSocket **dentro** de `$transaction` — cliente é notificado de algo que pode sofrer rollback | Emitir após o commit |
| M21 | 🟡 | `tenants.service.ts:665-671` | `extendTrial(days)` aceita dias **negativo** e encurta o trial | Validar `days > 0` |
| M22 | 🟡 | `billing-metrics.service.ts:42-43` | `calculateChurnRate` com denominador errado (soma em vez de base) | Normalizar denominador |

### Correção de premissa sobre `orderNumber` (A5)

O defeito tem **duas variantes distintas**, e eu havia generalizado:

- **`tenant-app`**: grava `tenantId` → a constraint única **funciona**: sob concorrência estoura `P2002` e vira **erro 500** (grave, mas barulhento e detectável).
- **`restaurant`**: grava `tenantId = NULL` (só `companyId`) → a constraint **nunca dispara** → **números duplicados em silêncio**.

Correções diferentes: no primeiro, retry sobre `P2002`; no segundo, **transação com lock** (não basta retry).

### Armadilha de contrato (latente)

`pos/domain/cart.ts:116-126` produz `unitPriceCents`, mas a API lê `item.unitPrice`. Hoje é inofensivo (o front manda os dois), mas se alguém confiar só nesse campo, **todo item cai para o preço de tabela**.

### Confirmação do A6

O investigador reproduziu o A6 por leitura e confirmou: **pedido cancelado entra na conta do fechamento**. É o bug mais grave desta auditoria em termos de dano financeiro direto ao cliente final.

---

## 2.2 Trilha de segurança — achados **verificados pelo líder**

| # | Sev. | Local | Problema | Impacto | Correção |
|---|---|---|---|---|---|
| **A18** | 🔴 | **`notifications.gateway.ts:36, 42`** (+ `handleConnection:25-27`) | `sendNotification()` e `sendAlertUpdate()` fazem `this.server.emit(...)` — **broadcast para todos os sockets**. O `handleConnection` **não entra em sala nenhuma** (só loga) | **Vazamento cross-tenant real e confirmado**: todo cliente recebe `notification` (título, mensagem, `ticketId`, link) e `alerts_update` de **todas** as empresas. Pior que o A4: aqui **nem existe sala**. Agravado por `cors: { origin: '*' }` (linha 20) | Autenticar no handshake, entrar em sala por tenant, emitir com `.to(...)` |
| **A19** | 🟠 | `auth.service.ts:278`, `verification.service.ts:63` | `jwtService.verify()` **sem fixar `algorithms: ['HS256']`** — o middleware (`tenant-context.middleware.ts:24`) fixa corretamente, estes dois não | **Confusão de algoritmo** (segredo público usado como HMAC) | Fixar `algorithms: ['HS256']` em ambos |
| M23 | 🟠 | `tenant-app.service.ts` (`removeItemFromOrder`) | `parseInt` **sem validar** — quantidade negativa/zero arbitrária | Item inválido; estoque manipulado | Validar `> 0` e pertinência ao pedido |
| M24 | 🟠 | `common/casl` + UI | `canReadReports` na matriz **sem uso** (CASHIER vê relatórios) | Divergência matriz ↔ interface | Aplicar ou remover a permissão |
| B16 | 🟡 | `scripts/create-super-admin.ts:52-87` | Senha aceita **por argumento de CLI** | Fica no histórico do shell | Aceitar só por prompt/env |
| B17 | 🟡 | `billing.service.ts` | `skipDuplicates: true` silencia `P2007` | Escrita falha sem ninguém perceber | Tratar explicitamente |

**Não avaliado** (não é "sem problemas"): `npm audit` de dependências; CORS efetivo em produção; `sameSite` real dos cookies; headers atrás de proxy reverso.

### Achados de segurança **descartados** por verificação minha

| Alegação | Realidade |
|---|---|
| `restaurant.gateway.ts:82` faria broadcast global | ❌ **Falso.** Todos os 4 `emit` do gateway do restaurante usam `.to(\`restaurant:${companyId}\`)`. O problema real é o **join sem autenticar** (A4), não broadcast. |
| `client-sites.controller.ts:34,43,57` com `deleteComment` sem posse | ❌ **Falso.** O controller tem só 4 rotas (`public/:slug`, `templates`, `GET :tenantId`, `PATCH :tenantId`) — **não existe `deleteComment`**. |
| `billing.service.ts:228` webhook sem assinatura | ❌ **Falso.** `stripe-webhook.controller.ts:79,95` usa `stripe.webhooks.constructEvent` com o header `stripe-signature` — verificação presente. |
| B20 | 🟡 | Cookies | `sameSite: lax` (não `strict`) | CSRF em cenários específicos | `strict` onde couber |

**Divergência registrada:** a trilha de segurança **não** sinalizou o **A6** (conta somar pedidos cancelados), que eu confirmei pessoalmente em `restaurant.service.ts:779`. Mantido como ALTO por evidência direta.

---

## 2.4 Segurança — achados de maior impacto (verificados pelo líder onde indicado)

| # | Sev. | Local | Problema | Impacto | Correção |
|---|---|---|---|---|---|
| **S1** | 🔴 **CONFIRMADO (bypass de 2FA)** | `auth.controller.ts:110-113` + `two-factor.guard.ts` (`if (allowPending) return true`) + `auth.service.ts:161-186` | **Cadeia completa, verificada por mim:** (1) login só com senha devolve `tempToken` com claim `mfa_pending: true`; (2) `JwtStrategy.validate` **não rejeita** esse claim; (3) `POST /auth/2fa/setup` é decorado com `@AllowMfaPending()`, e o `TwoFactorGuard` **retorna `true` imediatamente** nessa marcação — antes de qualquer checagem de 2FA; (4) `setup2fa` **sobrescreve** `twoFactorSecret` com um segredo novo e **devolve o segredo e os códigos de recuperação em claro** | **Bypass total do segundo fator**: com apenas a senha da vítima, o atacante troca o segredo TOTP da conta, gera o código e obtém token de acesso `is2faAuthenticated: true`. O 2FA não protege nada | `@AllowMfaPending()` **não** deve valer para `2fa/setup` quando o usuário **já** tem 2FA ativo — só na matrícula inicial. Melhor: exigir o código atual para trocar o segredo, e jamais devolver o `secret` em claro fora do momento de cadastro |
| **S8** | 🔴 | `tenants.controller.ts` — `GET /tenants`, `GET /tenants/:id` | **Sem `@Roles`**: qualquer usuário autenticado (inclusive CAIXA/GARÇOM) lista a base completa de clientes, com CNPJ, e-mail, telefone, plano, faturas e chamados | Vazamento da base de clientes e risco regulatório (LGPD). É o achado com maior efeito reputacional | `@Roles(SUPER_ADMIN, TENANT_OWNER...)` ou `@Roles(SUPER_ADMIN)` |
| **S9** | 🔴 | `search.controller.ts` | Busca global **sem escopo de tenant** | Consulta atravessa empresas | Restringir por tenant do usuário |
| **S10** | 🔴 | `billing/invoice.controller.ts` | Faturas, exportação e inadimplência de **todos** os tenants sem checagem de papel | Exposição financeira cross-tenant | Exigir papel de plataforma |
| **S11** | 🔴 | `settings.controller.ts` — `PATCH /settings/:key` | Escreve **qualquer** configuração global (`chave` e `valor` do corpo) e sofre mass assignment em templates de e-mail | Um usuário comum altera configuração global do sistema | Validar chave contra whitelist + `@Roles` |
| **S2** | 🔴 | `super-admin.guard.ts:20-24`, `roles.guard.ts:28`, `policies.guard.ts:37` — todos `return true` quando falta metadado | **Fail-open em todos os guards**: rota que **esquece** o decorator fica pública. Afeta dezenas de rotas de plataforma | Qualquer autenticado (até GARÇOM) acessa rotas de SUPER_ADMIN — gestão de tenants, billing, tickets | Inverter: negar quando não houver metadado, com `@Public()` explícito |
| **S3** | 🔴 | `email-templates.tsx:384` + `email-preview.tsx:45` | **XSS armazenado**: template de e-mail salvo é renderizado com `dangerouslySetInnerHTML` | Roubo de sessão de quem visualizar o preview | Sanitizar (DOMPurify) e CSP |
| **S4** | 🔴 | `tenant-app.service.ts:1326` | `unitPrice` aceito **do corpo da requisição** (`item.unitPrice \|\| product.salePriceCents`) e `discountCents` sem teto | **Manipulação de preço e desconto** no PDV (venda a R$ 0,00) | Usar sempre preço do servidor (como já faz `restaurant.service.ts:475`) |
| **S5** | 🔴 | `public-info.controller.ts` | Endpoint `@Public()` expõe **e-mail e telefone do admin** | Enumeração e phishing direcionado | Remover ou exigir auth |
| **S6** | 🔴 | `tenant-context.middleware.ts:153` + `prisma-extensions.ts` | **Isolamento multi-tenant inerte**: a extensão que injeta `tenantId` usa `query.args?.where?.tenantId`, que o Prisma não povoa (o filtro vem via `where` do serviço); sem cookie (`CLS` vem só de Bearer, e os serviços de tenant usam cookie) → **nunca bloqueia**, e em produção é desativada | A proteção que deveria impedir vazamento entre tenants **não funciona**; só os avisos `[tenant-isolation]` aparecem | Trocar para `query.model` + `query.args.where` e ler tenant do cookie; reativar em produção |
| **S7** | 🔴 | `notifications.gateway.ts:36, 42` (+ `handleConnection:25-27`) | `this.server.emit(...)` — **broadcast para todos**; `handleConnection` **não entra em sala** | Chamados e alertas de **todas** as empresas vazam para todos os clientes | Sala por tenant + `.to(...)` |
| M30 | 🟠 | `store-settings-page.tsx:57,117,824` | PIN do gerente pré-preenchido `1234` | Aprovação trivial | Remover default e forçar troca |
| M31 | 🟠 | `auth.service.ts:200` | Token de acesso **em `localStorage`** | Qualquer XSS rouba a sessão; anula o `httpOnly` do refresh | Manter access token em memória |
| M32 | 🟠 | `main.ts` | **Sem `ValidationPipe` global** | Mass assignment em vários DTOs | `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))` |
| M33 | 🟠 | `jwt.strategy.ts:47-53` | `request.user` carrega **`passwordHash` e `twoFactorSecret`** | Vazamento interno e risco de serialização em log | Selecionar campos explicitamente |
| M34 | 🟠 | `appointments.service.ts` | Agendamento público cria usuário com **`passwordHash: 'placeholder'`** e senha em texto | Conta fantasma / credencial inválida | Hash provisório aleatório e senha gerada com hash |
| B21 | 🟡 | `main.ts:33,39` | Swagger **exposto em produção** | Superfície de ataque mapeada | `if (NODE_ENV !== 'production')` |
| B22 | 🟡 | `auth.service.ts:200` | Access token com validade **default de 7 dias** | Janela longa de roubo | 15-30 min |

| **S12** | 🟠 | `chat-tool-executor` / `voice-agent` (IA) | As ferramentas do assistente **não passam pelo RBAC**: criam produto e comanda direto no serviço, sem `ability.can` | CAIXA/COZINHA executa ação de gerente via chat/voz | Checar permissão antes de executar cada ferramenta |
| **S13** | 🟠 | `main.ts` | Sem **helmet** e sem **CSP**; Swagger público | XSS e clickjacking facilitados | `helmet()` + CSP; condicionar Swagger |
| B23 | 🟡 | `auth.constants.ts:13` | Access token com **7 dias** (default) | Janela longa de uso indevido | 15–30 min |
| B24 | 🟡 | `env.ts:64` / `.env` | `JWT_REFRESH_SECRET` declarado e **não usuido** (`refreshTokenSecret()` inexistente) | Falsa sensação de segredo separado | Usuir ou remover |

### ✅ Categorias explicitamente **sem problemas** (validadas)

| Categoria | Evidência |
|---|---|
| **XXE** | Não aplicável — o XML da NF-e é lido por regex (`xmlImportService.ts:306-359`), sem parser de DTD/entidades |
| **Path traversal** | Não encontrado — `knowledge.service.ts` resolve por `path.resolve` + `startsWith(root)` |
| **Injeção de SQL** | Não encontrada — Prisma com parâmetros |
| **Webhook Stripe** | Assinatura verificada (`stripe-webhook.controller.ts:78-84`) |
| **Vazamento de stack em erro** | `AllExceptionsFilter` não devolve stack em produção |
| **Confusão de algoritmo JWT** | Não explorável — `jsonwebtoken@9` exige assinatura e restringe a `HS*` |
| **Rotação de refresh token** | **Implementada** com revogação da família (`auth.service.ts:158-165`) |
| **Bypass de 2FA** | **Não existe** — ver §3 |
| **Isolamento no núcleo do tenant/restaurante** | Operações com `companyId` e `tenantId` checados em `findFirst`/`updateMany` (`restaurant.service.ts:50-54, 91-94, 353-356, 664-666`) |

---

## 3. ⚠️ Falsos positivos descartados pelo líder

| Afirmação | Realidade verificada |
|---|---|
| "JWT com fallback fixo `projeto-saas-dev-secret-2026`" | ❌ **Falso.** `common/config/jwt-secret.ts` **lança exceção em produção** se faltar, for placeholder ou for curto; em dev gera segredo **aleatório por processo**. Correto. |
| "CORS `origin: '*'` na aplicação" | ❌ **Falso no app.** `main.ts` usa `FRONTEND_URL \|\| 'http://localhost:5173'`. O `'*'` só existe no **gateway WebSocket** — esse é real (A4). |
| "Baixa de estoque duplicada = CRÍTICO" | ⚠️ **Rebaixado para MÉDIO.** Não reproduzível sem carrinho com linhas repetidas; o decremento é sequencial na transação. |
| "`PoliciesGuard` e `TwoFactorGuard` não são consultados (0 usos)" | ❌ **Falso.** Ambos são **`APP_GUARD` globais** (`app.module.ts:98, 105`) e rodam em toda requisição. O defeito real é outro: **rotas sem `@CheckPolicies` não têm o que o guard enforçar** — hoje só 6 de 22 controllers declaram permissão (92 rotas). |
| "WebSocket do salão faz broadcast global" | ❌ **Falso no salão** (usa `.to(sala)`); o broadcast real é no **gateway de notificações** (A18). |
| "`client-sites` com `deleteComment` sem posse" | ❌ **Falso.** O método não existe; o controller tem 4 rotas. |
| "Webhook de cobrança sem assinatura" | ❌ **Falso.** Usa `stripe.webhooks.constructEvent`. |
| **"Bypass total do 2FA" — ida e volta do LÍDER** | ✅ **O bypass EXISTE.** Eu marquei como confirmado, depois retratei, e **a retração estava errada**. Dois agentes divergiram; resolvi lendo o guard, o decorator e o `setup2fa` direto. Fato decisivo: o `TwoFactorGuard` faz **`if (allowPending) return true`** — o `@AllowMfaPending()` **desliga** a checagem em `2fa/setup`, e o `setup2fa` **sobrescreve** `twoFactorSecret` e devolve o novo segredo em claro. Como o `2fa/verify` é **`@Public()`** e aceita `tempToken`+`code`, a cadeia fecha: **senha basta**. Ver S1. |

---

## 4. 🚩 Decisão sua (não é bug — é escolha)

O `restaurant.controller.ts` está **sem RBAC por papel** porque você orientou que o mapa de mesas **é** o painel do garçom — e eu reverti o RBAC que havia aplicado ali. Consequência não prevista: **o perfil COZINHA também consegue criar, editar e apagar mesas**, porque a ausência de guard vale para todos os papéis do tenant.

Sugestão: proteger **apenas as ações destrutivas** (apagar mesa, girar QR) por papel, mantendo o resto livre para o garçom. Não vou mexer sem sua concordância.

---

## ✅ Action list

| # | Ação | Resp. | Urgência |
|---|---|---|---|
| 1 | `closeTableSession`: excluir CANCELLED da conta (A1) | Backend | **P0** |
| 2 | **Cancelamento e desconto**: chamar `authorizeManager` no servidor, ligar a aprovação à ação com protocolo, remover default `1234` e registrar o alvo no log (A2) | Backend + Front | **P0** |
| 3 | **Um `if`** validando `quantity` em `updateBatch` + `canUpdate(subject, field?)` (A3) | Backend | **P0** |
| 4 | Autenticar handshake do WebSocket (A4) | Backend | **P0** |
| 5 | `orderNumber` atômico nos dois caminhos — no restaurante a constraint não protege (A5, A14) | Backend | **P0** |
| 6 | Idempotência/lock na sincronização offline (A6) | Backend | **P0** |
| 7 | Corrigir `resolveByQrToken`/`resolveByDeviceToken` (A7) | Backend | **P0** |
| 8 | Aplicar guard de posse no `restaurant.controller` (A8) | Backend | **P0** |
| 9 | Rate limit + tempo constante no PIN (A9) | Backend | P1 |
| 10 | `kpi-card.spec.ts` importar funções reais; CI + specs e2e coletadas (A10, A11) | QA | P1 |
| 11 | Rejeitar `quantity <= 0` (A12) | Backend | P1 |
| 12 | **Rotas sem `@CheckPolicies`** — hoje só **6 de 22 controllers** declaram permissão (92 rotas). Mapear as órfãs e fechar (A8) | Backend | **P0** |
| 13 | Fixar `algorithms: ['HS256']` em `auth.service.ts:278` e `verification.service.ts:63` (A9b) | Backend | **P0** |
| 14 | **`@Roles` nos controllers de plataforma** (S8-S11): `tenants`, `search`, `billing/invoice`, `settings`. Hoje qualquer autenticado acessa | Backend | **P0** |
| 15 | **Guards fail-open** (S2): inverter para negar quando faltar metadado — corrige os 4 acima de uma vez e previne os próximos | Backend | **P0** |
| 16 | **Isolamento multi-tenant inerte** (S6): corrigir a extensão Prisma e ler tenant do cookie | Backend | **P0** |
| 17 | **Preço vindo do cliente no PDV** (S4): usar preço do servidor como o módulo de restaurante já faz | Backend | **P0** |
| 18 | **Bypass de 2FA (S1)**: `@AllowMfaPending` não deve valer para `2fa/setup` com 2FA já ativo; exigir código atual para trocar o segredo | Backend | **P0** |
| 19 | Rota pública do QR: teto de `quantity` + checagem de estoque (A16) | Backend | **P0** |
| 13 | `closeTableSession` sem sessão → `409` em vez de `200` (A17) | Backend | P1 |
| 14 | Teto em `discountCents` (M17) e média ponderada na NF-e (M18) | Backend | P1 |
| 15 | Remover código morto (`tables-salon-page.tsx`, rota legada, duplicatas) | Front/Back | P2 |

---

## ⚠️ Limitações

- Auditoria **estática**; sem teste de carga, pen-test ou execução em produção.
- **Não foi rodado `npm audit`.**
- Achados de **corrida** são por leitura de código — confirmação exige teste de concorrência real.
- Nenhum código alterado nesta etapa.

---

## 📚 Índice de saídas

- **QA Lead**: relatório + adendo — cobertura, integridade dos specs, plano de teste (7 arquivos) e o achado B14 (PIN não protege / não vincula / não prova).
- **Investigador**: 24 achados + suplemento de 8 (S-1…S-8) com `arquivo:linha` — corridas, validação, tipagem, hooks, config; confirmou o A6.
- **Revisor de Código (2 execuções)**: 10 e 12 achados — corretude recente, duplicação, performance, código morto.
- **Segurança**: executada na 2ª tentativa (`general-purpose`); 18 achados brutos, dos quais **6 sobreviveram à verificação do líder** e **3 foram descartados como falsos** (ver §2.2). Confirmou de forma independente: vazamento no WebSocket, preço vindo do cliente no PDV, ausência de autorização nas rotas de plataforma, PIN default `1234`, falta de `ValidationPipe` global.
- **Não avaliado por ninguém**: `npm audit`, CORS/`sameSite` em produção, headers atrás de proxy.

---

> Relatório gerado pela oficina. Decisões de correção devem ser revisadas pelo responsável de engenharia antes da implementação.
