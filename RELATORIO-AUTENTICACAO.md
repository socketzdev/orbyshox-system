# Relatório de Análise — Sistema de Login e Autenticação

**Projeto:** Orbyshox / ProjetoSaaS
**Escopo:** `apps/api/src/modules/auth`, `apps/api/src/modules/tenant-app`, `apps/api/src/common/{guards,decorators,strategies}`, `apps/web/src/{lib,providers,features/auth}`, `packages/database/prisma/schema.prisma`
**Data:** 11 de setembro de 2026
**Método:** leitura integral do código-fonte + verificação em runtime contra API viva e banco populado

> Todas as afirmações abaixo foram verificadas na fonte. Onde houve teste em runtime, o resultado observado está transcrito. Nada foi assumido sem evidência.

---

## 1. Arquitetura atual

### 1.1 Existem DOIS sistemas de autenticação paralelos

O ponto mais importante do diagnóstico: o projeto mantém dois fluxos de autenticação independentes, com regras, cookies, segredos e comportamento divergentes.

| | **Painel Super Admin** | **ERP do Inquilino** |
|---|---|---|
| Controller | `auth.controller.ts` → `/api/v1/auth` | `tenant-app.controller.ts` → `/api/v1/tenant-app/:slug` |
| Identificador | e-mail **ou** telefone | telefone (enviado no campo `email`) |
| Serviço | `AuthService` | `TenantAppService.login()` |
| Cookie de acesso | `saas_access` | `ta_access` |
| Cookie de refresh | `saas_refresh` (path `/api/v1/auth`) | `ta_refresh` (path `/api/v1/tenant-app`) |
| 2FA | Sim (TOTP) | **Não** |
| Detecção de reuso de refresh | Sim (por família) | **Não** |
| Storage do frontend | `saas_admin_token` | `saas_tenant_token_<slug>` |

Isso não é apenas duplicação: é **divergência de segurança**. O 2FA existe em um lado e não no outro; a rotação de refresh é robusta em um lado e frágil no outro. Correções aplicadas a um fluxo não chegam ao outro.

### 1.2 Fluxo do Painel Super Admin (linha do tempo)

1. **Login** — `POST /auth/login` (rota `@Public()`). `AuthService.login()` chama `validateUser()`.
2. **`validateUser()`** — monta um `OR` com até **7 variações** do identificador (e-mail literal, telefone cru, telefone sem DDI, com `+`, com `+55`, sem código de país, e ainda um e-mail sintético `${telefone}@projetosaas.com`). Busca com `findFirst` e verifica com `argon2.verify`.
3. **Conta desativada** — `if (!user.isActive) throw new UnauthorizedException('User is deactivated')` (mensagem em inglês, ver §5).
4. **2FA** — se `is2faEnabled`, emite `tempToken` com claim `{ sub, mfa_pending: true }` e retorna `{ mfaRequired: true, tempToken }`. **Sem refresh token ainda.**
5. **Emissão** — `accessToken` (JWT, 15 min) + `refreshToken` (formato `<refreshId>.<secret>`, 14 dias).
6. **Cookies** — `setAuthCookies()` grava `httpOnly`, `sameSite: 'lax'` (access) e `'strict'` (refresh), `secure` apenas se `NODE_ENV === 'production'`.
7. **Validação a cada request** — `JwtStrategy.validate()` **recarrega o usuário do banco** (`findUnique` + `tenant.slug`) e rejeita se `!isActive`. Ponto forte: desativar um usuário tem efeito imediato.
8. **Refresh** — `POST /auth/refresh`. Token é dividido em `refreshId` e `secret`; busca por **chave primária** (`findUnique`), verifica o hash argon2, e se `revokedAt` estiver preenchido **revoga a família inteira** (detecção de roubo).
9. **Logout** — revoga todos os `refreshToken` ativos do usuário e limpa os dois cookies.

### 1.3 Fluxo do ERP do Inquilino

1. `POST /tenant-app/:slug/login` — resolve o tenant por slug, busca `User` com `AND [ (tenantId = X OR role = SUPER_ADMIN), (identificador) ]`.
2. Verifica `isActive` **antes** da senha (diferença relevante, ver §4.6).
3. `argon2.verify` da senha.
4. Emite access (15 min) e refresh (30 dias, `crypto.randomBytes(48)`), grava `tokenHash` com argon2.
5. `refreshSession()` — verifica `slug`, `revokedAt`, `expiresAt` e `argon2.verify` sobre **`findMany` com `take: 25`**.
6. `TenantOwnershipGuard` compara o `tenantSlug` do token com o `:slug` da URL, com bypass total para `role === 'SUPER_ADMIN'`.

### 1.4 Provedores externos

**Nenhum.** Não há login social (Google/Apple/GitHub), SSO, SAML ou OIDC. O Stripe está integrado, mas apenas para cobrança — não como provedor de identidade.

### 1.5 Cadastro, recuperação e verificação de e-mail: **implementados mas inalcançáveis**

Este é um achado estrutural grave:

- `registration.service.ts` (cadastro completo com transação tenant + user + site) e `verification.service.ts` (verificação de e-mail, reset de senha com revogação de sessões) existem.
- **Nenhum dos dois está registrado em `providers` de nenhum módulo.** `AuthModule` declara apenas `providers: [AuthService, JwtStrategy]`.
- **Nenhum controller expõe suas funções.** `grep` por `RegistrationService|VerificationService` fora dos próprios arquivos retorna **zero**.
- **Não há página de cadastro nem de recuperação no frontend.** O link "Esqueceu a senha?" em `login-page.tsx:294-303` tem `onClick` que apenas chama `toast.info('A recuperação é feita pelo e-mail corporativo cadastrado.')` e **não faz nenhuma chamada de rede**.
- Os schemas `registerSchema`, `forgotPasswordSchema`, `resetPasswordSchema` e `verifyEmailSchema` existem em `packages/shared-types/src/auth.ts` e **não são usados por nenhuma rota**.

Consequência em cadeia: como `registration.service.ts:93` cria o usuário com `isActive: false`, e a única função que o ativa (`activateEmail`) é inalcançável, **qualquer conta criada por esse caminho ficaria permanentemente bloqueada**.

---

## 2. Segurança

### 2.1 O que está correto

| Prática | Evidência |
|---|---|
| **Hash de senha com Argon2** | `argon2.hash` / `argon2.verify` em todos os pontos; sem MD5/SHA1/bcrypt em uso |
| **Hash de refresh token com Argon2** | `tokenHash` nunca é o token em claro (`auth.service.ts:242`) |
| **JWT com expiração curta** | 15 min (`ACCESS_TTL`) |
| **Validação reconsultando o banco** | `jwt.strategy.ts:38-42` recarrega `isActive` a cada request |
| **Rotação de refresh + detecção de família** | `auth.service.ts:98-104` revoga toda a família em caso de reuso |
| **Comparação em tempo constante (reset de senha)** | `verification.service.ts:45-49` emite token falso para e-mail inexistente, evitando enumeração |
| **Logout revoga os refresh tokens** | `auth.service.ts:131-136` |
| **2FA TOTP implementado** | `setup2fa`/`verify2fa`/`recovery2fa`, com 8 códigos de recuperação hasheados |
| **Cookies `httpOnly`** | `auth.controller.ts:10-27` |
| **Rate limit global ativo** | `ThrottlerGuard` registrado (100 req/min por IP) |
| **Reset de senha revoga sessões** | `verification.service.ts:84-90` |

### 2.2 Proteção contra força bruta — **insuficiente**

Verificado em runtime: **12 tentativas de senha errada consecutivas retornaram todas HTTP 401**, sem bloqueio.

- O único limite é o `ThrottlerGuard` global: **100 requisições por minuto por IP**. Isso permite ~100 tentativas de senha/minuto por IP — muito acima do aceitável para autenticação.
- **Não existe `@Throttle()` em nenhuma rota** (`grep -rn "@Throttle"` em `apps/api/src` retorna vazio). Login, refresh e 2FA têm exatamente o mesmo limite das rotas de leitura.
- **Não existe throttling por conta.** Um atacante com IPs rotativos ataca o mesmo e-mail indefinidamente.
- **Não existe lockout no servidor.** O bloqueio de 5 tentativas/30s em `login-page.tsx:37-38` é **puramente client-side** — a constante `MAX_ATTEMPTS` vive no estado do React e desaparece ao recarregar a página ou ao atacar a API diretamente.
- **Não há captcha, backoff progressivo nem notificação de acesso suspeito.**

### 2.3 Validação de tokens — pontos frágeis

**Segredos com fallback inseguro.** Quatro locais aceitam um segredo default silencioso:

| Arquivo | Fallback |
|---|---|
| `auth.module.ts:15` | `\|\| 'dev-secret'` |
| `jwt.strategy.ts:34` | `\|\| 'dev-secret'` |
| `tenant-context.middleware.ts:18` | `\|\| 'dev-secret'` |
| `tenant-app.module.ts:12` | `\|\| 'secret'` |

Se `JWT_SECRET`/`JWT_ACCESS_SECRET` faltar em produção, a aplicação **não falha** — ela assina tokens com um segredo público e conhecido, permitindo forjar um `SUPER_ADMIN`.

**Divergência de segredos entre `.env`.** A raiz define `JWT_SECRET=dev-secret`, enquanto `apps/api/.env` define apenas `JWT_ACCESS_SECRET=supersegredo...` e `JWT_REFRESH_SECRET`. Como `auth.module.ts` prioriza `JWT_SECRET`, **a API pode assinar com o valor da raiz** dependendo de qual `.env` é carregado — um risco de ambiente.

**Tenant-app não verifica assinatura de forma idêntica.** `tenant-app.module.ts` usa `'secret'` como fallback, diferente de `'dev-secret'`.

**2FA não é exigido no servidor.** `TwoFactorGuard` existe e está correto, mas **nunca é registrado** — e `verify2fa` é o único caminho que emite token com `is2faAuthenticated: true`. Como nenhuma rota exige essa flag, nada impede que uma sessão sem 2FA concluído acesse os endpoints. Verificado: `grep` por `is2faAuthenticated|isTwoFactorAuthenticated` só encontra o guard morto, a emissão e a propagação na strategy — **nenhum consumidor**.

### 2.4 Expiração de sessões — inconsistente

| Token | Admin | Inquilino |
|---|---|---|
| Access | 15 min | 15 min |
| Refresh | **14 dias** (`auth.service.ts:254`) | **30 dias** (`tenant-app.service.ts:38`) |
| Claim `exp` no refresh | via JWT | via coluna `expiresAt` |

`.env` define `JWT_REFRESH_EXPIRES_IN=14d` (raiz) e `7d` (api), **mas esse valor nunca é lido** — os TTLs estão hardcoded no código. O refresh do inquilino dura mais que o dobro do admin sem justificativa documentada.

### 2.5 Tratamento de credenciais

**O `refreshToken` é devolvido no corpo JSON em ambos os fluxos.** Confirmado em runtime:

```
POST /api/v1/auth/login          → chaves: accessToken, refreshToken, user
POST /api/v1/tenant-app/:slug/login → chaves: user, tenant, accessToken, refreshToken
```

Como o `AuthProvider` grava o token do navegador e o access token é enviado via `Authorization: Bearer`, o refresh token no corpo é **desnecessário** para o fluxo web — os cookies `httpOnly` já o carregam. Devolvê-lo expõe o token ao JavaScript da página, anulando o benefício do cookie `httpOnly` (um XSS pode ler a resposta e exfiltrar uma sessão de 14–30 dias).

**Cross-tenant confirmado em runtime.** O `SUPER_ADMIN` faz login no tenant A **e** no tenant B:
```
POST /tenant-app/sabor-arte/login → HTTP 201
POST /tenant-app/dom-corte/login  → HTTP 201
```
A cláusula `{ role: 'SUPER_ADMIN' }` em `tenant-app.service.ts:101` permite que a conta de plataforma autentique em **qualquer** inquilino. É intencional como suporte, mas sem restrição adicional é um vetor de movimento lateral se a conta for comprometida.

**`cleanAdminToken` / sessão no frontend.** `lib/auth.ts` guarda o token em armazenamento do navegador, acessível a qualquer script da página.

---

## 3. Componentes e camadas

### 3.1 Backend (`apps/api/src`)

| Componente | Arquivo | Papel |
|---|---|---|
| `AuthController` | `modules/auth/auth.controller.ts` | 7 rotas: login, refresh, logout, 2fa/setup, 2fa/verify, 2fa/recovery, me |
| `AuthService` | `modules/auth/auth.service.ts` | Credenciais, tokens, 2FA |
| `JwtStrategy` | `modules/auth/strategies/jwt.strategy.ts` | Extrai token de header **ou** cookie; recarrega usuário |
| `JwtAuthGuard` | `common/guards/jwt-auth.guard.ts` | Global; respeita `@Public()` |
| `RolesGuard` + `@Roles` | `common/guards/roles.guard.ts` | Registrado; papéis reais: `SUPER_ADMIN`, `SUPPORT_MANAGER`, `SUPPORT_AGENT`, `FINANCE`, `DEV`, `TENANT_ADMIN` |
| `TenantOwnershipGuard` | `common/guards/tenant-ownership.guard.ts` | Compara slug do token com o da URL |
| `ThrottlerGuard` | `app.module.ts:83` | Global, 100 req/min/IP |
| `TwoFactorGuard` | `common/guards/two-factor.guard.ts` | **Nunca registrado** |
| `PoliciesGuard` + CASL | `common/guards/policies.guard.ts`, `common/casl/` | **Nunca registrado** |
| `verification.service.ts` | `modules/auth/` | Verificação/reset — **órfão** |
| `registration.service.ts` | `modules/auth/` | Cadastro — **órfão** |
| `TenantContextMiddleware` | `common/middleware/` | Popula CLS; também decodifica JWT |

### 3.2 Frontend (`apps/web/src`)

| Componente | Arquivo | Papel |
|---|---|---|
| `LoginPage` | `features/auth/login-page.tsx` | Login admin + etapa 2FA |
| `TenantLoginPage` | `features/tenant-app/auth/tenant-login-page.tsx` | Login por telefone + auto-redirect |
| `AuthProvider` | `providers/auth-provider.tsx` | Sessão em memória + revalidação via `/auth/me` |
| `lib/auth.ts` | `lib/auth.ts` | Persistência de tokens/sessão no navegador |
| `lib/api.ts` | `lib/api.ts` | Axios; injeta `Bearer`; **sem refresh automático** |
| `RequireAuth` | `components/require-auth.tsx` | Guarda de rota |

### 3.3 Banco (`packages/database/prisma/schema.prisma`)

- `User` — `email` e `phone` únicos; `passwordHash`; `isActive` (default **true**); `is2faEnabled`; `twoFactorSecret`; `lastLoginAt`.
- `RefreshToken` — `tokenHash` **@unique**; `familyId`; `expiresAt`; `revokedAt`; `replacedByTokenId`. Índices em `userId`, `familyId`, `tokenHash`.
- `RecoveryCode` — `codeHash`, `usedAt`.

**Provider: SQLite.** Não há tabela de tentativas de login, bloqueios, IP de origem ou histórico de dispositivos.

### 3.4 Bibliotecas

`@nestjs/jwt` · `@nestjs/passport` + `passport-jwt` · `argon2` · `otplib` (TOTP) · `cookie-parser` · `@nestjs/throttler` · `nestjs-cls` · `axios` + `react-hook-form` + `zod` (frontend)

---

## 4. Pontos de falha e vulnerabilidades

### 🔴 CRÍTICO

**4.1 `refreshToken` vaza no corpo da resposta (ambos os fluxos)**
Verificado em runtime. Anula o `httpOnly` do cookie; um XSS obtém sessão de 14–30 dias. *Correção trivial, risco alto.*

**4.2 2FA não é imposto pelo servidor**
`TwoFactorGuard` nunca registrado; nenhuma rota exige `is2faAuthenticated`. Um token emitido antes da conclusão do 2FA é aceito normalmente. A proteção existe apenas como intenção.

**4.3 Segredos JWT com fallback silencioso**
`'dev-secret'` e `'secret'` em 4 arquivos. Em produção sem a variável, tokens podem ser **forjados** como `SUPER_ADMIN`. Deve haver falha explícita na inicialização.

**4.4 Cadastro e recuperação de senha inacessíveis**
`RegistrationService` e `VerificationService` são órfãos. Contas criadas nascem `isActive: false` e a única função que as ativa é inalcançável → **bloqueio permanente**. O link "Esqueceu a senha?" é decorativo.

**4.5 Força bruta praticamente sem defesa**
12 tentativas consecutivas passaram sem bloqueio (verificado). Só existe limite por IP (100/min). O lockout do frontend é contornável.

### 🟠 ALTO

**4.6 Divergência de mensagem revela existência e estado da conta**
`auth.service.ts:37` lança `'User is deactivated'` para conta desativada, mas `'Invalid credentials'` para senha errada. Um atacante distingue "conta existe e está desativada" de "credenciais erradas" — mesmo padrão em `tenant-app.service.ts:122` (`'Usuário desativado'`).

**4.7 `staff.findOne` retorna o registro completo do usuário**
`staff.service.ts:26` usa `include` sem `select`, devolvendo `passwordHash` e `twoFactorSecret`. `AuthController.getMe()` desestrutura e remove os dois campos (`auth.controller.ts:82`), mas **`GET /staff/:id` não o faz**.

**4.8 `refreshSession` do inquilino faz varredura com `take: 25`**
`tenant-app.service.ts:209-227` roda `argon2.verify` sobre até 25 hashes por requisição. Argon2 é intencionalmente caro: poucas requisições concorrentes saturam a CPU. Repete o problema já corrigido no `AuthService`.

**4.9 Sem renovação automática de token no cliente**
`lib/api.ts:30-43` trata 401 apenas redirecionando para `/login`. Não chama `/auth/refresh`. Como o access dura 15 min, **o usuário é deslogado a cada 15 minutos** — e o refresh token, que existe justamente para isso, nunca é usado no fluxo admin.

**4.10 Conta desativada entre a emissão e o uso**
Mitigado por `JwtStrategy.validate()` recarregar `isActive`, mas o refresh do inquilino não revalida o tenant (suspenso/cancelado) — só o usuário.

### 🟡 MÉDIO

**4.11 Política de senha inconsistente** — `login-page.tsx:27` exige **6** caracteres; `shared-types/src/auth.ts` exige **8**. O backend não valida força de senha em nenhum ponto (login não precisa, mas o reset sim).

**4.12 `verify2fa` não limita tentativas** — `authenticator.verify` aceita um código de 6 dígitos sem throttling específico. Combina com 4.5.

**4.13 Códigos de recuperação 2FA não têm TTL nem rotação** — 8 códigos de 4 bytes; uso único via `usedAt`, mas nunca expiram.

**4.14 `AuthModule` não importa `NotificationsService`** — como `NotificationsService` é usado por `RegistrationService` (órfão), quando o cadastro for ligado será necessária injeção explícita.

**4.15 Eventos de autenticação não são auditados** — `AUDIT_ACTION.LOGIN` e `LOGOUT` existem em `shared-types/src/enums.ts:205-206` e **nunca são emitidos**. `grep` por `auditLog.create` nos módulos de auth retorna zero. Sem rastro de acessos.

**4.16 `logout` do inquilino não revoga refresh tokens no servidor** — `tenant-app.controller.ts:107-113` apenas limpa cookies; o token permanece válido no banco até expirar (30 dias).

**4.17 Sem `select` nas consultas de login** — `validateUser` traz a linha inteira do `User`.

### 🔵 BAIXO

**4.18 Mojibake em `login-page.tsx:346`** — `` `Bloqueado Â· ${lockRemaining}s` `` (resquício da correção de encoding anterior).

**4.19 Mensagens de erro em inglês** — `'Invalid credentials'`, `'User is deactivated'`, `'Invalid 2FA code'` em uma UI em português.

**4.20 `logout` não é idempotente para sessão expirada** — sem `user`, apenas limpa cookies e retorna `{ ok: true }`.

**4.21 `tempToken` do 2FA usa o mesmo segredo e TTL do access token (15 min)** — o `expiresIn` não é reduzido; um `mfa_pending` válido por 15 min é uma janela generosa.

**4.22 `staff.findOne` não filtra por papel** — exposição de dados (ver 4.7).

---

## 5. Experiência do usuário

### 5.1 Login (admin)
**Bom:** foco automático no campo, alternância de visibilidade da senha, `Enter`/`Ctrl+Enter`, indicador de bloqueio com contagem, etapa 2FA com `inputMode="numeric"` e `autoComplete="one-time-code"`, `aria-label` na senha e no código, `Escape` volta ao login.

**Ruim:**
- Redirecionado ao login a cada 15 min (4.9).
- Bloqueio de 30s é cosmético (4.5).
- Erros em inglês misturados ao português (4.19).
- Sem aviso de Caps Lock.

### 5.2 Login (inquilino)
- Campo é rotulado como telefone; o valor vai no campo `email` da API — funciona, mas é frágil.
- **Verificado em runtime: SUPER_ADMIN autentica em qualquer tenant** (201 em dois slugs distintos).
- **`refreshToken` no corpo** (confirmado).
- No `useEffect`, tenta `/me`, depois `/refresh`, depois navega — podendo navegar mesmo sem confirmar a sessão.

### 5.3 Cadastro
**Inexistente na UI e inalcançável na API** (4.4).

### 5.4 Logout
- Admin: correto — revoga no servidor e limpa cookies (mas o `AuthProvider` limpa o token só após a resposta, portanto offline o logout local falha silenciosamente).
- Inquilino: **não revoga no servidor** (4.16).

### 5.5 Recuperação de senha
**Não existe.** O link apenas exibe um toast informativo.

### 5.6 Mensagens de erro
Boa prática confirmada: senha errada e e-mail inexistente retornam **exatamente** `"Invalid credentials"` — sem enumeração. Quebra em 4.6.

---

## 6. Sugestões de melhoria (priorizadas)

> As correções marcadas com **[já corrigido nesta sessão]** referem-se ao trabalho anterior de remediação backend. As demais estão pendentes de autorização.

### P0 — Imediato (segurança explorável)

| # | Ação | Benefício | Esforço |
|---|---|---|---|
| 1 | Remover `refreshToken` do corpo JSON em ambos os logins | Elimina exfiltração de sessão via XSS | Baixo |
| 2 | Remover fallbacks `'dev-secret'`/`'secret'` e **falhar no boot** se ausentes | Impede forja de tokens | Baixo |
| 3 | Registrar `TwoFactorGuard` nas rotas sensíveis + exigir `is2faAuthenticated` | Torna o 2FA real | Médio |
| 4 | Ligar cadastro e recuperação (controllers + rotas + páginas) | Desbloqueia contas; entrega o fluxo prometido | Alto |
| 5 | Unificar a mensagem de conta desativada com "credenciais inválidas" | Fecha enumeração | Baixo |

### P1 — Curto prazo

| # | Ação | Benefício | Esforço |
|---|---|---|---|
| 6 | `@Throttle` específico no login/refresh/2FA (ex.: 5/min por IP) | Freia força bruta | Baixo |
| 7 | Throttling **por conta** + backoff progressivo + lockout temporário no servidor | Bloqueia ataque distribuído | Médio |
| 8 | Implementar refresh automático no `lib/api.ts` (fila de 401 → `/auth/refresh` → reenvio) | Elimina logout a cada 15 min | Médio |
| 9 | `select` explícito em `validateUser` e `staff.findOne` | Remove vazamento de hash/segredo | Baixo |
| 10 | `logout` do inquilino revoga refresh tokens no servidor | Encerra sessão de verdade | Baixo |
| 11 | Auditar `LOGIN`, `LOGOUT`, falha de login e reuso de token | Rastreabilidade e detecção | Médio |
| 12 | Alinhar TTLs (refresh admin 14d vs inquilino 30d) e ler de env | Consistência e configurabilidade | Baixo |

### P2 — Médio prazo (arquitetura)

| # | Ação | Benefício | Esforço |
|---|---|---|---|
| 13 | **Unificar os dois fluxos de auth** em um único serviço com escopo de tenant | Elimina divergência de regras | Alto |
| 14 | Aplicar `refreshToken` no formato `<id>.<secret>` também no inquilino | Remove varredura com argon2 (DoS) | Baixo |
| 15 | Restringir o bypass `SUPER_ADMIN` (ex.: flag de impersonation auditada) | Reduz movimento lateral | Médio |
| 16 | Exigir mídia/senha forte + validação de força no reset | Eleva a barreira | Baixo |
| 17 | TTL curto e rotação para códigos de recuperação 2FA | Reduz janela de abuso | Baixo |
| 18 | Detectar vazamento de credenciais e notificar acesso de novo dispositivo | Defesa em profundidade | Médio |
| 19 | Migrar storage do access token para cookie `httpOnly` exclusivo | Mitiga XSS | Médio |

### P3 — Polimento

| # | Ação |
|---|---|
| 20 | Corrigir mojibake em `login-page.tsx:346` |
| 21 | Traduzir mensagens do backend para português |
| 22 | Indicador de Caps Lock e medidor de força no login |
| 23 | `tempToken` do 2FA com TTL de 5 min, em vez de 15 |
| 24 | Página de sessões ativas com revogação por dispositivo |

---

## 7. Resumo executivo

**A base é sólida onde mais importa:** Argon2 em tudo, rotação de refresh com detecção de roubo por família, revalidação de usuário a cada request, cookies `httpOnly` e ausência de enumeração de e-mail no login do painel. Essas decisões estão corretas e não devem ser alteradas.

**O risco concentra-se em três frentes:**

1. **Funcionalidades de segurança que existem no código mas nunca são ligadas** — 2FA não imposto, cadastro e recuperação órfãos, `TwoFactorGuard` e `PoliciesGuard` mortos. O padrão se repete e é o maior perigo: dá aparência de proteção sem proteção.
2. **Duplicação divergente** — dois sistemas de autenticação com regras diferentes. O inquilino ficou para trás em 2FA, rotação de refresh e logout.
3. **Higiene de credenciais** — refresh token no corpo, segredos com fallback público e ausência de defesa contra força bruta.

**Cinco correções de esforço baixo eliminam o risco explorável imediato:** retirar o refresh token do corpo, remover os fallbacks de segredo, registrar o `TwoFactorGuard`, unificar a mensagem de conta desativada e adicionar `@Throttle` no login.

O item de maior esforço e maior retorno é a **unificação dos dois fluxos** — enquanto existirem, toda correção precisará ser aplicada duas vezes, e uma das duas será esquecida.
