/**
 * B4 — Backfill de `position` (texto livre) para `role` (papel real).
 *
 * MODO PADRÃO: dry-run. Não escreve nada.
 * Para aplicar de verdade:  node backfill-rbac-roles.js --apply
 *
 * O que faz:
 *  1. Usuários cujo `position` indica garçom/salão/atendente → role WAITER
 *  2. Usuários cujo `position` indica cozinha → role KITCHEN
 *  3. `TENANT_OWNER` (papel legado que não existe em nenhuma lista) → TENANT_ADMIN
 *
 * Regras de segurança:
 *  - NUNCA rebaixa um TENANT_ADMIN/STORE_MANAGER. Só promove quem está em
 *    TENANT_EMPLOYEE, ou normaliza o papel legado TENANT_OWNER.
 *  - `position` é PRESERVADO (continua servindo de rótulo na UI).
 *  - Cada alteração grava um AuditLog com before/after.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const WAITER_HINTS = ['garcom', 'garçom', 'salao', 'salão', 'atendente', 'waiter'];
const KITCHEN_HINTS = ['cozinh', 'cook', 'chef', 'chapeiro', 'pizzaiolo'];

const normalize = (s) => String(s || '').toLowerCase().trim();

function targetRole(position) {
  const p = normalize(position);
  if (!p) return null;
  if (WAITER_HINTS.some((h) => p.includes(h))) return 'WAITER';
  if (KITCHEN_HINTS.some((h) => p.includes(h))) return 'KITCHEN';
  return null;
}

(async () => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, position: true },
  });

  const changes = [];
  const ignorados = [];

  for (const u of users) {
    const alvo = targetRole(u.position);

    if (alvo && u.role === 'TENANT_EMPLOYEE') {
      changes.push({ id: u.id, email: u.email, position: u.position, de: u.role, para: alvo });
      continue;
    }
    if (alvo && u.role !== 'TENANT_EMPLOYEE') {
      ignorados.push({ ...u, motivo: 'não é TENANT_EMPLOYEE — não será rebaixado' });
      continue;
    }
    if (u.role === 'TENANT_OWNER') {
      changes.push({
        id: u.id,
        email: u.email,
        position: u.position,
        de: u.role,
        para: 'TENANT_ADMIN',
      });
    }
  }

  console.log(`modo: ${APPLY ? 'APLICANDO' : 'DRY-RUN (nada será gravado)'}\n`);
  console.log(`total de usuários no banco: ${users.length}`);
  console.log(`alterações propostas: ${changes.length}\n`);
  for (const c of changes) {
    console.log(`  ${c.de} → ${c.para}  | position="${c.position ?? ''}" | ${c.email}`);
  }

  if (ignorados.length) {
    console.log(`\nintocados (position de garçom/cozinha mas papel superior): ${ignorados.length}`);
    for (const i of ignorados) console.log(`  ${i.role} | position="${i.position}" | ${i.email}`);
  }

  const porPapel = {};
  for (const c of changes) porPapel[`${c.de} → ${c.para}`] = (porPapel[`${c.de} → ${c.para}`] || 0) + 1;
  console.log('\nresumo:', JSON.stringify(porPapel, null, 2));

  if (!APPLY) {
    console.log('\nDry-run concluído. Rode com --apply para gravar.');
    await prisma.$disconnect();
    return;
  }

  let aplicadas = 0;
  for (const c of changes) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: c.id }, data: { role: c.para } });
      await tx.auditLog.create({
        data: {
          userId: c.id,
          action: 'ROLE_BACKFILL',
          targetType: 'User',
          targetId: c.id,
          metadata: JSON.stringify({
            before: { role: c.de, position: c.position },
            after: { role: c.para, position: c.position },
            fields: ['role'],
            reason: 'B4 — migração de position (texto livre) para papel real',
          }),
        },
      });
    });
    aplicadas++;
  }
  console.log(`\n${aplicadas} usuário(s) atualizado(s).`);

  const depois = {};
  const todos = await prisma.user.findMany({ select: { role: true } });
  for (const u of todos) depois[u.role] = (depois[u.role] || 0) + 1;
  console.log('distribuição final de papéis:', JSON.stringify(depois, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('erro:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
