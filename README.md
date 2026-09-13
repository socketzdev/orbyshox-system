# ProjetoSaaS — Painel Administrativo Super Admin

SaaS de Gestão Empresarial para Restaurantes, Barbearias e Supermercados.

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Monorepo | Turborepo + pnpm |
| Backend | NestJS 10, TypeScript |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Banco | PostgreSQL + Prisma ORM |
| Auth | JWT + Refresh Token + TOTP 2FA |
| RBAC | CASL (@casl/ability) |
| Pagamentos | Stripe SDK |
| Filas | BullMQ + Redis |

## Estrutura do Projeto

```
ProjetoSaaS/
├── apps/
│   ├── api/          # NestJS Backend API
│   └── web/          # React Admin Frontend
├── packages/
│   ├── database/     # Prisma Schema + Client
│   ├── shared-types/ # Zod Schemas + TypeScript Types
│   └── tsconfig/     # Shared TypeScript Configs
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16
- Redis (para BullMQ)

## Setup

```bash
# 1. Clonar e instalar dependências
pnpm install

# 2. Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais (DATABASE_URL, STRIPE keys, etc.)

# 3. Gerar Prisma Client
pnpm db:generate

# 4. Rodar migrações
pnpm db:migrate

# 5. Popular banco com dados iniciais
pnpm db:seed

# 6. Iniciar em desenvolvimento
pnpm dev
```

O backend estará em `http://localhost:3001/api/v1` e o frontend em `http://localhost:5173`.

## Credenciais Iniciais (Seed)

| Papel | Email | Senha |
|---|---|---|
| Super Admin | admin@projetosaas.com | admin123456 |

## Documentação da API

Swagger disponível em `http://localhost:3001/api/docs` após iniciar o backend.

## Módulos

### Backend (apps/api)
- **Auth** — Login, JWT, 2FA TOTP, refresh token rotation
- **Tenants** — CRUD de empresas clientes com filtros e ações administrativas
- **Plans** — Gestão de planos e cupons de desconto
- **Billing** — Integração Stripe, faturas, inadimplência, métricas (MRR, ARPU, LTV)
- **Dashboard** — KPIs agregados e alertas
- **Tickets** — Central de suporte com SLA
- **Staff** — Equipe interna do SaaS
- **Audit** — Logs imutáveis de auditoria
- **Settings** — Configurações globais e templates de email
- **Notifications** — Serviço de envio de emails

### Frontend (apps/web)
- **Login** — Autenticação com 2FA
- **Dashboard** — KPIs, gráficos MRR, aquisição, distribuição
- **Clientes** — Listagem com filtros, ficha detalhada com abas
- **Planos** — Cards de planos, formulários, cupons
- **Financeiro** — Overview, faturas, inadimplência
- **Suporte** — Tickets com thread de mensagens
- **Equipe** — Gestão de funcionários internos
- **Configurações** — Trial, templates, integrações
- **Auditoria** — Logs somente-leitura

## Multi-tenancy

Modelo: banco compartilhado com `tenant_id` + PostgreSQL Row-Level Security (RLS).
O `nestjs-cls` (AsyncLocalStorage) propaga o contexto do tenant automaticamente.

## Segurança

- Senhas: Argon2
- JWT: Access token 15min + Refresh token 14d (HttpOnly cookie)
- 2FA: TOTP obrigatório para Super Admin
- RBAC: 5 perfis internos (SUPER_ADMIN, SUPPORT_MANAGER, SUPPORT_AGENT, FINANCE, DEV)
- Auditoria: Log imutável de toda ação administrativa
- Stripe: Webhook com validação de assinatura + idempotência

## Scripts

```bash
pnpm dev          # Iniciar dev (api + web)
pnpm dev:api      # Apenas backend
pnpm dev:web      # Apenas frontend
pnpm build        # Build de produção
pnpm db:generate  # Gerar Prisma Client
pnpm db:migrate   # Rodar migrações
pnpm db:seed      # Popular banco
pnpm db:studio    # Prisma Studio (GUI do banco)
pnpm test         # Rodar testes
pnpm lint         # Lint
pnpm typecheck    # Verificação de tipos
```

## Licença

Proprietário — Todos os direitos reservados.
