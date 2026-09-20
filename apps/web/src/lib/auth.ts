export const SESSION_STORAGE_KEY = 'saas_admin_session';
export const TOKEN_STORAGE_KEY = 'saas_admin_token';

export interface StoredAdminSession {
  user: { id: string; name: string; email: string; role: string };
}

export function saveAdminSession(session: StoredAdminSession) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

export function getAdminSession(): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}

export function saveAdminToken(token: string) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {}
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}

export function saveTenantToken(slugOrToken: string, maybeToken?: string) {
  try {
    if (maybeToken) {
      if (slugOrToken) {
        localStorage.setItem(`saas_tenant_token_${slugOrToken}`, maybeToken);
      }
      localStorage.setItem('saas_active_tenant_token', maybeToken);
    } else if (slugOrToken) {
      localStorage.setItem('saas_active_tenant_token', slugOrToken);
    }
  } catch {}
}

export function getTenantToken(slug?: string): string | null {
  try {
    if (slug) {
      const token = localStorage.getItem(`saas_tenant_token_${slug}`);
      if (token) return token;
    }
    return localStorage.getItem('saas_active_tenant_token');
  } catch {
    return null;
  }
}

export function clearTenantToken(slug?: string) {
  try {
    if (slug) {
      localStorage.removeItem(`saas_tenant_token_${slug}`);
    }
    localStorage.removeItem('saas_active_tenant_token');
  } catch {}
}

const VIEWING_SLUG_KEY = 'saas_viewing_slug';

/** Empresa que o Super Admin escolheu visualizar no App (suporte). */
export function setViewingSlug(slug: string) {
  try {
    if (slug) localStorage.setItem(VIEWING_SLUG_KEY, slug.toLowerCase());
  } catch {}
}

export function getViewingSlug(): string | null {
  try {
    return localStorage.getItem(VIEWING_SLUG_KEY);
  } catch {
    return null;
  }
}

export function clearViewingSlug() {
  try {
    localStorage.removeItem(VIEWING_SLUG_KEY);
  } catch {}
}
