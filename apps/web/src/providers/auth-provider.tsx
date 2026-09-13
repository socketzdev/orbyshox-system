import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  saveAdminSession,
  clearAdminSession,
  getAdminSession,
  saveAdminToken,
  clearAdminToken,
} from '../lib/auth';

type User = { id: string; name: string; email: string; role: string };
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getAdminSession()?.user || null);
  const [isLoading, setIsLoading] = useState(() => !getAdminSession()?.user);

  useEffect(() => {
    const stored = getAdminSession();
    if (stored?.user) {
      setUser(stored.user);
      api.get('/auth/me')
        .then((res) => {
          if (res.data) {
            saveAdminSession({ user: res.data });
            setUser(res.data);
          }
        })
        .catch(() => {
          clearAdminSession();
          clearAdminToken();
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (token: string, u: User) => {
    saveAdminToken(token);
    saveAdminSession({ user: u });
    setUser(u);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearAdminSession();
    clearAdminToken();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data) {
        saveAdminSession({ user: res.data });
        setUser(res.data);
      }
    } catch {}
  };

  // Memoizado: sem isto, cada render do provider cria um value novo e
  // re-renderiza TODOS os consumidores do contexto de autenticação.
  const value = useMemo(
    () => ({ user, isLoading, login, logout, refreshUser }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
};
