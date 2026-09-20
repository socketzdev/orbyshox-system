import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { NotificationCenter } from './notification-center';
import { useSearch } from '@/providers/search-provider';
import { Avatar, AvatarFallback, AvatarImage, AvatarIndicator } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LogOut, User, Search, ShieldCheck, ChevronRight, Terminal, Menu } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useSidebar } from '@/providers/sidebar-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

/** Rótulo do atalho de busca conforme a plataforma (macOS usa ⌘, demais usam Ctrl). */
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K';

const ROUTE_NAMES: Record<string, { parent?: string; title: string }> = {  '/dashboard': { title: 'Dashboard' },
  '/tenants': { title: 'Empresas' },
  '/billing': { parent: 'Financeiro', title: 'Visão Geral Financeira' },
  '/billing/invoices': { parent: 'Financeiro', title: 'Faturas & Cobranças' },
  '/billing/delinquency': { parent: 'Financeiro', title: 'Controle de Inadimplência' },
  '/billing/projection': { parent: 'Financeiro', title: 'Projeção de Receita (MRR)' },
  '/tickets': { parent: 'Operações', title: 'Central de Chamados' },
  '/knowledge': { parent: 'Operações', title: 'Base de Conhecimento' },
  '/staff': { parent: 'Operações', title: 'Equipe Interna' },
  '/settings': { parent: 'Sistema', title: 'Configurações Globais' },
  '/settings/delinquency': { parent: 'Sistema', title: 'Régua de Inadimplência' },
  '/settings/trial': { parent: 'Sistema', title: 'Período de Trial & Onboarding' },
  '/settings/email-templates': { parent: 'Sistema', title: 'Templates de E-mail' },
  '/settings/integrations': { parent: 'Sistema', title: 'Integrações' },
  '/audit': { parent: 'Sistema', title: 'Logs de Auditoria' },
  '/notifications': { parent: 'Sistema', title: 'Central de Notificações' },
};

export function Header() {
  const { user, logout } = useAuth();
  const { toggleMobile } = useSidebar();
  const location = useLocation();
  const { openSearch } = useSearch();

  const currentRoute =
    ROUTE_NAMES[location.pathname] ||
     (location.pathname.startsWith('/tenants/') ? { title: 'Empresas' } :
      location.pathname.startsWith('/tickets/') ? { parent: 'Operações', title: 'Central de Chamados' } :
     location.pathname.startsWith('/knowledge/') ? { parent: 'Operações', title: 'Base de Conhecimento' } :
     location.pathname.startsWith('/staff/') ? { parent: 'Operações', title: 'Equipe Interna' } :
     {
       title: location.pathname.replace('/', '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Painel',
     });

  return (
    <header className="h-14 sm:h-16 flex items-center justify-between pb-2 sm:pb-3 w-full select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMobile}
          className="md:hidden p-1.5 h-9 w-9 text-zinc-700 hover:bg-white rounded-xl shrink-0"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-[#111827] truncate font-sans">
          {currentRoute.title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openSearch}
          aria-label="Abrir busca global"
          aria-keyshortcuts="Control+K"
          className="relative hidden md:flex items-center w-64 lg:w-80 cursor-pointer group"
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 pointer-events-none group-hover:text-foreground transition-colors" />
          <div className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-12 text-sm text-muted-foreground group-hover:bg-secondary group-hover:border-foreground/15 transition-all flex items-center">
            Buscar clientes, tickets, faturas…
          </div>
          <div className="absolute right-2 flex items-center gap-1 pointer-events-none">
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground leading-none">
              {SHORTCUT_LABEL}
            </kbd>
          </div>
        </button>

        <NotificationCenter />

        <div className="h-5 w-px bg-border hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Menu da conta${user?.name ? ` de ${user.name}` : ''}`}
              className="relative h-9 w-9 rounded-full p-0 border border-zinc-200/80 hover:bg-zinc-100 shadow-2xs"
            >
              <Avatar size="sm" shape="circle">
                <AvatarImage src={undefined} alt={user?.name || 'Admin'} />
                <AvatarFallback className="bg-gradient-to-br from-zinc-800 to-zinc-950 text-white text-xs font-bold">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AD'}
                </AvatarFallback>
              </Avatar>
              <AvatarIndicator status="online" pulse position="bottom-right" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-sm font-semibold text-foreground">{user?.name || 'Administrador'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {user?.email || 'admin@orbyshox.com'}
              </p>
              <div className="pt-1">
                <Badge variant="sky" className="text-[10px] font-mono">
                  <ShieldCheck className="h-3 w-3" />
                  {user?.role || 'SUPER_ADMIN'}
                </Badge>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/notifications">
                <User className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>Notificações</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/audit">
                <Terminal className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>Logs de Auditoria</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <ShieldCheck className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>Configurações</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-600 focus:text-rose-600 focus:bg-rose-50"
              onSelect={logout}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              <span>Encerrar Sessão</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
