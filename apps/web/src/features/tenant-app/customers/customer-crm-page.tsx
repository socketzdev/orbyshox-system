import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Phone,
  Mail,
  DollarSign,
  ShoppingBag,
  MessageSquare,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

export const CustomerCrmPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['tenant-customers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/customers`),
  });

  const createMutation = useMutation({
    mutationFn: (newCust: any) => apiPost(`/tenant-app/${slug}/customers`, newCust),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-customers', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard', slug] });
      setModalOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      toast.success('Cliente cadastrado com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao cadastrar cliente'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Nome é obrigatório');
    createMutation.mutate({ name, phone, email });
  };

  const openWhatsApp = (customerPhone: string, customerName: string) => {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(
      `Olá ${customerName}! Tudo bem? Passando para agradecer sua preferência em nossa loja!`
    )}`;
    window.open(url, '_blank');
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c: any) => {
      const match =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));
      return match;
    });
  }, [customers, searchTerm]);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-zinc-700" />
              Gestão de Clientes & Fidelização (CRM)
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-zinc-50">
              {customers.length} cadastrados
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">
            Acompanhe histórico de consumo, envie mensagens via WhatsApp e ative retenção anti-churn.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          className="h-10 px-4 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-amber-400" />
          <span>Cadastrar Cliente</span>
        </Button>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6 overflow-hidden">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 text-xs rounded-xl border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-800 transition"
            />
          </div>
        </div>

        {isLoading ? (
          <table className="w-full text-left text-xs">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))}
            </tbody>
          </table>
        ) : filteredCustomers.length === 0 ? (
          <ErpEmptyState
            icon={Users}
            title="Nenhum cliente cadastrado"
            description="Cadastre clientes para registrar compras no nome deles, pontuar fidelidade e enviar cupons."
            actionLabel="Cadastrar Primeiro Cliente"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="pb-3 font-semibold">Cliente</th>
                  <th className="pb-3 font-semibold">Contato</th>
                  <th className="pb-3 font-semibold">Total Comprado</th>
                  <th className="pb-3 font-semibold">Histórico</th>
                  <th className="pb-3 text-right font-semibold">Ação Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredCustomers.map((c: any) => {
                  const initial = c.name ? c.name[0].toUpperCase() : 'C';
                  return (
                    <tr key={c.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-800 font-bold text-xs flex items-center justify-center shrink-0 border border-zinc-200/60 shadow-xs">
                            {initial}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900">{c.name}</p>
                            <span className="text-[10px] text-zinc-400">
                              Cadastrado em {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 text-zinc-600">
                        <div className="space-y-0.5">
                          {c.phone && <p className="text-zinc-800 font-medium font-mono">{c.phone}</p>}
                          {c.email && <p className="text-[11px] text-zinc-400">{c.email}</p>}
                        </div>
                      </td>
                      <td className="py-3.5 font-bold text-zinc-900 font-mono">
                        R$ {(c.totalSpent / 100).toFixed(2)}
                      </td>
                      <td className="py-3.5 text-zinc-700 font-medium">
                        <Badge variant="outline" className="bg-zinc-50 text-[10px]">
                          {c.orderCount} {c.orderCount === 1 ? 'compra' : 'compras'}
                        </Badge>
                      </td>
                      <td className="py-3.5 text-right">
                        {c.phone ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openWhatsApp(c.phone, c.name)}
                            className="h-8 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 inline-flex items-center gap-1.5 rounded-xl"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </Button>
                        ) : (
                          <span className="text-zinc-300 text-[11px]">Sem tel</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Novo Cliente */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-6 sm:p-7 rounded-3xl font-sans shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-zinc-700" />
              Cadastrar Novo Cliente
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Adicione os dados do cliente para identificá-lo no caixa e agendamentos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1.5">Nome Completo *</label>
              <Input
                placeholder="Ex: Maria Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-xs font-medium rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-800 transition"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1.5">
                WhatsApp / Telefone
              </label>
              <Input
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 text-xs font-mono font-medium rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-800 transition"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1.5">E-mail</label>
              <Input
                type="email"
                placeholder="cliente@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-xs font-medium rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-800 transition"
              />
            </div>

            <DialogFooter className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="h-10 px-4 text-xs font-bold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl shadow-2xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="h-10 px-5 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar Cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
