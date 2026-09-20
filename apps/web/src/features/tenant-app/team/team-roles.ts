/**
 * Catálogo de cargos do cadastro de funcionários (espelho da especificação).
 *
 * Cada cargo vira um `role` de primeira classe no backend (matriz CASL) +
 * `position` para distinguir Cozinheiro de Chapista (mesmo papel, funções
 * diferentes na cozinha). A lista `modules` é SÓ pré-visualização na tela —
 * quem decide de verdade é o backend (PoliciesGuard) + flags de habilidade.
 */
export interface CargoOption {
  id: string;
  /** Papel gravado em `User.role`. */
  role: string;
  /** Função sugerida em `User.position` (editável). */
  position: string;
  label: string;
  description: string;
  modules: string[];
}

export const CARGOS: CargoOption[] = [
  {
    id: 'admin',
    role: 'TENANT_ADMIN',
    position: 'Administrador',
    label: 'Administrador',
    description: 'Acesso total: relatórios, financeiro, equipe e configurações.',
    modules: ['Tudo: salão, cozinha, PDV, relatórios, financeiro, equipe, configurações'],
  },
  {
    id: 'manager',
    role: 'STORE_MANAGER',
    position: 'Gerente',
    label: 'Gerente',
    description: 'Opera tudo no dia a dia, mas não apaga nada (lotes, contas, equipe).',
    modules: ['Salão & mesas', 'Cozinha (KDS)', 'PDV & caixa', 'Relatórios', 'Financeiro', 'Compras', 'Tarefas'],
  },
  {
    id: 'waiter',
    role: 'WAITER',
    position: 'Garçom',
    label: 'Garçom',
    description: 'Salão: comandas, KDS dos seus pedidos, PDV e rotinas.',
    modules: ['Mapa de Mesas', 'Cozinha (KDS)', 'Caixa do Salão (PDV)', 'Tarefas & Rotinas'],
  },
  {
    id: 'cook',
    role: 'KITCHEN',
    position: 'Cozinheiro',
    label: 'Cozinheiro',
    description: 'Preparo: KDS, lista de compras e rotinas da cozinha.',
    modules: ['Cozinha (KDS)', 'Notas de Compra', 'Tarefas & Rotinas'],
  },
  {
    id: 'grill',
    role: 'KITCHEN',
    position: 'Chapista',
    label: 'Chapista',
    description: 'Chapa: mesmo acesso do cozinheiro, função identificada.',
    modules: ['Cozinha (KDS)', 'Notas de Compra', 'Tarefas & Rotinas'],
  },
  {
    id: 'cashier',
    role: 'CASHIER',
    position: 'Operador de Caixa',
    label: 'Operador de Caixa / PDV',
    description: 'Frente de caixa: PDV, comandas e baixas (sem gerenciar).',
    modules: ['PDV', 'Mapa de Mesas', 'Tarefas & Rotinas'],
  },
  {
    id: 'cleaning',
    role: 'CLEANING',
    position: 'Limpeza',
    label: 'Limpeza / Serviços Gerais',
    description: 'Só rotinas. Pode ser cargo próprio ou acumulado por outro cargo.',
    modules: ['Tarefas & Rotinas (limpeza)'],
  },
];

/** Rótulo do cargo a partir de role+position (lista de equipe, crachás). */
export function cargoLabel(role?: string | null, position?: string | null): string {
  const r = (role || '').toUpperCase();
  const pos = (position || '').toLowerCase();
  const byRolePos = CARGOS.find((c) => c.role === r && pos.includes(c.position.toLowerCase()));
  if (byRolePos) return byRolePos.label;
  const byRole = CARGOS.find((c) => c.role === r);
  if (byRole) return byRole.label;
  if (r === 'TENANT_OWNER') return 'Administrador';
  if (r === 'TENANT_EMPLOYEE') return position || 'Operador';
  if (r === 'STOCKIST') return 'Estoquista';
  return position || r || '—';
}

/** Tags vindas do backend (JSON string ou array) em lista. */
export function parseTags(tags: unknown): string[] {
  if (!tags) return [];
  try {
    const arr = typeof tags === 'string' ? JSON.parse(tags) : tags;
    if (!Array.isArray(arr)) return [];
    return arr.filter((t) => typeof t === 'string').map((t: string) => t.toUpperCase());
  } catch {
    return [];
  }
}
