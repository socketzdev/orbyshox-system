import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/providers/theme-provider';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// ─── 1. Emblema Geométrico de 4 Quadrantes (Logo) ─────────────────────────────
export const QuadrantLogo: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <div className={`${className} relative rounded-full overflow-hidden flex items-center justify-center shrink-0 cursor-pointer shadow-sm hover:opacity-90 transition-opacity`}>
    <svg className="w-full h-full" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="17.25" stroke="#1f242d" strokeWidth="1.5" />
      <path d="M17 2.5C9.54 2.5 3.5 8.54 3.5 16H17V2.5Z" fill="url(#admin_quad_tl)" />
      <path d="M19 2.5V16H32.5C32.5 8.54 26.46 2.5 19 2.5Z" fill="url(#admin_quad_tr)" />
      <path d="M17 19H3.5C3.5 26.46 9.54 32.5 17 32.5V19Z" fill="url(#admin_quad_bl)" />
      <path d="M19 19V32.5C26.46 32.5 32.5 26.46 32.5 19H19Z" fill="url(#admin_quad_br)" />
      <line x1="18" y1="2" x2="18" y2="34" stroke="#e8ecef" strokeWidth="1.5" />
      <line x1="2" y1="18" x2="34" y2="18" stroke="#e8ecef" strokeWidth="1.5" />
      <defs>
        <linearGradient id="admin_quad_tl" x1="4" y1="3" x2="17" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#696e79" />
          <stop offset="1" stopColor="#323740" />
        </linearGradient>
        <linearGradient id="admin_quad_tr" x1="19" y1="3" x2="32" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#434852" />
          <stop offset="1" stopColor="#1e2229" />
        </linearGradient>
        <linearGradient id="admin_quad_bl" x1="4" y1="19" x2="17" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#434852" />
          <stop offset="1" stopColor="#1a1d24" />
        </linearGradient>
        <linearGradient id="admin_quad_br" x1="19" y1="19" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2c3038" />
          <stop offset="1" stopColor="#0f1115" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

// ─── 2. Ícones de Linha Minimalistas ──────────────────────────────────────────
const IconDashboard: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <circle cx="4" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="14" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="4" cy="14" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="14" cy="14" r="2.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const IconTenants: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <rect x="2.5" y="2.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 6.5H7.5M10.5 6.5H12M6 9.5H7.5M10.5 9.5H12M7.5 15.5V12.5H10.5V15.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const IconCommercial: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <rect x="2" y="4" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.5 8.5H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconFinance: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <rect x="2" y="2.5" width="14" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4.5 11.5L7.5 8.5L10 11L13.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 6.5H13.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSupport: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.5 15C3.5 12.2 6 11 9 11C12 11 14.5 12.2 14.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IconSettings: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <path
      d="M9 1.8L10.9 3.5L13.4 3.1L14.4 5.3L16.8 6.4L16.5 8.9L17.8 11L16.2 13L16.1 15.5L13.6 15.8L12.1 17.7L9.7 16.9L7.3 17.7L5.8 15.8L3.3 15.5L3.2 13L1.6 11L2.9 8.9L2.6 6.4L5 5.3L6 3.1L8.5 3.5L9 1.8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const STORAGE_KEY = 'orbyshox_sidebar_groups';

  const [openGroups, setOpenGroups] = useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      tenants: true,
      commercial: false,
      finance: true,
      support: false,
      settings: false,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups));
    } catch {}
  }, [openGroups]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Sessão encerrada');
    navigate('/login');
  };

  const { data: alerts = [] } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => apiGet<any[]>('/dashboard/alerts'),
    refetchInterval: 30000,
  });

  const ticketAlert = alerts.find((a: any) => a.type === 'ticket_overdue');
  const paymentAlert = alerts.find((a: any) => a.type === 'payment_failed');

  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/';

  return (
    <aside aria-label="Navegação principal" className="w-[260px] h-screen p-6 lg:p-7 flex flex-col justify-between shrink-0 select-none bg-zinc-50 dark:bg-zinc-900/60 font-sans border-r border-zinc-200/70 dark:border-zinc-800">
      <div className="overflow-y-auto pr-1 scrollbar-none">
        {/* ─── Logo do Topo com Orbyshox ─── */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QuadrantLogo className="w-10 h-10" />
            <div>
              <span className="font-bold text-sm text-zinc-900 tracking-tight block">
                Orbyshox
              </span>
              <span className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase block">
                Super Admin
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Menu da conta${user?.name ? ` de ${user.name}` : ''}`}
                className="w-7 h-7 rounded-xl bg-white/70 hover:bg-white dark:bg-zinc-800/70 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition shadow-2xs"
              >
                <span className="text-xs font-bold">
                  {user?.name ? user.name[0].toUpperCase() : 'A'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-white dark:bg-zinc-900 rounded-2xl p-1 shadow-elevated border-zinc-200 dark:border-zinc-800">
              <DropdownMenuLabel className="px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                {user?.name || 'Administrador'}
                <span className="block text-[10px] text-zinc-400 font-normal">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-800" />
              <DropdownMenuItem onSelect={() => setLogoutConfirmOpen(true)} className="text-xs cursor-pointer rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Sair do Sistema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ─── Navegação em Português com Estilo Exato da Imagem ─── */}
        <nav className="space-y-1">
          {/* 1. Dashboard */}
          <NavLink
            to="/dashboard"
            data-tour="dashboard"
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-[14px] font-medium transition-all ${
              isDashboard
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-zinc-800/50'
            }`}
          >
            <IconDashboard className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          {/* 2. Clientes & Empresas (Tree com Linha Curvada) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleGroup('tenants')}
              aria-expanded={!!openGroups.tenants}
              aria-controls="sidebar-group-tenants"
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[14px] font-medium text-zinc-900 dark:text-zinc-100 transition-all hover:bg-white/50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3.5">
                <IconTenants className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Clientes & SaaS</span>
              </div>
              {openGroups.tenants ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {openGroups.tenants && (
              <div id="sidebar-group-tenants" className="relative pl-6 space-y-1.5 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-4 w-[1.5px] bg-zinc-300 dark:bg-zinc-700" />

                {/* Sub-item: Empresas */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/tenants"
                    end
                    data-tour="clientes"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Empresas</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* 3. Comercial (Planos & Cupons) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleGroup('commercial')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[14px] font-medium text-zinc-900 dark:text-zinc-100 transition-all hover:bg-white/50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3.5">
                <IconCommercial className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Comercial</span>
              </div>
              {openGroups.commercial ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {openGroups.commercial && (
              <div className="relative pl-6 space-y-1.5 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-4 w-[1.5px] bg-zinc-300 dark:bg-zinc-700" />

                {/* Planos & Preços */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/plans"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Planos & Preços</span>
                  </NavLink>
                </div>

                {/* Cupons de Desconto */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/coupons"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Cupons de Desconto</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* 4. Financeiro (Faturas, Inadimplência, Projeção) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleGroup('finance')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[14px] font-medium text-zinc-900 dark:text-zinc-100 transition-all hover:bg-white/50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3.5">
                <IconFinance className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Financeiro</span>
              </div>
              {openGroups.finance ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {openGroups.finance && (
              <div className="relative pl-6 space-y-1.5 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-4 w-[1.5px] bg-zinc-300 dark:bg-zinc-700" />

                {/* Visão Geral */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/billing"
                    end
                    data-tour="financeiro"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Visão Geral</span>
                  </NavLink>
                </div>

                {/* Faturas & Cobranças */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/billing/invoices"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Faturas & Cobranças</span>
                  </NavLink>
                </div>

                {/* Inadimplência (com badge pastel laranja se houver alertas) */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/billing/delinquency"
                    className={({ isActive }) =>
                      `w-full flex items-center justify-between px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Inadimplência</span>
                    {paymentAlert?.count ? (
                      <span className="bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 font-bold text-xs rounded-xl px-2 py-0.5 leading-none shadow-2xs">
                        {paymentAlert.count}
                      </span>
                    ) : null}
                  </NavLink>
                </div>

                {/* Projeção MRR */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/billing/projection"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Projeção MRR</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* 5. Operações & Suporte */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleGroup('support')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[14px] font-medium text-zinc-900 dark:text-zinc-100 transition-all hover:bg-white/50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3.5">
                <IconSupport className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Suporte & Equipe</span>
              </div>
              {openGroups.support ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {openGroups.support && (
              <div className="relative pl-6 space-y-1.5 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-4 w-[1.5px] bg-zinc-300 dark:bg-zinc-700" />

                {/* Chamados & Tickets */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/tickets"
                    data-tour="suporte"
                    className={({ isActive }) =>
                      `w-full flex items-center justify-between px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Chamados & Tickets</span>
                    {ticketAlert?.count ? (
                      <span className="bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 font-bold text-xs rounded-xl px-2 py-0.5 leading-none shadow-2xs">
                        {ticketAlert.count}
                      </span>
                    ) : null}
                  </NavLink>
                </div>

                {/* Base de Conhecimento */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/knowledge"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Base de Conhecimento</span>
                  </NavLink>
                </div>

                {/* Equipe Interna */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/staff"
                    data-tour="equipe"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Equipe Interna</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* 6. Sistema & Configurações */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleGroup('settings')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[14px] font-medium text-zinc-900 dark:text-zinc-100 transition-all hover:bg-white/50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3.5">
                <IconSettings className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Configurações</span>
              </div>
              {openGroups.settings ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {openGroups.settings && (
              <div className="relative pl-6 space-y-1.5 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-4 w-[1.5px] bg-zinc-300 dark:bg-zinc-700" />

                {/* Configurações Globais */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/settings"
                    data-tour="configuracoes"
                    end
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Geral</span>
                  </NavLink>
                </div>

                {/* Régua de Cobrança */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/settings/delinquency"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Régua de Cobrança</span>
                  </NavLink>
                </div>

                {/* Régua de Trial */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/settings/trial"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Régua de Trial</span>
                  </NavLink>
                </div>

                {/* Templates de E-mail */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/settings/email-templates"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Templates de E-mail</span>
                  </NavLink>
                </div>

                {/* Integrações */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/settings/integrations"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Integrações</span>
                  </NavLink>
                </div>

                {/* Logs de Auditoria */}
                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[19px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-zinc-300 dark:border-zinc-700 rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to="/audit"
                    className={({ isActive }) =>
                      `w-full flex items-center px-4 py-2 rounded-2xl text-[13px] transition-all ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60 dark:hover:bg-zinc-800/60 font-medium'
                      }`
                    }
                  >
                    <span>Logs de Auditoria</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* ─── Controles Flutuantes da Imagem de Referência (Chat, Moon, Sun) ─── */}
      <div className="pt-4 border-t border-zinc-200/50 dark:border-zinc-800 space-y-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 w-fit shadow-2xs">
          <button
            type="button"
            onClick={() => window.open('https://wa.me/5511999999999', '_blank')}
            title="Suporte & Ajuda"
            aria-label="Abrir suporte pelo WhatsApp"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            title="Modo Escuro"
            aria-label="Ativar modo escuro"
            aria-pressed={theme === 'dark'}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
              theme === 'dark' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setTheme('light')}
            title="Modo Claro"
            aria-label="Ativar modo claro"
            aria-pressed={theme === 'light'}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
              theme === 'light' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title="Encerrar sessão?"
        description="Você precisará informar suas credenciais e o código de dois fatores para entrar novamente."
        confirmLabel="Sair do sistema"
        cancelLabel="Continuar conectado"
        tone="destructive"
        onConfirm={handleLogout}
      />
    </aside>
  );
}
