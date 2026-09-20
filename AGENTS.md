# AGENTS.md — ProjetoSaaS (Orbyshox)

Monorepo pnpm + Turbo. Node >= 20, packageManager pnpm@9.12.0.

## Comandos (rode pelo agente para feedback, em vez de depender so do LSP)

- `pnpm dev` — sobe tudo (api + web)
- `pnpm --filter web dev` / `pnpm --filter api dev` — escopo por app
- `pnpm typecheck` / `pnpm lint` / `pnpm build` — verificacoes antes de concluir
- `pnpm --filter database prisma:migrate` / `prisma:generate` / `prisma:seed`
- `pnpm --filter web test` (vitest) / `pnpm --filter api test` (jest)

## Arquitetura

- `apps/web` — React 18 + Vite 5 + TS + Tailwind 3 + shadcn/Radix, React Router,
  TanStack Query/Table, RHF + Zod, socket.io-client. Use os componentes de
  `apps/web/src/components/ui` (shadcn) em vez de criar do zero — o MCP `shadcn`
  ajuda com isso.
- `apps/api` — NestJS 10 + Prisma 5 (@projeto-saas/database) + Stripe + BullMQ +
  Socket.io + CASL (RBAC em MATRIZ-RBAC.md). Nunca exponha chaves Stripe no client.
- `packages/database/prisma` — schema e migrations. Mudanca de schema exige
  migration, `prisma:generate` e checar impacto na API + web.

## Convenções

- Docs de API em tempo real: MCP `context7` (React/Tailwind/Nest/Prisma/Stripe).
- Teste de UI/fluxo SaaS: MCP `playwright` contra `pnpm --filter web dev`.
- Banco Postgres/Prisma: MCP `prisma`. Stripe: MCP `stripe` (só com
  STRIPE_SECRET_KEY no ambiente, nunca commitada).
- Nunca leia ou exiba `.env` (há plugin local que bloqueia); use `.env.example`.
- Formatters/LSP do opencode estão ativos (TS, ESLint, Prisma, Tailwind);
  mesmo assim rode `typecheck`/`lint`/`test` do escopo alterado antes de dizer "pronto".
