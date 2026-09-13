import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Menu,
  Sparkles,
  Zap,
  CheckCircle2,
  LogOut,
  ExternalLink,
  UtensilsCrossed,
  Flame,
  ChefHat,
  Barcode,
  Calendar,
  Users,
  Package,
  Layers,
  FileText,
  Clock,
  Scissors,
  Store,
  Truck,
  ShoppingCart,
  Receipt,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SupermarketSidebarNav } from './supermarket-sidebar-nav';
import { OnboardingSetupWizard } from '../components/onboarding-setup-wizard';

// ─── 1. Emblema 4-Quadrantes (Logo) ───────────────────────────────────────────
const QuadrantLogo: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <div className={`${className} relative rounded-full overflow-hidden flex items-center justify-center shrink-0 cursor-pointer shadow-sm hover:opacity-90 transition-opacity`}>
    <svg className="w-full h-full" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="17.25" stroke="#1f242d" strokeWidth="1.5" />
      <path d="M17 2.5C9.54 2.5 3.5 8.54 3.5 16H17V2.5Z" fill="url(#tquad_tl)" />
      <path d="M19 2.5V16H32.5C32.5 8.54 26.46 2.5 19 2.5Z" fill="url(#tquad_tr)" />
      <path d="M17 19H3.5C3.5 26.46 9.54 32.5 17 32.5V19Z" fill="url(#tquad_bl)" />
      <path d="M19 19V32.5C26.46 32.5 32.5 26.46 32.5 19H19Z" fill="url(#tquad_br)" />
      <line x1="18" y1="2" x2="18" y2="34" stroke="#e8ecef" strokeWidth="1.5" />
      <line x1="2" y1="18" x2="34" y2="18" stroke="#e8ecef" strokeWidth="1.5" />
      <defs>
        <linearGradient id="tquad_tl" x1="4" y1="3" x2="17" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#696e79" />
          <stop offset="1" stopColor="#323740" />
        </linearGradient>
        <linearGradient id="tquad_tr" x1="19" y1="3" x2="32" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#434852" />
          <stop offset="1" stopColor="#1e2229" />
        </linearGradient>
        <linearGradient id="tquad_bl" x1="4" y1="19" x2="17" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#434852" />
          <stop offset="1" stopColor="#1a1d24" />
        </linearGradient>
        <linearGradient id="tquad_br" x1="19" y1="19" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2c3038" />
          <stop offset="1" stopColor="#0f1115" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

// ─── 2. Ícones Minimalistas ───────────────────────────────────────────────────
const IconDashboard: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <circle cx="4" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="14" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="4" cy="14" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="14" cy="14" r="2.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const IconProducts: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <rect x="2" y="4" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.5 8.5H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconPos: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <path d="M3 6.5C3 5.67 3.67 5 4.5 5H13.5C14.33 5 15 5.67 15 6.5V13.5C15 14.33 14.33 15 13.5 15H4.5C3.67 15 3 14.33 3 13.5V6.5Z" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 5V3.8C6 2.8 6.8 2 7.8 2H10.2C11.2 2 12 2.8 12 3.8V5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const IconCustomers: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.5 15C3.5 12.2 6 11 9 11C12 11 14.5 12.2 14.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IconFinance: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <rect x="2" y="2.5" width="14" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4.5 11.5L7.5 8.5L10 11L13.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 6.5H13.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconAutomations: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <path
      d="M9 1.8L10.9 3.5L13.4 3.1L14.4 5.3L16.8 6.4L16.5 8.9L17.8 11L16.2 13L16.1 15.5L13.6 15.8L12.1 17.7L9.7 16.9L7.3 17.7L5.8 15.8L3.3 15.5L3.2 13L1.6 11L2.9 8.9L2.6 6.4L5 5.3L6 3.1L8.5 3.5L9 1.8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const IconTeam: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 18 18" fill="none">
    <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 15C2 12.5 4 11 6.5 11C9 11 11 12.5 11 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M11.5 14.5C12 12.8 13.5 11.5 15.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const TenantLayout: React.FC = () => {
  const { slug, tenant, currentUser, logout, isLoadingTenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const base = slug ? `/${slug}/app` : '/app';

  // Collapsible tree groups (sempre fechados ao carregar / logar)
  const [openGroups, setOpenGroups] = useState<{ [k: string]: boolean }>({
    product: false,
    sales: false,
    restaurant: false,
    supermarket: false,
    barber: false,
  });

  const productGroupOpen = openGroups.product ?? false;
  const salesGroupOpen = openGroups.sales ?? false;
  const restaurantGroupOpen = openGroups.restaurant ?? false;
  const supermarketGroupOpen = openGroups.supermarket ?? false;
  const barberGroupOpen = openGroups.barber ?? false;
  const setProductGroupOpen = (v: boolean) => setOpenGroups((g) => ({ ...g, product: v }));
  const setSalesGroupOpen = (v: boolean) => setOpenGroups((g) => ({ ...g, sales: v }));
  const setRestaurantGroupOpen = (v: boolean) => setOpenGroups((g) => ({ ...g, restaurant: v }));
  const setSupermarketGroupOpen = (v: boolean) => setOpenGroups((g) => ({ ...g, supermarket: v }));
  const setBarberGroupOpen = (v: boolean) => setOpenGroups((g) => ({ ...g, barber: v }));

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [supermarketGroups, setSupermarketGroups] = useState<Record<string, boolean>>({
    operation: false,
    stock: false,
    purchases: false,
    finance: false,
  });
  const setSupermarketGroup = (key: string, v: boolean) =>
    setSupermarketGroups((g) => ({ ...g, [key]: v }));

  // Assistente de Primeiro Acesso ("Vamos te ajudar a configurar a sua empresa")
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const isOwnerOrAdmin = currentUser?.role === 'TENANT_ADMIN' || currentUser?.role === 'SUPER_ADMIN';
    const isRestaurant = tenant?.niche === 'RESTAURANT';
    const setupNotDone = tenant?.company && tenant.company.branding?.setupCompleted === false;

    if (isOwnerOrAdmin && isRestaurant && setupNotDone) {
      setShowOnboarding(true);
    }
  }, [currentUser?.role, tenant?.company, tenant?.niche]);

  // Load products to compute low stock count
  const { data: productsData } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
    enabled: Boolean(slug),
  });

  const lowStockCount = useMemo(() => {
    const prods = productsData?.products || [];
    const count = prods.filter((p: any) => Number(p.stockQuantity) <= Number(p.minStockAlert)).length;
    return count;
  }, [productsData]);

  const companyName = tenant?.tradeName || tenant?.companyName || 'Empresa';
  const niche = tenant?.niche || 'BARBERSHOP';
  const features = useMemo(() => tenant?.features || [], [tenant?.features]);

  // Feature-driven checks
  const isSupermarket = niche === 'SUPERMARKET';
  const hasBarberFeatures = features.includes('appointments') || features.includes('barbers') || niche === 'BARBERSHOP';
  const hasRestaurantFeatures = features.includes('tables') || features.includes('kds') || features.includes('recipes') || niche === 'RESTAURANT';
  const hasSupermarketFeatures = features.includes('pos_fast') || features.includes('stock_batches') || features.includes('xml_import') || isSupermarket;

  // Dynamic Page Title
  const pageTitle = useMemo(() => {
    const p = location.pathname;
    if (p.endsWith('/dashboard') || p === `${base}` || p === '/app') return 'Visão Geral Operacional';
    if (p.includes('/products')) return 'Catálogo & Estoque';
    if (p.includes('/supermarket-pos')) return 'PDV de Alta Velocidade';
    if (p.includes('/pos')) return 'Frente de Caixa (PDV)';
    if (p.includes('/orders')) return 'Histórico de Vendas';
    if (p.includes('/customers')) return 'Clientes & CRM';
    if (p.includes('/finance')) return 'Caixa & Financeiro';
    if (p.includes('/automations')) return 'Automações Inteligentes';
    if (p.includes('/appointments')) return 'Agenda & Horários';
    if (p.includes('/barbers')) return 'Equipe & Comissões';
    if (p.includes('/tables')) return 'Mapa de Salão & Gestão de Mesas';
    if (p.includes('/kds')) return 'Cozinha em Tempo Real (KDS)';
    if (p.includes('/recipes')) return 'Fichas Técnicas & CMV';
    if (p.includes('/purchase-notes')) return 'Notas de Compra';
    if (p.includes('/xml-import')) return 'Entrada de NF-e (XML)';
    if (p.includes('/marketplace/purchase-orders/new')) return 'Novo Pedido de Compra';
    if (p.includes('/marketplace/purchase-orders/')) return 'Detalhe do Pedido';
    if (p.includes('/marketplace/purchase-orders')) return 'Pedidos de Compra';
    if (p.includes('/marketplace/suppliers/')) return 'Fornecedor';
    if (p.includes('/marketplace/suppliers')) return 'Fornecedores';
    if (p.includes('/marketplace/nfe')) return 'Notas Fiscais';
    if (p.includes('/marketplace/batches')) return 'Lotes & Validades';
    if (p.includes('/marketplace')) return 'Central de Compras';
    if (p.includes('/stock-batches')) return 'Lotes & Validades';
    return 'Painel ERP';
  }, [location.pathname, base]);

  if (isLoadingTenant) {
    return (
      <div className="min-h-screen w-full bg-[#f4f5f7] flex items-center justify-center font-sans text-zinc-400 text-sm">
        Carregando painel operacional...
      </div>
    );
  }

  const isDashboard =
    location.pathname === `${base}/dashboard` ||
    location.pathname === base ||
    location.pathname === '/app';

  const renderSidebar = (onNav?: () => void) => (
    <aside className="w-[260px] h-screen p-5 lg:p-6 flex flex-col justify-between shrink-0 select-none bg-[#f4f5f7] font-sans border-r border-transparent">
      <div className="overflow-y-auto pr-1 scrollbar-none">
        {/* ─── Top Left Logo & Tenant Info ─── */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QuadrantLogo className="w-9 h-9" />
            <div className="min-w-0">
              <span className="font-bold text-sm text-zinc-900 tracking-tight block truncate">
                {companyName}
              </span>
              <span className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase block">
                {niche === 'RESTAURANT' ? 'Restaurante / Gastro' : niche === 'BARBERSHOP' ? 'Barbearia' : 'Supermercado'}
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-7 h-7 rounded-xl bg-white/70 hover:bg-white text-zinc-600 flex items-center justify-center transition shadow-2xs shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-white rounded-2xl p-1 shadow-elevated border-zinc-200">
              <DropdownMenuLabel className="px-3 py-2 text-xs font-bold text-zinc-800">
                {companyName}
                <span className="block text-[10px] text-emerald-600 font-normal">Painel Conectado</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-100" />
              <DropdownMenuItem
                onClick={() => navigate(`${base}/dashboard`)}
                className="text-xs cursor-pointer rounded-xl"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                Painel Principal
              </DropdownMenuItem>
              {hasBarberFeatures && (
                <DropdownMenuItem
                  onClick={() => window.open(`/${slug}/agendar`, '_blank')}
                  className="text-xs cursor-pointer rounded-xl text-emerald-700"
                >
                  <Calendar className="w-3.5 h-3.5 mr-2" />
                  Link de Agendamento
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-zinc-100" />
              <DropdownMenuItem
                onClick={logout}
                className="text-xs cursor-pointer rounded-xl text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Sair do Sistema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ─── Menu Navigation ─── */}
        <nav className="space-y-1">
          {isSupermarket ? (
            <SupermarketSidebarNav
              slug={slug}
              onNav={onNav}
              groups={supermarketGroups}
              setGroup={setSupermarketGroup}
            />
          ) : (
            <>
          {/* 1. Visão Geral (Core ERP) */}
          <NavLink
            to={`${base}/dashboard`}
            onClick={onNav}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
              isDashboard
                ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
            }`}
          >
            <IconDashboard className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>Visão Geral</span>
          </NavLink>

          {/* ─── VERTICAL RESTAURANTE & GASTRONOMIA ─── */}
          {hasRestaurantFeatures && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setRestaurantGroupOpen(!restaurantGroupOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-[13px] font-medium text-zinc-900 transition-all hover:bg-white/50"
              >
                <div className="flex items-center gap-3">
                  <UtensilsCrossed className="w-4 h-4 text-orange-600 shrink-0" />
                  <span className="font-semibold text-zinc-900">Salão & Cozinha</span>
                </div>
                {restaurantGroupOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
                )}
              </button>

              {restaurantGroupOpen && (
                <div className="relative pl-6 space-y-1 my-1 ml-5">
                  <div className="absolute left-[7px] top-0 bottom-3 w-[1.5px] bg-[#dce1e6]" />

                  {/* Mapa de Mesas */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/tables`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Mapa de Mesas</span>
                      <span className="text-[9px] bg-orange-100 text-orange-800 font-bold px-1.5 py-0.5 rounded">
                        Salão
                      </span>
                    </NavLink>
                  </div>

                  {/* KDS Cozinha */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/kds`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Cozinha (KDS)</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </NavLink>
                  </div>

                  {/* Painel do Garçom */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/waiter`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Painel do Garçom</span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                        Salão
                      </span>
                    </NavLink>
                  </div>

                  {/* Ficha Técnica & CMV */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/recipes`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Fichas & CMV</span>
                    </NavLink>
                  </div>

                  {/* Notas de Compra */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/purchase-notes`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Notas de Compra</span>
                      <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                        Compras
                      </span>
                    </NavLink>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── VERTICAL BARBEARIA ─── */}
          {hasBarberFeatures && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setBarberGroupOpen(!barberGroupOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-[13px] font-medium text-zinc-900 transition-all hover:bg-white/50"
              >
                <div className="flex items-center gap-3">
                  <Scissors className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-zinc-900">Barbearia</span>
                </div>
                {barberGroupOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
                )}
              </button>

              {barberGroupOpen && (
                <div className="relative pl-6 space-y-1 my-1 ml-5">
                  <div className="absolute left-[7px] top-0 bottom-3 w-[1.5px] bg-[#dce1e6]" />

                  {/* Agenda */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/appointments`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Agenda & Horários</span>
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        Hoje
                      </span>
                    </NavLink>
                  </div>

                  {/* Equipe & Comissões */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/barbers`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Equipe & Comissões</span>
                    </NavLink>
                  </div>

                  {/* Link Agendar */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <a
                      href={tenant?.slug ? `/${tenant.slug}/agendar` : '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50/70 transition"
                    >
                      <span>Link Online</span>
                      <ExternalLink className="w-3 h-3 text-emerald-600" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── VERTICAL SUPERMERCADO & VAREJO ─── */}
          {hasSupermarketFeatures && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSupermarketGroupOpen(!supermarketGroupOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-[13px] font-medium text-zinc-900 transition-all hover:bg-white/50"
              >
                <div className="flex items-center gap-3">
                  <Store className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-zinc-900">Supermercado</span>
                </div>
                {supermarketGroupOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
                )}
              </button>

              {supermarketGroupOpen && (
                <div className="relative pl-6 space-y-1 my-1 ml-5">
                  <div className="absolute left-[7px] top-0 bottom-3 w-[1.5px] bg-[#dce1e6]" />

                  {/* PDV Alta Velocidade */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/supermarket-pos`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>PDV Rápido</span>
                      <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                        Balança
                      </span>
                    </NavLink>
                  </div>

                  {/* Lotes & Validades */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/stock-batches`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Lotes & Validades</span>
                    </NavLink>
                  </div>

                  {/* Entrada XML NF-e */}
                  <div className="relative flex items-center">
                    <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                    <NavLink
                      to={`${base}/xml-import`}
                      onClick={onNav}
                      className={({ isActive }) =>
                        `w-full flex items-center px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                          isActive
                            ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                            : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                        }`
                      }
                    >
                      <span>Entrada NF-e (XML)</span>
                    </NavLink>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── VERTICAL CENTRAL DE COMPRAS (MERCADO) ─── */}
          {hasSupermarketFeatures && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate(`${base}/marketplace`)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                  location.pathname.includes('/marketplace')
                    ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                    : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
                }`}
              >
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Central de Compras</span>
                <span className="ml-auto text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                  novo
                </span>
              </button>
            </div>
          )}

          {/* ─── DIVISOR DE MÓDULOS ─── */}
          <div className="my-2 border-t border-zinc-200/50 mx-3" />

          {/* Catálogo Geral & Estoque */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setProductGroupOpen(!productGroupOpen)}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-[13px] font-medium text-zinc-900 transition-all hover:bg-white/50"
            >
              <div className="flex items-center gap-3">
                <IconProducts className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Catálogo & Estoque</span>
              </div>
              {productGroupOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {productGroupOpen && (
              <div className="relative pl-6 space-y-1 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-3 w-[1.5px] bg-[#dce1e6]" />

                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to={`${base}/products`}
                    onClick={onNav}
                    className={({ isActive }) =>
                      `w-full flex items-center px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                        isActive
                          ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                          : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                      }`
                    }
                  >
                    <span>Catálogo de Itens</span>
                  </NavLink>
                </div>

                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to={`${base}/products`}
                    onClick={onNav}
                    className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium transition-all"
                  >
                    <span>Em Reposição</span>
                    {lowStockCount > 0 ? (
                      <span className="bg-[#ffded5] text-[#f25c3b] font-bold text-xs rounded-xl px-2 py-0.5 leading-none">
                        {lowStockCount}
                      </span>
                    ) : (
                      <span className="bg-zinc-100 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded">
                        0
                      </span>
                    )}
                  </NavLink>
                </div>

                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to={`${base}/purchase-notes`}
                    onClick={onNav}
                    className={({ isActive }) =>
                      `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                        isActive
                          ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                          : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                      }`
                    }
                  >
                    <span>Notas de Compra</span>
                    <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                      Reposição
                    </span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* Vendas & PDV Base */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setSalesGroupOpen(!salesGroupOpen)}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-[13px] font-medium text-zinc-900 transition-all hover:bg-white/50"
            >
              <div className="flex items-center gap-3">
                <IconPos className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="font-semibold text-zinc-900">Vendas & PDV</span>
              </div>
              {salesGroupOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              )}
            </button>

            {salesGroupOpen && (
              <div className="relative pl-6 space-y-1 my-1 ml-5">
                <div className="absolute left-[7px] top-0 bottom-3 w-[1.5px] bg-[#dce1e6]" />

                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to={`${base}/pos`}
                    onClick={onNav}
                    className={({ isActive }) =>
                      `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                        isActive
                          ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                          : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                      }`
                    }
                  >
                    <span>Frente de Caixa</span>
                    <span className="bg-[#d8f8e8] text-[#1bb768] font-bold text-xs rounded-xl px-2 py-0.5 leading-none">
                      PDV
                    </span>
                  </NavLink>
                </div>

                <div className="relative flex items-center">
                  <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
                  <NavLink
                    to={`${base}/orders`}
                    onClick={onNav}
                    className={({ isActive }) =>
                      `w-full flex items-center px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
                        isActive
                          ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                          : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
                      }`
                    }
                  >
                    <span>Histórico Vendas</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>

          {/* Clientes & CRM */}
          <NavLink
            to={`${base}/customers`}
            onClick={onNav}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                  : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
              }`
            }
          >
            <IconCustomers className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>Clientes & CRM</span>
          </NavLink>

          {/* Caixa & Financeiro */}
          <NavLink
            to={`${base}/finance`}
            onClick={onNav}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                  : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
              }`
            }
          >
            <IconFinance className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>Caixa & Financeiro</span>
          </NavLink>

          {/* Automações */}
          <NavLink
            to={`${base}/automations`}
            onClick={onNav}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                  : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
              }`
            }
          >
            <IconAutomations className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>Automações</span>
          </NavLink>

          {/* Equipe & Funcionários */}
          <NavLink
            to={`${base}/team`}
            onClick={onNav}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                  : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
              }`
            }
          >
            <IconTeam className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>Equipe & Funcionários</span>
          </NavLink>
            </>
          )}
        </nav>
      </div>

      {/* ─── Rodapé com Usuário ─── */}
      <div className="pt-3 border-t border-zinc-200/50">
        <div className="flex items-center justify-between text-xs text-zinc-500 px-3 py-1.5 rounded-2xl hover:bg-white/60 transition">
          <div className="min-w-0 pr-2">
            <span className="font-bold text-zinc-800 truncate block leading-tight">
              {currentUser?.name || 'Administrador'}
            </span>
            <span className="text-[10px] text-zinc-400 truncate block">
              {currentUser?.email || 'admin@sistema.com'}
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sair do painel"
            className="text-zinc-400 hover:text-rose-600 p-1.5 rounded-xl hover:bg-rose-50 transition shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen w-full bg-[#f4f5f7] flex font-sans antialiased text-zinc-900 selection:bg-zinc-200">
      {/* ─── Desktop Sidebar ─── */}
      <div className="hidden md:flex flex-col shrink-0">
        {renderSidebar()}
      </div>

      {/* ─── Mobile Sidebar Sheet ─── */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] p-0 bg-[#f4f5f7] border-0">
          {renderSidebar(() => setMobileMenuOpen(false))}
        </SheetContent>
      </Sheet>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto px-3.5 sm:px-8 lg:px-10 py-4 sm:py-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 h-9 w-9 text-zinc-700 hover:bg-white rounded-xl"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111827]">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            {hasRestaurantFeatures && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`${base}/kds`)}
                className="h-9 px-3.5 text-xs font-bold text-orange-800 bg-orange-50 hover:bg-orange-100 border-orange-200 rounded-2xl shadow-2xs hidden sm:flex items-center gap-1.5 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 text-orange-600" />
                <span>KDS Cozinha</span>
              </Button>
            )}

            {hasSupermarketFeatures && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`${base}/supermarket-pos`)}
                className="h-9 px-3.5 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border-blue-200 rounded-2xl shadow-2xs hidden sm:flex items-center gap-1.5 cursor-pointer"
              >
                <Barcode className="w-3.5 h-3.5 text-blue-600" />
                <span>PDV Balança</span>
              </Button>
            )}

            {hasBarberFeatures && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(tenant?.slug ? `/${tenant.slug}/agendar` : '#', '_blank')}
                className="h-9 px-3.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 rounded-2xl shadow-2xs hidden sm:flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                <span>Agendamento Online</span>
              </Button>
            )}

            {hasRestaurantFeatures && (currentUser?.role === 'TENANT_ADMIN' || currentUser?.role === 'SUPER_ADMIN') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOnboarding(true)}
                className="h-9 px-3.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200 rounded-2xl shadow-2xs hidden sm:flex items-center gap-1.5 cursor-pointer"
                title="Configurar Salão e Mesas"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Configurar Salão</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => {
                if (hasSupermarketFeatures) {
                  navigate(`${base}/supermarket-pos`);
                } else if (hasRestaurantFeatures) {
                  navigate(`${base}/tables`);
                } else {
                  navigate(`${base}/pos`);
                }
              }}
              className="h-9 px-4 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Nova Venda</span>
            </Button>
          </div>
        </div>

        {/* Content Outlet */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Assistente de Primeiro Acesso ("Vamos te ajudar a configurar a sua empresa") */}
      <OnboardingSetupWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onSuccess={() => setShowOnboarding(false)}
      />
    </div>
  );
};
