import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  ShoppingCart,
  Boxes,
  Truck,
  Users,
  Wallet,
  BarChart3,
  Settings,
} from 'lucide-react';

interface NavLinkItem {
  to: string;
  label: string;
  badge?: string;
  badgeClass?: string;
  dot?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  iconClass: string;
  open: boolean;
  onToggle: () => void;
  items: NavLinkItem[];
}

const groupItemClass = ({ isActive }: { isActive: boolean }) =>
  `w-full flex items-center justify-between px-3.5 py-1.5 rounded-2xl text-[12.5px] transition-all ${
    isActive
      ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
      : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/60 font-medium'
  }`;

function NavItem({ item, onNav }: { item: NavLinkItem; onNav?: () => void }) {
  return (
    <div className="relative flex items-center">
      <div className="absolute -left-[17px] top-0 h-[17px] w-[14px] border-b-[1.5px] border-l-[1.5px] border-[#dce1e6] rounded-bl-[10px] pointer-events-none" />
      <NavLink to={item.to} onClick={onNav} className={groupItemClass}>
        <span>{item.label}</span>
        {item.dot && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
        {item.badge && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.badgeClass ?? 'bg-zinc-100 text-zinc-500'}`}>
            {item.badge}
          </span>
        )}
      </NavLink>
    </div>
  );
}

function NavGroupTree({ group, onNav }: { group: NavGroup; onNav?: () => void }) {
  return (
    <div className="pt-0.5">
      <button
        type="button"
        onClick={group.onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-[13px] font-medium text-zinc-900 transition-all hover:bg-white/50"
      >
        <div className="flex items-center gap-3">
          <span className={`w-4 h-4 shrink-0 ${group.iconClass}`}>{group.icon}</span>
          <span className="font-semibold text-zinc-900">{group.label}</span>
        </div>
        {group.open ? (
          <ChevronUp className="w-3.5 h-3.5 text-zinc-500 stroke-[2]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
        )}
      </button>

      {group.open && (
        <div className="relative pl-6 space-y-1 my-1 ml-5">
          <div className="absolute left-[7px] top-0 bottom-3 w-[1.5px] bg-[#dce1e6]" />
          {group.items.map((item) => (
            <NavItem key={item.to + item.label} item={item} onNav={onNav} />
          ))}
        </div>
      )}
    </div>
  );
}

const topLinkClass = ({ isActive }: { isActive: boolean }) =>
  `w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all ${
    isActive
      ? 'bg-white text-zinc-900 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
      : 'text-[#6c757d] hover:text-zinc-900 hover:bg-white/50'
  }`;

interface SupermarketSidebarNavProps {
  slug: string;
  onNav?: () => void;
  groups: Record<string, boolean>;
  setGroup: (key: string, v: boolean) => void;
}

export const SupermarketSidebarNav: React.FC<SupermarketSidebarNavProps> = ({
  slug,
  onNav,
  groups,
  setGroup,
}) => {
  const base = slug ? `/${slug}/app` : '/app';

  return (
    <nav className="space-y-1">
      {/* 1. Dashboard */}
      <NavLink to={`${base}/dashboard`} onClick={onNav} className={topLinkClass}>
        <LayoutGrid className="w-4 h-4 text-zinc-500 shrink-0" />
        <span>Dashboard</span>
      </NavLink>

      {/* 2. Operação */}
      <NavGroupTree
        onNav={onNav}
        group={{
          key: 'operation',
          label: 'Operação',
          icon: <ShoppingCart className="w-4 h-4" />,
          iconClass: 'text-blue-600',
          open: !!groups.operation,
          onToggle: () => setGroup('operation', !groups.operation),
          items: [
            { to: `${base}/supermarket-pos`, label: 'PDV', badge: 'Caixa', badgeClass: 'bg-blue-100 text-blue-800' },
            { to: `${base}/orders`, label: 'Vendas' },
            { to: `${base}/returns`, label: 'Devoluções & Trocas' },
          ],
        }}
      />

      {/* 3. Estoque */}
      <NavGroupTree
        onNav={onNav}
        group={{
          key: 'stock',
          label: 'Estoque',
          icon: <Boxes className="w-4 h-4" />,
          iconClass: 'text-emerald-600',
          open: !!groups.stock,
          onToggle: () => setGroup('stock', !groups.stock),
          items: [
            { to: `${base}/products`, label: 'Produtos' },
            { to: `${base}/stock`, label: 'Estoque Geral' },
            { to: `${base}/inventory`, label: 'Inventário' },
            { to: `${base}/losses`, label: 'Perdas & Avarias' },
            { to: `${base}/stock-batches`, label: 'Lotes & Validade' },
            { to: `${base}/xml-import`, label: 'Importar XML' },
          ],
        }}
      />

      {/* 4. Compras */}
      <NavGroupTree
        onNav={onNav}
        group={{
          key: 'purchases',
          label: 'Compras',
          icon: <Truck className="w-4 h-4" />,
          iconClass: 'text-amber-600',
          open: !!groups.purchases,
          onToggle: () => setGroup('purchases', !groups.purchases),
          items: [
            { to: `${base}/marketplace/purchase-orders`, label: 'Pedidos' },
            { to: `${base}/purchase-notes`, label: 'Notas de Compra', badge: 'Rápida', badgeClass: 'bg-amber-100 text-amber-800' },
            { to: `${base}/marketplace/batches`, label: 'Recebimentos' },
            { to: `${base}/marketplace/suppliers`, label: 'Fornecedores' },
            { to: `${base}/marketplace/nfe`, label: 'NF-e' },
          ],
        }}
      />

      {/* 5. Clientes */}
      <NavLink to={`${base}/customers`} onClick={onNav} className={topLinkClass}>
        <Users className="w-4 h-4 text-zinc-500 shrink-0" />
        <span>Clientes</span>
      </NavLink>

      {/* 6. Financeiro */}
      <NavGroupTree
        onNav={onNav}
        group={{
          key: 'finance',
          label: 'Financeiro',
          icon: <Wallet className="w-4 h-4" />,
          iconClass: 'text-violet-600',
          open: !!groups.finance,
          onToggle: () => setGroup('finance', !groups.finance),
          items: [
            { to: `${base}/finance`, label: 'Caixa' },
            { to: `${base}/finance/payables`, label: 'Contas a Pagar' },
            { to: `${base}/finance/receivables`, label: 'Contas a Receber' },
          ],
        }}
      />

      {/* 7. Relatórios */}
      <NavLink to={`${base}/reports`} onClick={onNav} className={topLinkClass}>
        <BarChart3 className="w-4 h-4 text-zinc-500 shrink-0" />
        <span>Relatórios</span>
      </NavLink>

      {/* 8. Funcionários */}
      <NavLink to={`${base}/team`} onClick={onNav} className={topLinkClass}>
        <Users className="w-4 h-4 text-zinc-500 shrink-0" />
        <span>Funcionários</span>
      </NavLink>

      {/* 9. Configurações */}
      <NavLink to={`${base}/settings`} onClick={onNav} className={topLinkClass}>
        <Settings className="w-4 h-4 text-zinc-500 shrink-0" />
        <span>Configurações</span>
      </NavLink>
    </nav>
  );
};