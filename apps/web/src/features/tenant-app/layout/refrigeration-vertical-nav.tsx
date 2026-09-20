import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  CalendarDays,
  Users,
  Wrench,
  Boxes,
  Wallet,
  BarChart3,
  ClipboardList,
  Banknote,
  Snowflake,
  FileText,
  HardHat,
  AirVent,
} from 'lucide-react';

interface NavLinkItem {
  to: string;
  label: string;
  badge?: string;
  badgeClass?: string;
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

interface RefrigerationNavProps {
  features: string[];
  onNav?: () => void;
  groups: Record<string, boolean>;
  setGroup: (key: string, v: boolean) => void;
}

/**
 * Menu próprio da Refrigeração: o coração é OS + Agenda + Técnicos +
 * Orçamentos + Estoque. Cada item aponta para página real e respeita as
 * `features` da empresa.
 */
export const RefrigerationVerticalNav: React.FC<RefrigerationNavProps> = ({
  features,
  onNav,
  groups,
  setGroup,
}) => {
  const base = '/app';
  const has = (f: string) => features.includes(f);
  const g = (key: string, label: string, icon: React.ReactNode, iconClass: string, items: NavLinkItem[]) => (
    <NavGroupTree
      onNav={onNav}
      group={{
        key,
        label,
        icon,
        iconClass,
        open: groups[key] ?? true,
        onToggle: () => setGroup(key, !(groups[key] ?? true)),
        items,
      }}
    />
  );

  return (
    <nav className="space-y-1">
      <NavLink to={`${base}/service-dashboard`} onClick={onNav} className={topLinkClass}>
        <LayoutGrid className="w-4 h-4 text-zinc-500 shrink-0" />
        <span>Dashboard</span>
      </NavLink>

      <NavLink
        to={`${base}/calendar`}
        onClick={onNav}
        className={({ isActive }) =>
          `w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-[13px] font-bold transition-all border ${
            isActive
              ? 'bg-sky-600 text-white border-sky-600 shadow-[0_2px_8px_rgba(2,132,199,0.35)]'
              : 'bg-sky-50/80 text-sky-900 border-sky-200/80 hover:bg-sky-100'
          }`
        }
      >
        <CalendarDays className="w-4 h-4 shrink-0" />
        <span>Calendário</span>
        <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-600 text-white">
          Novo
        </span>
      </NavLink>

      {has('customers') && (
        <NavLink to={`${base}/customers`} onClick={onNav} className={topLinkClass}>
          <Users className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Clientes</span>
        </NavLink>
      )}

      {has('service') &&
        g(
          'os',
          'Ordens de Serviço',
          <Snowflake className="w-4 h-4" />,
          'text-sky-600',
          [
            { to: `${base}/service-orders`, label: 'Ordens de Serviço' },
            { to: `${base}/service-equipment`, label: 'Equipamentos' },
          ],
        )}

      {has('appointments') && (
        <NavLink to={`${base}/appointments`} onClick={onNav} className={topLinkClass}>
          <CalendarDays className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Agenda</span>
        </NavLink>
      )}

      {has('service') && (
        <NavLink to={`${base}/service-quotes`} onClick={onNav} className={topLinkClass}>
          <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Orçamentos</span>
        </NavLink>
      )}

      {has('team') && (
        <NavLink to={`${base}/service-technicians`} onClick={onNav} className={topLinkClass}>
          <HardHat className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Técnicos</span>
        </NavLink>
      )}

      {(has('products') || has('stock')) &&
        g(
          'pecas',
          'Peças & Estoque',
          <Boxes className="w-4 h-4" />,
          'text-emerald-600',
          [
            ...(has('products') ? [{ to: `${base}/products`, label: 'Peças' }] : []),
            ...(has('stock') ? [{ to: `${base}/stock`, label: 'Estoque' }] : []),
          ],
        )}

      {has('pos') && (
        <NavLink to={`${base}/pos`} onClick={onNav} className={topLinkClass}>
          <Banknote className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Vendas / PDV</span>
        </NavLink>
      )}

      {has('finance') &&
        g(
          'financeiro',
          'Financeiro',
          <Wallet className="w-4 h-4" />,
          'text-blue-600',
          [
            { to: `${base}/finance`, label: 'Caixa' },
            { to: `${base}/finance/receivables`, label: 'Contas a Receber' },
            { to: `${base}/pending-payments`, label: 'Pagamentos Pendentes', badge: 'Atrasados', badgeClass: 'bg-amber-100 text-amber-800' },
            { to: `${base}/finance/payables`, label: 'Contas a Pagar' },
          ],
        )}

      {has('service') &&
        g(
          'rotina',
          'Rotina',
          <ClipboardList className="w-4 h-4" />,
          'text-amber-600',
          [
            { to: `${base}/tasks`, label: 'Ordens de Serviço' },
            { to: `${base}/services`, label: 'Serviços' },
          ],
        )}

      {has('reports') && (
        <NavLink to={`${base}/service-reports`} onClick={onNav} className={topLinkClass}>
          <BarChart3 className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Relatórios</span>
        </NavLink>
      )}

      {has('team') && (
        <NavLink to={`${base}/team`} onClick={onNav} className={topLinkClass}>
          <AirVent className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Funcionários</span>
        </NavLink>
      )}

      {has('settings') && (
        <NavLink to={`${base}/settings`} onClick={onNav} className={topLinkClass}>
          <Wrench className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>Configurações</span>
        </NavLink>
      )}
    </nav>
  );
};

export default RefrigerationVerticalNav;
