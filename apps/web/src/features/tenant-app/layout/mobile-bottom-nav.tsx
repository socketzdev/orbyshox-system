import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  UtensilsCrossed,
  Flame,
  ShoppingCart,
  LayoutDashboard,
  CreditCard,
  Menu,
  LogOut,
  CheckSquare,
} from 'lucide-react';

interface MobileBottomNavProps {
  base: string;
  isWaiter: boolean;
  isKitchen: boolean;
  isAdmin: boolean;
  isCleaning?: boolean;
  isCashier?: boolean;
  canViewTables?: boolean;
  canViewKds?: boolean;
  canViewPos?: boolean;
  canViewPurchaseNotes?: boolean;
  canViewTasks?: boolean;
  onOpenMenu: () => void;
  onLogout: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  base,
  isWaiter,
  isKitchen,
  isAdmin,
  isCleaning = false,
  isCashier = false,
  canViewTables = true,
  canViewKds = true,
  canViewPos = true,
  canViewPurchaseNotes = true,
  canViewTasks = true,
  onOpenMenu,
  onLogout,
}) => {
  const logoutTab = (
    <button
      type="button"
      onClick={onLogout}
      className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-rose-500 hover:text-rose-700 transition-all font-medium"
    >
      <LogOut className="w-5 h-5 mb-0.5" />
      <span className="text-[10px]">Sair</span>
    </button>
  );

  if (isCleaning) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 px-3 py-1.5 flex items-center justify-around shadow-lg safe-area-pb">
        <NavLink
          to={`${base}/tasks`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              isActive
                ? 'text-emerald-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <CheckSquare className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Rotinas</span>
        </NavLink>
        {logoutTab}
      </nav>
    );
  }

  if (isCashier) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 px-3 py-1.5 flex items-center justify-around shadow-lg safe-area-pb">
        {canViewPos && (
          <NavLink
            to={`${base}/pos`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-600 font-bold scale-105'
                  : 'text-zinc-500 hover:text-zinc-900 font-medium'
              }`
            }
          >
            <CreditCard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">PDV</span>
          </NavLink>
        )}
        {canViewTables && (
          <NavLink
            to={`${base}/tables`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-orange-600 font-bold scale-105'
                  : 'text-zinc-500 hover:text-zinc-900 font-medium'
              }`
            }
          >
            <UtensilsCrossed className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Mesas</span>
          </NavLink>
        )}
        {canViewTasks && (
          <NavLink
            to={`${base}/tasks`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-600 font-bold scale-105'
                  : 'text-zinc-500 hover:text-zinc-900 font-medium'
              }`
            }
          >
            <CheckSquare className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Tarefas</span>
          </NavLink>
        )}
        {logoutTab}
      </nav>
    );
  }

  if (isWaiter) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 px-2 py-1.5 flex items-center justify-around shadow-lg safe-area-pb">
        {canViewTables && (
        <NavLink
          to={`${base}/tables`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              isActive
                ? 'text-orange-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <UtensilsCrossed className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Mesas</span>
        </NavLink>
        )}

        {canViewKds && (
        <NavLink
          to={`${base}/kds`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              isActive
                ? 'text-orange-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <Flame className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">KDS</span>
        </NavLink>
        )}

        {canViewPos && (
        <NavLink
          to={`${base}/pos`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              isActive
                ? 'text-emerald-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <CreditCard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">PDV</span>
        </NavLink>
        )}

        {canViewTasks && (
        <NavLink
          to={`${base}/tasks`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              isActive
                ? 'text-emerald-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <CheckSquare className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Tarefas</span>
        </NavLink>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-rose-500 hover:text-rose-700 transition-all font-medium"
        >
          <LogOut className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Sair</span>
        </button>
      </nav>
    );
  }

  if (isKitchen) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 px-3 py-1.5 flex items-center justify-around shadow-lg safe-area-pb">
        {canViewKds && (
        <NavLink
          to={`${base}/kds`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              isActive
                ? 'text-orange-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <Flame className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">KDS Cozinha</span>
        </NavLink>
        )}

        {canViewTasks && (
        <NavLink
          to={`${base}/tasks`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              isActive
                ? 'text-emerald-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <CheckSquare className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Tarefas</span>
        </NavLink>
        )}

        {canViewPurchaseNotes && (
        <NavLink
          to={`${base}/purchase-notes`}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              isActive
                ? 'text-amber-600 font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-900 font-medium'
            }`
          }
        >
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Notas de Compra</span>
        </NavLink>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-rose-500 hover:text-rose-700 transition-all font-medium"
        >
          <LogOut className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Sair</span>
        </button>
      </nav>
    );
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 px-2 py-1.5 flex items-center justify-around shadow-lg safe-area-pb">
      <NavLink
        to={`${base}/dashboard`}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            isActive
              ? 'text-zinc-900 font-bold scale-105'
              : 'text-zinc-500 hover:text-zinc-900 font-medium'
          }`
        }
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Início</span>
      </NavLink>

      <NavLink
        to={`${base}/tables`}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            isActive
              ? 'text-orange-600 font-bold scale-105'
              : 'text-zinc-500 hover:text-zinc-900 font-medium'
          }`
        }
      >
        <UtensilsCrossed className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Mesas</span>
      </NavLink>

      <NavLink
        to={`${base}/pos`}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            isActive
              ? 'text-emerald-600 font-bold scale-105'
              : 'text-zinc-500 hover:text-zinc-900 font-medium'
          }`
        }
      >
        <CreditCard className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">PDV</span>
      </NavLink>

      <NavLink
        to={`${base}/purchase-notes`}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            isActive
              ? 'text-amber-600 font-bold scale-105'
              : 'text-zinc-500 hover:text-zinc-900 font-medium'
          }`
        }
      >
        <ShoppingCart className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Compras</span>
      </NavLink>

      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all font-medium"
      >
        <Menu className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Mais</span>
      </button>
    </nav>
  );
};
