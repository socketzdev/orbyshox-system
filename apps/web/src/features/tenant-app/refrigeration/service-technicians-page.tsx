import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { HardHat, UserPlus } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) => `R$ ${((Number(cents) || 0) / 100).toFixed(2).replace('.', ',')}`;

export const ServiceTechniciansPage: React.FC = () => {
  const { slug } = useTenant();
  const { data: techs = [], isLoading } = useQuery({
    queryKey: ['service-technicians', slug],
    queryFn: () => apiGet('/service-orders/technicians'),
  });

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <HardHat className="w-5 h-5 text-sky-600" /> Técnicos
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Serviços atribuídos, em aberto, concluídos e faturamento por técnico.</p>
        </div>
        <Link to="/app/team/new">
          <Button className="bg-sky-600 hover:bg-sky-700">
            <UserPlus className="w-4 h-4 mr-2" /> Cadastrar técnico
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <TableRowSkeleton />
      ) : techs.length === 0 ? (
        <ErpEmptyState icon={HardHat} title="Nenhum técnico" description="Cadastre a equipe para atribuir as OS." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {techs.map((t: any) => (
            <div key={t.id} className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-sky-100 text-sky-800 font-black flex items-center justify-center shrink-0">
                  {t.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-zinc-900 truncate">{t.name}</div>
                  <div className="text-[11px] text-zinc-500">{t.position || t.role}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="bg-amber-50 rounded-xl p-2">
                  <div className="text-lg font-black text-amber-700">{t.openOrders}</div>
                  <div className="text-[10px] text-zinc-500">Abertas</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2">
                  <div className="text-lg font-black text-emerald-700">{t.completedOrders}</div>
                  <div className="text-[10px] text-zinc-500">Concluídas</div>
                </div>
                <div className="bg-sky-50 rounded-xl p-2">
                  <div className="text-sm font-black text-sky-700 mt-1">{brl(t.revenueCents)}</div>
                  <div className="text-[10px] text-zinc-500">Faturado</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceTechniciansPage;
