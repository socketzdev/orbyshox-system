import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Search, ScanLine, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { useGymRealtime } from './use-gym-realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ErpEmptyState } from '../components/erp-empty-state';

export const AcademyCheckinPage: React.FC = () => {
  const { slug } = useTenant();
  const { live } = useGymRealtime();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: today } = useQuery({
    queryKey: ['gym-checkins-today', slug],
    queryFn: () => apiGet('/gym/checkins/today'),
    refetchInterval: 15000,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['gym-students', slug, 'ALL'],
    queryFn: () => apiGet('/gym/students', { status: 'ALL' }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gym-checkins-today', slug] });
    queryClient.invalidateQueries({ queryKey: ['gym-dashboard', slug] });
  };

  const checkinMutation = useMutation({
    mutationFn: ({ studentId, method }: any) => apiPost('/gym/checkins', { studentId, method }),
    onSuccess: (res: any) => {
      invalidate();
      if (res?.allowed) toast.success(`Entrada liberada: ${res.student?.name}`);
      else toast.error(`Acesso bloqueado: ${res?.reason || 'irregular'}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro no check-in'),
  });

  const candidates = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return (students || [])
      .filter((s: any) => s.name?.toLowerCase().includes(q) || s.phone?.includes(search))
      .slice(0, 6);
  }, [students, search]);

  const list = today?.list || [];

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-orange-600" /> Check-in / Catraca
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-full ${live ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
              {live ? 'AO VIVO' : 'OFFLINE'}
            </span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            {today ? `${today.present} presentes • ${today.total} registros • ${today.blocked} bloqueados hoje` : 'Carregando movimento de hoje...'}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft space-y-3">
        <label className="text-xs font-bold text-zinc-700">CHECK-IN MANUAL — BUSQUE O ALUNO</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite o nome do aluno..." className="pl-9 text-base min-h-[56px]" autoFocus />
        </div>
        {candidates.length > 0 && (
          <div className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
            {candidates.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{s.name}</div>
                  <div className="text-[11px] text-zinc-500">{s.planName || 'Sem plano'} • {s.status}</div>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                  disabled={checkinMutation.isPending}
                  onClick={() => checkinMutation.mutate({ studentId: s.id, method: 'MANUAL' })}
                >
                  Liberar entrada
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={checkinMutation.isPending}
                  onClick={() => checkinMutation.mutate({ studentId: s.id, method: 'QR_CODE' })}
                  title="Registrar como leitura de QR"
                >
                  <ScanLine className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100 font-bold text-sm">Movimento de hoje</div>
        {list.length === 0 ? (
          <ErpEmptyState icon={DoorOpen} title="Nenhum acesso hoje" description="O primeiro check-in aparece aqui." />
        ) : (
          <div className="divide-y divide-zinc-100 max-h-[480px] overflow-y-auto">
            {list.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{c.student?.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {c.method === 'QR_CODE' ? 'QR Code' : 'Manual'}
                    {c.blocked && c.blockReason && ` • ${c.blockReason}`}
                  </div>
                </div>
                {c.blocked ? (
                  <Badge className="bg-red-100 text-red-700"><Ban className="w-3 h-3 mr-1" />Bloqueado</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800">Presente</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AcademyCheckinPage;
