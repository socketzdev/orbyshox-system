import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { PageLoader } from '@/components/ui/page-loader';

interface RequireAuthProps {
  children: React.ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  const parts = location.pathname.split('/').filter(Boolean);
  const firstSegment = parts[0] || '';

  // 1. App Universal do Cliente / Restaurante / Barbearia / Mercado
  // Possui ciclo de autenticação isolado pelo TenantProvider
  const isTenantAppRoute = firstSegment === 'app';

  // 2. Rotas públicas de autoatendimento (QR da mesa, tablet fixo, agendamento)
  const isPublicCustomerRoute =
    firstSegment === 'q' ||
    firstSegment === 'tablet' ||
    (parts.length >= 2 && parts[1] === 'agendar');

  // 3. Rota de login
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage || isTenantAppRoute || isPublicCustomerRoute) {
    return <>{children}</>;
  }

  const adminRoots = new Set([
    'dashboard',
    'tenants',
    'plans',
    'coupons',
    'billing',
    'tickets',
    'knowledge',
    'staff',
    'settings',
    'audit',
    'notifications',
  ]);

  if (parts.length === 1 && !adminRoots.has(firstSegment)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <PageLoader label="Validando sessão de Super Admin..." className="min-h-screen" />;
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // Se o usuário logado NÃO é Super Admin, ele é inquilino/restaurante e deve ser redirecionado para o app
  if (user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
};
