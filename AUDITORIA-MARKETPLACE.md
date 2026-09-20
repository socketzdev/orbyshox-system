# Auditoria do Módulo Marketplace — Orbyshox

**Data:** 13/09/2026  
**Escopo:** `apps/api/src/modules/marketplace/**` (1.312 linhas) + frontend `apps/web/src/features/tenant-app/marketplace/**`  
**Método:** leitura de código-fonte, verificação de schema Prisma, análise de fluxo ponta a ponta. Nenhum arquivo alterado.

---

## 0. Alerta de escopo — leia antes de tudo

A solicitação descreve um **marketplace de consumo** (vendedores, carrinho, checkout, comissões e repasses, reembolsos). **Esse sistema não existe neste projeto.**

O que existe é um módulo de **compras/procurement (B2B)**: a empresa compra de fornecedores. Confirmei no schema:

| Conceito solicitado       | Existe? | Evidência                                                                                    |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| Cadastro de vendedores    | ❌       | Não há modelo `Seller`. `Supplier` = fornecedor de quem se **compra**                        |
| Carrinho / checkout       | ❌       | Inexistente no módulo                                                                        |
| Pagamentos de marketplace | ❌       | Único gateway é Stripe, para assinatura SaaS                                                 |
| Comissões e repasses      | ❌       | `serviceCommissionPct` (`schema.prisma:661`) é do nicho **barbearia** (comissão do barbeiro) |
| Reembolsos / estornos     | ⚠️      | `refundMethod` (`:1001`) é do PDV (devolução de venda), não do marketplace                   |
| Webhook de pagamento      | ✅       | Só o Stripe de billing — bem implementado, mas fora do marketplace                           |

**Consequência:** as perguntas sobre "pagamento duplicado" e "falha de webhook" **não têm resposta no marketplace** — não há pagamento nele. Analisei o webhook do Stripe separadamente (§4).

O fluxo real é: **Fornecedor → Pedido de Compra → Recebimento (gera lote + estoque) → NF-e (conciliação → entrada de estoque + contas a pagar) → Lotes/Validade**.

---

## 1. Bugs e falhas por severidade

### 🔴 CRÍTICO

#### C1 — Manipulação de estoque entre inquilinos (segurança)

`offline-sync.service.ts:92-96` — `applyOrder()`

```ts
await this.prisma.product.update({
  where: { id: it.productId },   // ← sem tenantId
  data: { stockQuantity: { decrement: Number(it.quantity || 0) } },
});
```

O `productId` vem de um payload JSON enviado pelo cliente e armazenado cru. **Não há verificação de que o produto pertence ao inquilino.** Um usuário autenticado de qualquer tenant pode enfileirar um payload com o `productId` de outro tenant e **decrementar o estoque alheio**. O `Order` é criado com o `tenantId` correto, mas o `product.update` ignora o isolamento.

**Impacto:** corrupção de estoque cross-tenant. Viola o isolamento multi-inquilino do produto.

---

#### C2 — Sem idempotência na sincronização offline → pedido e baixa de estoque duplicados

`offline-sync.service.ts:21-48` (`process`) e `:58-98` (`applyOrder`)

A ordem das operações é: cria o pedido (`:72`) → decrementa estoque (`:92`) → **só então** marca `SYNCED` (`:34`). Se o processo cair entre a criação e a marcação, o item permanece `PENDING` e **na próxima execução o pedido é criado de novo** e o estoque decrementado uma segunda vez.

Agravante em `enqueue()` (`:14`): o `upsert` faz `update: { status: 'PENDING' }`. Reenviar um item já `SYNCED` **o devolve para a fila**, reprocessando uma venda já concluída.

**Impacto:** pedidos duplicados e estoque negativo. Sem chave de idempotência por `clientId` no momento da gravação.

---

#### C3 — Número de pedido duplicado (condição de corrida)

`offline-sync.service.ts:60-65`

```ts
const lastOrder = await this.prisma.order.findFirst({ where: { tenantId }, orderBy: { orderNumber: 'desc' } });
const orderNumber = (lastOrder?.orderNumber || 100) + 1;
```

Padrão read-then-write sem lock. Duas sincronizações concorrentes (ou uma sincronização simultânea a uma venda no PDV) leem o mesmo `lastOrder` e geram **o mesmo `orderNumber`**.

Verifiquei o schema: `orderNumber Int` (`schema.prisma:567`) **não tem constraint de unicidade** — nem global nem por tenant. Portanto o banco **aceita silenciosamente** os duplicados.

**Impacto:** notas com numeração repetida — problema fiscal e de conciliação.

---

#### C4 — Bypass completo do recebimento via PATCH de status

`purchase-orders.service.ts:111-120` — `update()`

```ts
if (data.status || data.notes || data.expectedDate) {
  await this.prisma.purchaseOrder.update({
    where: { id },
    data: { status: data.status ?? undefined, ... },   // ← sem whitelist
  });
}
```

O `status` vem do cliente **sem validação de transição nem whitelist**. Um `PATCH { status: "RECEIVED" }` marca o pedido como recebido **sem passar por `receive()`** — ou seja, **sem criar lote, sem incrementar estoque, sem Kardex**.

**Impacto:** pedido marcado como recebido com estoque nunca lançado. O inverso também é possível (voltar `RECEIVED` → `DRAFT` e re-receber).

---

#### C5 — Recebimento acima do pedido infla estoque / quantidade negativa reduz estoque

`purchase-orders.service.ts:164-189` — `receive()`

```ts
const newReceived = Math.min(item.quantity, item.receivedQty + Number(r.receivedQty || 0));  // ← capado
await this.prisma.purchaseOrderItem.update({ ... data: { receivedQty: newReceived } });

const batch = await this.prisma.stockBatch.create({
  data: { quantity: Number(r.receivedQty || 0), ... },   // ← NÃO capado
});
await this.prisma.product.update({
  data: { stockQuantity: { increment: Number(r.receivedQty || 0) } },  // ← NÃO capado
});
```

O `receivedQty` do item é limitado ao pedido, mas **o lote e o incremento de estoque usam o valor bruto**. Pedido de 10 unidades recebido com `receivedQty: 100` → item registra 10, estoque sobe **100**.

E não há validação de sinal: `receivedQty: -5` gera `increment: -5` → **estoque diminui** e um lote com quantidade negativa é criado.

**Impacto:** estoque irreal para cima ou para baixo, sem limite.

---

#### C6 — `finalize()` da NF-e: guarda de idempotência fora da transação

`nfe.service.ts:324` (checagem) vs `:344` (transação)

```ts
if (nfe.status === 'STOCKED') return nfe;   // linha 324 — FORA da transação
...
return this.prisma.$transaction(async (tx) => { ... });   // linha 344
```

Duas chamadas concorrentes a `finalize` leem `status != STOCKED` antes de qualquer escrita e **ambas prosseguem**. A transação garante atomicidade *dentro* de cada chamada, mas não impede a segunda.

**Impacto:** estoque lançado em dobro e **contas a pagar duplicadas** (as `BillPayable` são criadas em `:399` e `:414`, sem vínculo de volta com a NF-e que permita detectar duplicidade). Risco financeiro direto.

---

#### C7 — Chave de acesso da NF-e é única globalmente e a checagem não é por tenant

`nfe.service.ts:134` + `schema.prisma:785`

```ts
const dup = await this.prisma.nfeEntry.findUnique({ where: { accessKey: parsed.accessKey } });
```

`accessKey String @unique` é **global**. A checagem ignora o `tenantId` e a mensagem devolvida é *"NF-e X já foi importada"*.

**Impacto duplo:**

1. **Vazamento entre inquilinos** — o tenant B descobre que o tenant A já importou aquela chave.
2. **Bloqueio legítimo** — XMLs repetidos (reenvio do fornecedor, fixture de teste, cenário de revenda) ficam impossíveis de importar, com erro que não distingue "é sua" de "é de outro".

---

#### C8 — Editar ou apagar lote desincroniza o estoque sem Kardex

`batches.service.ts:70-78` (`update`) e `:84` (`remove`)

Ambos alteram/apagam o `StockBatch` **sem tocar em `product.stockQuantity` e sem gravar `StockMovement`**. O lote é uma segunda fonte de verdade para a mesma quantidade.

**Impacto:** `stockQuantity` fica permanentemente divergente do somatório dos lotes, e o Kardex perde rastreabilidade. Também não há validação de `quantity >= 0`.

---

### 🟠 ALTO

| #   | Local                                | Problema                                                                                 | Impacto                                                                                       |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| H1  | `purchase-orders.service.ts:91-110`  | `deleteMany` → `createMany` → `update` **sem transação**                                 | Falha no meio deixa pedido sem itens e total antigo                                           |
| H2  | `purchase-orders.service.ts:164-189` | `receive()` **sem transação**                                                            | Falha no meio: estoque incrementado, pedido não atualizado                                    |
| H3  | `nfe.service.ts:130-191`             | `import()` **sem transação** — cria fornecedor (`:146`) e depois a NF-e (`:158`)         | Falha na NF-e deixa **fornecedor órfão**                                                      |
| H4  | `offline-sync.service.ts:92-97`      | Baixa de estoque **sem `StockMovement`**                                                 | Kardex divergente do estoque (vendas online registram)                                        |
| H5  | `offline-sync.service.ts:92`         | Sem verificação de saldo                                                                 | Estoque pode ficar negativo                                                                   |
| H6  | `suppliers.service.ts:120-121`       | `linkProduct` não valida que `productId` é do tenant                                     | Vínculo cross-tenant produto↔fornecedor                                                       |
| H7  | `suppliers.service.ts:77-95`         | `update()` **não checa CNPJ duplicado** (o `create` checa em `:55`)                      | `P2002` não tratado → **HTTP 500** em vez de erro amigável                                    |
| H8  | `nfe.service.ts:276` vs `:378`       | `reconcile` grava `costPriceCents = item.vUnCom`; `finalize` grava `vUnCom / multiplier` | Custo unitário divergente quando a unidade é caixa/fardo                                      |
| H9  | `nfe.service.ts:335-342`             | `catch {}` silencioso ao reparsear o XML                                                 | Falha de parse → cria conta a pagar com **vencimento chutado em 30 dias**                     |
| H10 | todos os 5 controllers               | **ERRATA: incorreto** — os controllers TÊM `@CheckPolicies` por rota                              | — (achado descartado) |

**ERRATA — H10 estava errado.** Ao implementar as correções, verifiquei o estado real: existem **100 usos de `@CheckPolicies`** e **19 de `@Roles`** no backend, e os 5 controllers do marketplace **têm RBAC por rota** — inclusive uma distinção deliberada e correta entre `canUpdate('Nfe')` (reconciliar) e `canFinalize('Nfe')` (lançar estoque + financeiro), com o comentário de que "o estoquista reconcilia mas não finaliza".

Minha leitura inicial dos controllers não encontrou esses decorators; a verificação posterior encontrou. **O achado não se sustenta no estado atual do código e deve ser descartado.** O `PoliciesGuard` é *fail-open* quando a rota não declara política — isso é intencional e documentado, não uma falha.

---

### 🟡 MÉDIO

| #   | Local                              | Problema                                                                                                                                |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `purchase-orders.service.ts:56-57` | `Number(it.quantity) \|\| 0` sem validar > 0 → quantidade/valor **negativos** aceitos no pedido                                         |
| M2  | `nfe.service.ts:344-426`           | Sem validação de que **Σ duplicatas == total da nota** (exigência fiscal)                                                               |
| M3  | `nfe.service.ts:280-292`           | `CREATE_NEW` não checa barcode/SKU duplicado; `Product.barcode` **não é único** (`schema.prisma:477`) → produtos duplicados silenciosos |
| M4  | `batches.service.ts:73-75`         | `status` sem whitelist; `new Date()` sem validação → `Invalid Date` gera 500                                                            |
| M5  | `nfe.controller.ts:29`             | `POST /nfe/import` sem `@Throttle` — regex pesada + escrita, vetor de DoS (só o auth tem throttling)                                    |
| M6  | todos os `getTenant()`             | Não checam status do tenant — **inquilino suspenso/cancelado continua operando**                                                        |
| M7  | `suppliers.service.ts:111`         | `delete` sem checar dependências (pedidos, NF-e, contas) → erro de FK → 500                                                             |
| M8  | `main.ts:18`                       | Sem limite de tamanho de corpo; NF-e grande pode estourar o default de 100 kb do Express                                                |
| M9  | `offline-sync.service.ts:78`       | `paymentMethod` gravado cru — **não usa a normalização** que adicionei em `tenant-app/payment-method.ts`                                |
| M10 | `nfe.service.ts:45`                | `Number(t.replace(',', '.'))` troca só a **primeira** vírgula → `"1.234,56"` vira `0`                                                   |
| M11 | `nfe.service.ts:199`               | Comparação `'SEM GTIN'` sensível a maiúsculas                                                                                           |
| M12 | módulo inteiro                     | **Zero testes** — nenhum `*.spec.ts` no marketplace, backend ou frontend (todos os outros módulos têm)                                  |
| M13 | `main.ts:41`                       | Swagger em `/api/docs` sem autenticação                                                                                                 |

---

## 2. Funcionando de verdade × mockado/incompleto

### ✅ Funciona e persiste no banco (verificado no código)

- Cadastro de fornecedores, vínculo produto↔fornecedor, ativar/desativar
- Pedido de compra: criar, editar (rascunho), enviar, cancelar, receber
- **Recebimento gera lote + incrementa estoque + Kardex** (`receive()`)
- NF-e: parse do XML, importação, conciliação automática por EAN/SKU, conciliação manual, criação de produto novo, finalização com entrada de estoque + Kardex + contas a pagar
- Lotes: listagem, estatísticas de validade (crítico ≤7d, alerta ≤30d)
- Sugestões de reposição por estoque mínimo
- Sincronização offline (com os defeitos C1–C3)
- Frontend do marketplace: **100% ligado em API real** — nenhum mock, `TODO` ou dado de demonstração

### ⚠️ Parcial / frágil

- **`packQuantity`**: existe no schema (`:492`), e `finalize()` converte caixa→unidade (`:355-358`). Funciona, mas o acesso usa `(product as any).packQuantity` — sinal de que o campo não estava no client Prisma quando foi escrito. Funciona hoje; quebra silenciosamente se o campo for renomeado.
- **Comissões**: existem apenas para barbearia, não para marketplace
- **Reembolso**: existe no PDV (`refundMethod`), não no marketplace
- **Numeração de pedido**: funcional, mas sem constraint (C3)

### ❌ Inexistente (a solicitação presumia que existisse)

- Vendedores / sellers
- Carrinho e checkout
- Pagamento no marketplace (split, escrow, repasse)
- Comissão sobre venda de terceiros
- Reembolso/estorno de pedido de marketplace
- Webhook de pagamento do marketplace

---

## 3. Checklist para go-live

### Bloqueadores (não subir sem)

- [ ] **C1** — adicionar `tenantId` no `product.update` do `applyOrder`
- [ ] **C2** — chave de idempotência por `clientId` gravada na mesma transação do pedido; `enqueue` não pode reabrir item `SYNCED`
- [ ] **C3** — constraint `@@unique([tenantId, orderNumber])` + geração de número atômica
- [ ] **C4** — whitelist de transições de status; remover `status` do `PATCH` livre
- [ ] **C5** — capar lote/estoque ao saldo do pedido e rejeitar `receivedQty <= 0`
- [ ] **C6** — mover a checagem `STOCKED` para dentro da transação (`updateMany` condicional)
- [ ] **C7** — `accessKey` único **por tenant** + erro que não revele existência alheia
- [ ] **C8** — `batches.update/remove` ajustando `stockQuantity` e gravando Kardex
- [ ] **H1–H3** — envolver `update()`, `receive()` e `import()` em `$transaction`
- [x] ~~**H10**~~ — RBAC já estava implementado; achado incorreto (ver errata) 

### Importantes

- [ ] **H4** — Kardex no offline-sync
- [ ] **H5** — bloquear estoque negativo
- [ ] **H6** — validar `productId` do tenant em `linkProduct`
- [ ] **H7** — checar CNPJ no `update` e tratar `P2002` no filtro global
- [ ] **H8** — unificar o custo unitário entre `reconcile` e `finalize`
- [ ] **H9** — não criar conta a pagar quando o parse falhar; propagar o erro
- [ ] **M1** — rejeitar quantidade/valor ≤ 0
- [ ] **M2** — validar Σ duplicatas vs total
- [ ] **M5** — `@Throttle` no `import` e nos endpoints pesados
- [ ] **M6** — checar status do tenant em todos os `getTenant()`
- [ ] **M12** — testes para os fluxos de recebimento, finalização e sincronização

### Desejável

- [ ] **M3, M4, M7–M11, M13**

---

## 4. Webhook e pagamento (fora do marketplace)

Como a solicitação citou webhook e pagamento duplicado, registrei o que encontrei: o **Stripe (billing SaaS)** está bem construído e **não apresenta os defeitos acima**.

- Idempotência real por PK do evento: `billing.service.ts:50-70` (checa, insere o `StripeEvent` antes de processar, e trata processamento paralelo)
- Verificação de assinatura HMAC com `rawBody`: `stripe-webhook.controller.ts:95`
- Exige o header `stripe-signature` antes de tocar no corpo (`:79`)
- Reprocessamento retoma eventos não concluídos (`:70`)

**Este é o padrão que o marketplace deveria seguir** — e é exatamente o que falta em C2/C6.

---

## 5. Parecer

# 🔴 NO-GO

O módulo **não está pronto para produção**. Não por imaturidade funcional — os fluxos principais existem e persistem corretamente — mas por **integridade de dados e isolamento entre inquilinos**.

**Justificativa:**

1. **C1 é falha de segurança multi-inquilino.** Um usuário pode alterar estoque de outro tenant. Isso sozinho inviabiliza o go-live em ambiente com mais de um cliente.
2. **C4, C5 e C6 corrompem estoque silenciosamente.** Estoque errado contamina venda, PDV, financeiro e relatórios — e a correção exige auditoria manual, porque o Kardex também fica inconsistente.
3. **C6 duplica contas a pagar.** É o único item com **impacto financeiro direto**.
4. **Nenhuma transação nos fluxos de escrita.** Falha parcial deixa o banco em estado impossível de reconciliar automaticamente.
5. **Zero testes** no módulo. Não há rede de proteção para as correções acima.

**Ordem sugerida:**

1. **C1** (segurança — isolar tenant)
2. **C6 + C4 + C5** (integridade de estoque e financeiro)
3. **C2 + C3** (idempotência e numeração)
4. **H1–H3** (transações)
5. **C7 + C8**, depois **H10** (RBAC)
6. Testes cobrindo recebimento, finalização de NF-e e sincronização

**Estimativa:** os bloqueadores são correções localizadas — concentradas em 4 arquivos (`offline-sync.service.ts`, `purchase-orders.service.ts`, `nfe.service.ts`, `batches.service.ts`) e ~1.300 linhas no total. É trabalho de dias, não de semanas, **desde que acompanhado de testes** — sem eles, as correções de concorrência não podem ser validadas.

---

### Observação final

Se a intenção era de fato um **marketplace de consumo** (vendedores, comissões, repasses), isso é um **produto novo**, não um ajuste: exigiria modelos para vendedor, anúncio, carrinho, split de pagamento, repasse e disputa/reembolso. Vale confirmar antes de investir nas correções acima — elas valem para o módulo de compras, que é o que existe hoje.










