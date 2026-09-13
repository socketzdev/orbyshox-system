import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '@/lib/api';
import { clearTenantToken } from '@/lib/auth';

export type TenantInfo = {
  id: string;
  companyName: string;
  tradeName: string | null;
  slug: string;
  niche: 'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET';
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
};

interface TenantContextType {
  slug: string;
  base: string;
  tenant: TenantInfo | null;
  currentUser: TenantUser | null;
  isLoadingTenant: boolean;
  logout: () => Promise<void>;
  refetchTenant: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const TenantContext = createContext<TenantContextType | null>(null);

const DEFAULT_FEATURES_BY_NICHE: Record<string, string[]> = {
  BARBERSHOP: ['appointments', 'barbers', 'services', 'loyalty', 'pos', 'finance', 'stock', 'automations'],
  RESTAURANT: ['tables', 'kds', 'recipes', 'reservations', 'pos', 'finance', 'stock', 'automations'],
  SUPERMARKET: ['pos_fast', 'stock_batches', 'xml_import', 'promotions', 'pos', 'finance', 'stock', 'automations'],
};

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { slug: urlSlug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<TenantUser | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);

  const slug = urlSlug || tenant?.slug || '';
  const base = urlSlug ? `/${urlSlug}/app` : '/app';

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
            : DEFAULT_FEATURES_BY_NICHE[niche] || DEFAULT_FEATURES_BY_NICHE.RESTAURANT,
        });
      } else {
        // Modo App Universal (sem slug na URL)
        const me = await apiGet<any>('/tenant-app/auth/me');
        if (me?.user) setCurrentUser(me.user);
        if (me?.tenant) {
          const niche = me.tenant.niche || 'RESTAURANT';
          setTenant({
            ...me.tenant,
            company: me.company,
            features: DEFAULT_FEATURES_BY_NICHE[niche] || DEFAULT_FEATURES_BY_NICHE.RESTAURANT,
            status: me.tenant.status || 'ACTIVE',
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
        if (me?.tenant) {
          const niche = me.tenant.niche || 'RESTAURANT';
          setTenant((prev) =>
            prev
              ? { ...prev, ...me.tenant, company: me.company }
              : { ...me.tenant, company: me.company, features: DEFAULT_FEATURES_BY_NICHE[niche], status: 'ACTIVE' },
          );
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
    setCurrentUser(null);
    setTenant(null);
    if (urlSlug) {
      navigate(`/${urlSlug}/login`);
    } else {
      navigate('/app/login');
    }
  };

  return (
    <TenantContext.Provider
      value={{
        slug,
        base,
        tenant,
        currentUser,
        isLoadingTenant,
        logout,
        refetchTenant: fetchTenantInfo,
        refreshSession,
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
