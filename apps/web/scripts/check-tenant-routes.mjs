/**
 * Audita links internos do tenant-app contra as rotas realmente registradas.
 * Uso: node scripts/check-tenant-routes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// ── 1. Rotas registradas ────────────────────────────────────────────────────
const router = readFileSync(join(SRC, 'routes/index.tsx'), 'utf8');
const registered = new Set();

for (const m of router.matchAll(/<Route\s+path="([^"]+)"/g)) {
  const p = m[1];
  // Consideramos apenas rotas filhas de /:slug/app
  if (p.startsWith('marketplace')) registered.add(p);
  else if (!p.startsWith('/') && !p.includes(':')) registered.add(p);
}
registered.add('dashboard'); // <Route index> redireciona para dashboard

// ── 2. Links internos ───────────────────────────────────────────────────────
const files = walk(SRC).filter((f) => !f.endsWith('routes/index.tsx'));
const problems = [];

const patterns = [
  // navigate(`/${slug}/app/foo`)
  /\$\{slug\}\/app\/([a-z0-9\-/]+)/g,
  // to={`${base}/foo`}
  /\$\{base\}\/([a-z0-9\-/]+)/g,
  // literais: "/app/foo" (ex.: rotas do super admin com prefixo fixo)
  /["'`]\/app\/([a-z0-9\-/]+)["'`]/g,
];

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const lines = code.split('\n');

  lines.forEach((line, i) => {
    for (const re of patterns) {
      for (const m of line.matchAll(re)) {
        const path = m[1].replace(/\$\{[^}]+\}/g, '*').replace(/\/$/, '');
        if (!path) continue;

        const first = path.split('/')[0];
        const known =
          registered.has(path) ||
          registered.has(first) ||
          // rotas dinâmicas: suppliers/:supplierId
          [...registered].some((r) => r.split('/')[0] === first);

        if (!known) {
          problems.push({
            file: relative(ROOT, file).replace(/\\/g, '/'),
            line: i + 1,
            path,
            snippet: line.trim().slice(0, 90),
          });
        }
      }
    }
  });
}

// ── 3. Relatório ────────────────────────────────────────────────────────────
console.log('Rotas registradas sob /:slug/app:');
console.log('  ' + [...registered].sort().join(', ') + '\n');

if (problems.length === 0) {
  console.log('Nenhum link quebrado encontrado.');
} else {
  console.log(`${problems.length} link(s) possivelmente quebrado(s):\n`);
  for (const p of problems) {
    console.log(`  ${p.file}:${p.line}  ->  /app/${p.path}`);
    console.log(`      ${p.snippet}\n`);
  }
}
