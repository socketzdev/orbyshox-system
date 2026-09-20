export interface UserRoleInfo {
  role?: string | null;
  position?: string | null;
  tags?: string | string[] | null;
}

function userTags(user?: UserRoleInfo | null): string[] {
  const t = user?.tags;
  if (!t) return [];
  try {
    const arr = typeof t === 'string' ? JSON.parse(t) : t;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === 'string').map((x: string) => x.trim().toUpperCase());
  } catch {
    return [];
  }
}

export function isWaiterUser(user?: UserRoleInfo | null): boolean {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  const pos = (user.position || '').toLowerCase().trim();
  return (
    role === 'WAITER' ||
    pos.includes('garcom') ||
    pos.includes('garçom') ||
    pos.includes('waiter') ||
    pos.includes('salao') ||
    pos.includes('salão') ||
    pos.includes('atendente')
  );
}

export function isKitchenUser(user?: UserRoleInfo | null): boolean {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  const pos = (user.position || '').toLowerCase().trim();
  return (
    role === 'COOK' ||
    role === 'KITCHEN' ||
    role === 'CHEF' ||
    pos.includes('cozinh') ||
    pos.includes('cook') ||
    pos.includes('chef') ||
    pos.includes('chapeiro') ||
    pos.includes('chapista') ||
    pos.includes('pizzaiolo')
  );
}

/** Limpeza/serviços gerais: cargo próprio ou acúmulo via tags. */
export function hasCleaningDuty(user?: UserRoleInfo | null): boolean {
  if (!user) return false;
  if ((user.role || '').toUpperCase() === 'CLEANING') return true;
  return userTags(user).includes('CLEANING');
}

/** Só-limpeza: cargo é CLEANING (menu mínimo de rotinas). */
export function isCleaningOnlyUser(user?: UserRoleInfo | null): boolean {
  if (!user) return false;
  return (user.role || '').toUpperCase() === 'CLEANING';
}

export function isCashierUser(user?: UserRoleInfo | null): boolean {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  const pos = (user.position || '').toLowerCase().trim();
  return (
    role === 'CASHIER' ||
    pos.includes('caixa') ||
    pos.includes('pdv') ||
    pos.includes('cashier')
  );
}

export function isAdminUser(user?: UserRoleInfo | null): boolean {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  const pos = (user.position || '').toLowerCase().trim();
  return (
    role === 'SUPER_ADMIN' ||
    role === 'TENANT_ADMIN' ||
    role === 'TENANT_OWNER' ||
    pos.includes('admin') ||
    pos.includes('gerente') ||
    pos.includes('dono')
  );
}

export function resolvePortalDestination(
  user?: UserRoleInfo | null,
  redirectTo?: string | null,
  base: string = '/app',
): string {
  if (!user) return `${base}/dashboard`;
  const role = (user.role || '').toUpperCase();

  if (role === 'SUPER_ADMIN') {
    return redirectTo && !redirectTo.startsWith('/app') ? redirectTo : '/dashboard';
  }

  if (isWaiterUser(user)) {
    return `${base}/tables`;
  }

  if (isKitchenUser(user)) {
    return `${base}/kds`;
  }

  if (isCleaningOnlyUser(user)) {
    return `${base}/tasks`;
  }

  if (isCashierUser(user)) {
    return `${base}/pos`;
  }

  return `${base}/dashboard`;
}
