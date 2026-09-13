import axios from 'axios';
import {
  getAdminToken,
  getTenantToken,
  saveAdminToken,
  saveTenantToken,
} from './auth';

/**
 * Marca interna usada para impedir que uma requisição já repetida seja
 * renovada em laço. Declarada como aumento de módulo para que o campo seja
 * tipado e não caia em `any` implícito nas configurações do axios.
 */
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    __isRetry?: boolean;
  }
}

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

/** Extrai o slug do tenant a partir da URL (`/tenant-app/<slug>/...`). */
function tenantSlugFromUrl(url?: string): string | undefined {
  const match = url?.match(/\/tenant-app\/([^/]+)/);
  return match ? match[1] : undefined;
}

api.interceptors.request.use((config) => {
  const isTenantReq = config.url?.includes('/tenant-app') || config.url?.includes('/restaurant');
  let token: string | null = null;

  if (isTenantReq) {
    token = getTenantToken(tenantSlugFromUrl(config.url)) || getTenantToken() || getAdminToken();
  } else {
    token = getAdminToken() || getTenantToken();
  }

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Deduplica o refresh: N requisições que expiram ao mesmo tempo não devem
 * disparar N chamadas de rotação de token. Como o backend invalida a família
 * inteira ao detectar reuso de refresh token, várias rotações concorrentes se
 * anulariam mutuamente — a primeira teria sucesso e as demais derrubariam a
 * sessão recém-criada. Uma única promessa compartilhada é repassada a todos.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(slug?: string): Promise<boolean> {
  try {
    if (slug) {
      const res = await api.post(`/tenant-app/${slug}/refresh`, {});
      if (res.data?.accessToken) {
        saveTenantToken(slug, res.data.accessToken);
        return true;
      }
      return false;
    }
    const res = await api.post('/auth/refresh', {});
    if (res.data?.accessToken) {
      saveAdminToken(res.data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function sharedRefresh(slug?: string): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens(slug).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function redirectToLogin(slug?: string) {
  if (pathIsAdminLogin()) return;
  if (slug) {
    window.location.href = `/${slug}/login`;
    return;
  }
  clearAdminSessionSync();
  window.location.href = '/login';
}

function currentPathname(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '';
}

function pathIsAdminLogin(): boolean {
  return currentPathname() === '/login';
}

/** Limpeza síncrona do estado do admin — o import dinâmico é desnecessário aqui. */
function clearAdminSessionSync() {
  try {
    localStorage.removeItem('saas_admin_session');
    localStorage.removeItem('saas_admin_token');
  } catch {}
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status !== 401 || typeof window === 'undefined' || !original) {
      return Promise.reject(error);
    }

    // Não tentar renovar quando a própria chamada de refresh/login falhou:
    // isso geraria um laço infinito de 401s.
    const url: string = original.url || '';
    const isAuthCall =
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/auth/2fa/') ||
      url.includes('/refresh') ||
      url.includes('/login');

    if (!isAuthCall && !original.__isRetry) {
      const slug = tenantSlugFromUrl(url);
      const refreshed = await sharedRefresh(slug);
      if (refreshed) {
        // Repete a requisição original uma única vez, já com o token novo.
        original.__isRetry = true;
        const newToken = slug ? getTenantToken(slug) : getAdminToken();
        if (newToken) original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }

    const parts = currentPathname().split('/').filter(Boolean);
    const isTenantRoute = parts.length >= 2 && ['app', 'login', 'agendar'].includes(parts[1]);

    if (isTenantRoute && parts[1] === 'app') {
      window.location.href = `/${parts[0]}/login`;
    } else if (!pathIsAdminLogin() && !isTenantRoute) {
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);

export async function apiGet<T = any>(url: string, params?: any): Promise<T> {
  const res = await api.get<T>(url, { params });
  return res.data;
}

export async function apiPost<T = any>(url: string, data?: any): Promise<T> {
  const res = await api.post<T>(url, data);
  return res.data;
}

export async function apiPatch<T = any>(url: string, data?: any): Promise<T> {
  const res = await api.patch<T>(url, data);
  return res.data;
}

export async function apiPut<T = any>(url: string, data?: any): Promise<T> {
  const res = await api.put<T>(url, data);
  return res.data;
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const res = await api.delete<T>(url);
  return res.data;
}
