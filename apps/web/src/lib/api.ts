import axios from 'axios';
import {
  getAdminToken,
  getTenantToken,
  getViewingSlug,
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
  if (!match) return undefined;
  // `auth` é o segmento das rotas universais (/tenant-app/auth/me), não um slug.
  if (match[1] === 'auth') return undefined;
  return match[1];
}

api.interceptors.request.use((config) => {
  const isTenantReq = config.url?.includes('/tenant-app') || config.url?.includes('/restaurant') || config.url?.includes('/tasks');
  let token: string | null = null;

  if (isTenantReq) {
    token = getTenantToken(tenantSlugFromUrl(config.url)) || getTenantToken() || getAdminToken();
  } else {
    token = getAdminToken() || getTenantToken();
  }

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Suporte do Super Admin: avisa o backend qual empresa está visualizada
  // para as rotas que isolam pela empresa do token (ex.: /restaurant/*).
  // Sem o papel de Super Admin o backend ignora o cabeçalho.
  if (isTenantReq) {
    const viewing = getViewingSlug();
    if (viewing) config.headers['X-Viewing-Slug'] = viewing;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST com retentativa SÓ em falha de rede (sem resposta: VPN caiu, timeout).
 * Erro com resposta (401/403/429/500) NÃO retenta: 401 no refresh significa
 * credencial inválida e insistir só piora (throttle, revogação).
 */
async function postWithNetworkRetry(url: string, data?: any, attempts = 3): Promise<any> {
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await api.post(url, data);
    } catch (err: any) {
      lastError = err;
      if (err?.response) throw err;
      if (i < attempts - 1) await sleep(1200 * (i + 1));
    }
  }
  throw lastError;
}

async function refreshTokens(slug?: string): Promise<boolean> {
  // Salva nos DOIS slots: o cabeçalho usa `getTenantToken() || getAdminToken()`
  // (ou o inverso), então deixar um slot velho gera 401 eterno + rotação sem
  // fim a cada requisição — que esbarra no throttle e desloga.
  const persist = (token: string) => {
    if (slug) saveTenantToken(slug, token);
    saveTenantToken(token);
    saveAdminToken(token);
  };

  // 1. Se slug específico estiver disponível, tenta refresh do slug
  if (slug) {
    try {
      const res = await postWithNetworkRetry(`/tenant-app/${slug}/refresh`, {});
      if (res.data?.accessToken) {
        persist(res.data.accessToken);
        return true;
      }
    } catch {}
  }

  // 2. Tenta refresh universal de tenant (/app, /restaurant, etc.)
  try {
    const res = await postWithNetworkRetry('/tenant-app/auth/refresh', {});
    if (res.data?.accessToken) {
      persist(res.data.accessToken);
      return true;
    }
  } catch {}

  // 3. Fallback para superadmin
  try {
    const res = await postWithNetworkRetry('/auth/refresh', {});
    if (res.data?.accessToken) {
      saveAdminToken(res.data.accessToken);
      saveTenantToken(res.data.accessToken);
      return true;
    }
  } catch {}

  return false;
}

function sharedRefresh(slug?: string): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens(slug).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function currentPathname(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '';
}

function pathIsLogin(): boolean {
  const p = currentPathname();
  return p === '/login' || p === '/app/login' || p.endsWith('/login');
}

function pathIsAdminLogin(): boolean {
  return currentPathname() === '/login';
}

function redirectToLogin(slug?: string) {
  if (pathIsLogin()) return;
  if (slug) {
    window.location.href = `/${slug}/login`;
    return;
  }
  const pathname = currentPathname();
  if (pathname.startsWith('/app')) {
    window.location.href = '/app/login';
    return;
  }
  clearAdminSessionSync();
  window.location.href = '/login';
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
        const newToken = slug
          ? (getTenantToken(slug) || getTenantToken())
          : (getTenantToken() || getAdminToken());
        if (newToken) original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }

    const pathname = currentPathname();
    const parts = pathname.split('/').filter(Boolean);
    const isLoginPage = pathIsLogin();

    if (!isLoginPage) {
      if (pathname.startsWith('/app')) {
        window.location.href = '/app/login';
      } else if (parts.length >= 2 && ['app', 'agendar'].includes(parts[1])) {
        window.location.href = `/${parts[0]}/login`;
      } else if (!pathIsAdminLogin()) {
        redirectToLogin();
      }
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

export async function apiDelete<T = any>(url: string, config?: { data?: any; params?: any }): Promise<T> {
  const res = await api.delete<T>(url, config);
  return res.data;
}
