import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '@/lib/api';
import { clearTenantToken, getViewingSlug, clearViewingSlug } from '@/lib/auth';
import { BARBERSHOP_TEMPLATES } from '@projeto-saas/shared-types';
import { isWaiterUser, isKitchenUser, isAdminUser, isCleaningOnlyUser, isCashierUser, hasCleaningDuty as userHasCleaningDuty } from '@/lib/role-routing';

export type TenantInfo = {
  id: string;
  companyName: string;
  tradeName: string | null;
  slug: string;
  niche: 'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET' | 'UNIVERSAL';
  features: string[];
  status: string;
  company?: {
    id: string;
    name: string;
    category?: string;
    branding?: any;
  } | null;
  site?: {
    theme: any;
    templateKey: string;
  } | null;
};

export type TenantUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  position?: string | null;
  tags?: string | string[] | null;
  phone?: string | null;
};

/**
 * Permissões que a interface consulta para decidir o que mostrar.
 *
 * Vêm PRONTAS do backend (`buildAbilities` no TenantAppService), resolvidas a
 * partir do `CaslAbilityFactory`. Não é uma segunda matriz: é o resultado da
 * matriz, para o front não precisar duplicar regra de negócio — duplicar faria
 * as duas pontas divergirem.
 *
 * `false` é o padrão: se algo falhar no meio do caminho, a interface esconde o
 * botão em vez de mostrá-lo.
 */
export type TenantAbilities = {
  canReadFinance: boolean;
  canReadBillsPayable: boolean;
  canReadBillsReceivable: boolean;
  canUpdateBillsPayable: boolean;
  canDeleteBillPayable: boolean;
  canDeleteBillReceivable: boolean;
  canReadEmployees: boolean;
  canManageEmployees: boolean;
  canReadStockBatch: boolean;
  canUpdateStockBatch: boolean;
  canDeleteStockBatch: boolean;
  canReadStockMovement: boolean;
  canReadCashRegister: boolean;
  canReadSupplier: boolean;
  canUpdateSupplier: boolean;
  canDeleteSupplier: boolean;
  canReadNfe: boolean;
  canCreateNfe: boolean;
  canFinalizeNfe: boolean;
  canReadStoreSettings: boolean;
  canUpdateStoreSettings: boolean;
  canApproveOrder: boolean;
  canManageTable: boolean;
  canDeleteTable: boolean;
  canManageTips: boolean;
  // Módulos (menu dinâmico + bloqueio de rota; o backend decide de verdade).
  canViewTables: boolean;
  canViewKds: boolean;
  canViewPos: boolean;
  canViewPurchaseNotes: boolean;
  canViewTasks: boolean;
  canViewReports: boolean;
  canViewFinance: boolean;
  canViewTeam: boolean;
  canViewSettings: boolean;
};

const DENY_ALL: TenantAbilities = {
  canReadFinance: false,
  canReadBillsPayable: false,
  canReadBillsReceivable: false,
  canUpdateBillsPayable: false,
  canDeleteBillPayable: false,
  canDeleteBillReceivable: false,
  canReadEmployees: false,
  canManageEmployees: false,
  canReadStockBatch: false,
  canUpdateStockBatch: false,
  canDeleteStockBatch: false,
  canReadStockMovement: false,
  canReadCashRegister: false,
  canReadSupplier: false,
  canUpdateSupplier: false,
  canDeleteSupplier: false,
  canReadNfe: false,
  canCreateNfe: false,
  canFinalizeNfe: false,
  canReadStoreSettings: false,
  canUpdateStoreSettings: false,
  canApproveOrder: false,
  canManageTable: false,
  canDeleteTable: false,
  canManageTips: false,
  canViewTables: false,
  canViewKds: false,
  canViewPos: false,
  canViewPurchaseNotes: false,
  canViewTasks: false,
  canViewReports: false,
  canViewFinance: false,
  canViewTeam: false,
  canViewSettings: false,
};

interface TenantContextType {
  slug: string;
  base: string;
  tenant: TenantInfo | null;
  currentUser: TenantUser | null;
  abilities: TenantAbilities;
  isLoadingTenant: boolean;
  logout: () => Promise<void>;
  refetchTenant: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  /** Slug que o Super Admin escolheu visualizar (suporte). Null = empresa do usuário. */
  viewingSlug: string | null;
  /** True quando visualizando empresa diferente da do usuário (Super Admin). */
  isImpersonating: boolean;
  /** Sai da empresa visualizada e volta para a empresa do usuário. */
  exitImpersonation: () => void;
  isWaiter: boolean;
  isKitchen: boolean;
  isAdmin: boolean;
  isCleaning: boolean;
  isCashier: boolean;
  hasCleaningDuty: boolean;
}

const TenantContext = createContext<TenantContextType | null>(null);

const DEFAULT_FEATURES_BY_NICHE: Record<string, string[]> = {
  BARBERSHOP: ['appointments', 'barbers', 'services', 'loyalty', 'pos', 'finance', 'stock', 'automations'],
  RESTAURANT: ['tables', 'kds', 'recipes', 'reservations', 'pos', 'finance', 'stock', 'automations'],
  SUPERMARKET: ['pos_fast', 'stock_batches', 'xml_import', 'promotions', 'pos', 'finance', 'stock', 'automations'],
  // Template Universal: serve qualquer empresa — PDV, produtos, estoque,
  // clientes, financeiro, relatórios, equipe e loja online.
  UNIVERSAL: ['pos', 'products', 'stock', 'stock_batches', 'customers', 'finance', 'reports', 'team', 'settings', 'automations', 'promotions'],
};

/**
 * Módulos do tenant: nicho primeiro; na barbearia, o sub-template
 * (categoria da Company) escolhe o pacote — exceto BARBEARIA, que mantém o
 * template nativo intocado.
 */
function featuresForTenant(niche: string, company?: any): string[] {
  if (niche === 'BARBERSHOP') {
    const key = String(company?.category || '').toUpperCase();
    const tpl = (BARBERSHOP_TEMPLATES as Record<string, { features: string[] }>)[key];
    if (tpl && key !== 'BARBEARIA') return tpl.features;
  }
  return DEFAULT_FEATURES_BY_NICHE[niche] || DEFAULT_FEATURES_BY_NICHE.BARBERSHOP;
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { slug: urlSlug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<TenantUser | null>(null);
  const [abilities, setAbilities] = useState<TenantAbilities>(DENY_ALL);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [homeSlug, setHomeSlug] = useState<string | null>(null);
  const [viewingSlug, setViewingSlugState] = useState<string | null>(null);

  const slug = urlSlug || tenant?.slug || '';
  const base = '/app';

  const fetchTenantInfo = useCallback(async () => {
    setIsLoadingTenant(true);
    try {
      if (urlSlug) {
        const data = await apiGet<any>(`/tenant-app/${urlSlug}/public-info`);
        if (!data || data.status === 'SUSPENDED' || data.status === 'CANCELED') {
          setTenant(null);
          return;
        }
        const niche = data.niche || 'RESTAURANT';
        setTenant({
          ...data,
          features: Array.isArray(data.features) && data.features.length > 0
            ? data.features
            : featuresForTenant(niche, (data as any).company),
        });
      } else {
        // Modo App Universal (sem slug na URL)
        const me = await apiGet<any>('/tenant-app/auth/me');
        if (me?.user) setCurrentUser(me.user);
        const slugHome = me?.tenant?.slug ? String(me.tenant.slug).toLowerCase() : null;
        setHomeSlug(slugHome);
        // Super Admin pode visualizar outra empresa (suporte): resolve o
        // tenant alvo em vez do tenant do usuário.
        let view = me;
        let viewing: string | null = null;
        const wanted = getViewingSlug();
        if (me?.user?.role === 'SUPER_ADMIN' && wanted && slugHome && wanted !== slugHome) {
          try {
            const target = await apiGet<any>(`/tenant-app/${wanted}/me`);
            if (target?.tenant) {
              view = { ...target, user: me.user };
              viewing = wanted;
            } else {
              clearViewingSlug();
            }
          } catch {
            clearViewingSlug();
          }
        }
        setViewingSlugState(viewing);
        setAbilities({ ...DENY_ALL, ...(view?.abilities || {}) });
        if (view?.tenant) {
          const niche = view.tenant.niche || 'RESTAURANT';
          setTenant({
            ...view.tenant,
            company: view.company,
            features: featuresForTenant(niche, view.company),
            status: view.tenant.status || 'ACTIVE',
          });
        } else {
          setTenant(null);
          navigate('/app/login');
        }
      }
    } catch {
      setTenant(null);
      if (!urlSlug) {
        navigate('/app/login');
      }
    } finally {
      setIsLoadingTenant(false);
    }
  }, [urlSlug, navigate]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      if (urlSlug) {
        const me = await apiGet<any>(`/tenant-app/${urlSlug}/me`);
        if (me?.user) setCurrentUser(me.user);
        setAbilities({ ...DENY_ALL, ...(me?.abilities || {}) });
        if (me?.tenant) {
          const niche = me.tenant.niche || 'RESTAURANT';
          setTenant((prev) =>
            prev
              ? { ...prev, ...me.tenant, company: me.company }
              : { ...me.tenant, company: me.company, features: DEFAULT_FEATURES_BY_NICHE[niche], status: 'ACTIVE' },
          );
        }
        return true;
      } else {
        const me = await apiGet<any>('/tenant-app/auth/me');
        if (me?.user) setCurrentUser(me.user);
        const slugHome = me?.tenant?.slug ? String(me.tenant.slug).toLowerCase() : null;
        setHomeSlug(slugHome);
        let view = me;
        let viewing: string | null = null;
        const wanted = getViewingSlug();
        if (me?.user?.role === 'SUPER_ADMIN' && wanted && slugHome && wanted !== slugHome) {
          try {
            const target = await apiGet<any>(`/tenant-app/${wanted}/me`);
            if (target?.tenant) {
              view = { ...target, user: me.user };
              viewing = wanted;
            } else {
              clearViewingSlug();
            }
          } catch {
            clearViewingSlug();
          }
        }
        setViewingSlugState(viewing);
        setAbilities({ ...DENY_ALL, ...(view?.abilities || {}) });
        if (view?.tenant) {
          const niche = view.tenant.niche || 'RESTAURANT';
          const features = featuresForTenant(niche, view.company);
          setTenant({
            ...view.tenant,
            company: view.company,
            features,
            status: view.tenant.status || 'ACTIVE',
          });
        }
        return true;
      }
    } catch {
      return false;
    }
  }, [urlSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchTenantInfo();
      if (cancelled) return;
      await refreshSession();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTenantInfo, refreshSession]);

  const logout = async () => {
    try {
      if (urlSlug) {
        await apiPost(`/tenant-app/${urlSlug}/logout`);
      } else {
        await apiPost('/tenant-app/auth/logout');
      }
    } catch {}
    clearTenantToken(slug);
    clearViewingSlug();
    setViewingSlugState(null);
    setHomeSlug(null);
    setCurrentUser(null);
    setTenant(null);
    if (urlSlug) {
      navigate(`/${urlSlug}/login`);
    } else {
      navigate('/app/login');
    }
  };

  const { isWaiter, isKitchen, isAdmin, isCleaning, isCashier, hasCleaningDuty } = React.useMemo(() => {
    if (!currentUser)
      return { isWaiter: false, isKitchen: false, isAdmin: false, isCleaning: false, isCashier: false, hasCleaningDuty: false };
    const waiter = isWaiterUser(currentUser);
    const kitchen = isKitchenUser(currentUser);
    const cleaning = isCleaningOnlyUser(currentUser);
    const cashier = !waiter && !kitchen && !cleaning && isCashierUser(currentUser);
    const admin = isAdminUser(currentUser);

    return {
      isWaiter: waiter,
      isKitchen: kitchen,
      // Limpeza e caixa têm menus próprios e NÃO caem no menu administrativo.
      isAdmin: admin || (!waiter && !kitchen && !cleaning && !cashier),
      isCleaning: cleaning,
      isCashier: cashier,
      hasCleaningDuty: userHasCleaningDuty(currentUser),
    };
  }, [currentUser]);

  const exitImpersonation = useCallback(() => {
    clearViewingSlug();
    setViewingSlugState(null);
    fetchTenantInfo();
  }, [fetchTenantInfo]);

  return (
    <TenantContext.Provider
      value={{
        slug,
        base,
        tenant,
        currentUser,
        abilities,
        isLoadingTenant,
        logout,
        refetchTenant: fetchTenantInfo,
        refreshSession,
        viewingSlug,
        isImpersonating: Boolean(viewingSlug && homeSlug && viewingSlug !== homeSlug),
        exitImpersonation,
        isWaiter,
        isKitchen,
        isAdmin,
        isCleaning,
        isCashier,
        hasCleaningDuty,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
