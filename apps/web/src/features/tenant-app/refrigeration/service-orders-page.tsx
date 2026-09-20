import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Snowflake, Plus, Camera, Trash2, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TableRowSkeleton } from '../components/erp-skeleton';
import { ErpEmptyState } from '../components/erp-empty-state';

const brl = (cents: number) => `R$ ${((Number(cents) || 0) / 100).toFixed(2).replace('.', ',')}`;
const fmtDT = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const ST: Record<string, { label: string; cls: string }> = {
  ABERTA: { label: 'Aberta', cls: 'bg-zinc-200 text-zinc-800' },
  AGENDADA: { label: 'Agendada', cls: 'bg-sky-100 text-sky-800' },
  EM_ATENDIMENTO: { label: 'Em atendimento', cls: 'bg-amber-100 text-amber-800' },
  AGUARDANDO_PECA: { label: 'Aguardando peça', cls: 'bg-orange-100 text-orange-800' },
  CONCLUIDA: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELADA: { label: 'Cancelada', cls: 'bg-red-100 text-red-700' },
};

const NEXT: Record<string, string[]> = {
  ABERTA: ['AGENDADA', 'EM_ATENDIMENTO', 'CANCELADA'],
  AGENDADA: ['EM_ATENDIMENTO', 'CANCELADA'],
  EM_ATENDIMENTO: ['AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_ATENDIMENTO', 'CONCLUIDA', 'CANCELADA'],
};

const SERVICE_TYPES = ['MANUTENCAO', 'INSTALACAO', 'LIMPEZA', 'RECARGA', 'CONSERTO', 'VISITA'];

export const ServiceOrdersPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [partModal, setPartModal] = useState(false);
  const [form, setForm] = useState({
    customerId: '', clientName: '', phone: '', address: '', equipmentId: '', equipmentDesc: '',
    serviceType: 'MANUTENCAO', reportedProblem: '', technicianId: '', technicianName: '',
    scheduledAt: '', labor: '', travel: '', discount: '', notes: '',
  });
  const [partForm, setPartForm] = useState({ productId: '', partName: '', quantity: '1', unitPrice: '' });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['service-orders', slug, status],
    queryFn: () => apiGet('/service-orders/orders', { status, search: search || undefined }),
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ['service-order', slug, detailId],
    queryFn: () => apiGet(`/service-orders/orders/${detailId}`),
    enabled: Boolean(detailId),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['tenant-customers', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/customers`),
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['service-technicians', slug],
    queryFn: () => apiGet('/service-orders/technicians'),
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['service-equipment', slug],
    queryFn: () => apiGet('/service-orders/equipment'),
  });

  const { data: productsData } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
  });
  const products = productsData?.products || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['service-orders', slug] });
    queryClient.invalidateQueries({ queryKey: ['service-dashboard', slug] });
    if (detailId) refetchDetail();
  };

  const parseMoney = (v: string) => {
    const n = Number(String(v || '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost('/service-orders/orders', payload),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('OS criada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao criar OS'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, st }: any) => apiPatch(`/service-orders/orders/${id}/status`, { status: st }),
    onSuccess: (_: any, vars: any) => {
      invalidate();
      toast.success(vars.st === 'CONCLUIDA' ? 'OS concluída e cobrança lançada no Financeiro!' : `OS → ${ST[vars.st]?.label || vars.st}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao avançar status'),
  });

  const fieldMutation = useMutation({
    mutationFn: ({ id, patch }: any) => apiPatch(`/service-orders/orders/${id}`, patch),
    onSuccess: () => {
      invalidate();
      toast.success('OS atualizada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar'),
  });

  const partMutation = useMutation({
    mutationFn: ({ id, payload }: any) => apiPost(`/service-orders/orders/${id}/parts`, payload),
    onSuccess: () => {
      invalidate();
      setPartModal(false);
      setPartForm({ productId: '', partName: '', quantity: '1', unitPrice: '' });
      toast.success('Peça lançada com baixa no estoque!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao lançar peça'),
  });

  const [diag, setDiag] = useState('');
  const [done, setDone] = useState('');

  const openDetail = (id: string) => {
    setDetailId(id);
    setDiag('');
    setDone('');
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    if (file.size > 1_500_000) return toast.error('Foto muito grande (máx 1,5MB).');
    const reader = new FileReader();
    reader.onload = () => {
      const current: string[] = detail.photos || [];
      if (current.length >= 3) return toast.error('Máximo de 3 fotos por OS.');
      fieldMutation.mutate({ id: detail.id, patch: { photos: [...current, String(reader.result)] } });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-sky-600" /> Ordens de Serviço
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Do chamado à conclusão: técnico, peças, fotos e valor.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="w-4 h-4 mr-2" /> Nova OS
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, endereço ou número..." className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          {['ALL', 'ABERTA', 'AGENDADA', 'EM_ATENDIMENTO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border min-h-[44px] ${status === s ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200'}`}
            >
              {s === 'ALL' ? 'Todas' : ST[s]?.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden">
        {isLoading ? (
          <TableRowSkeleton />
        ) : orders.length === 0 ? (
          <ErpEmptyState icon={Snowflake} title="Nenhuma OS" description="Abra a primeira ordem de serviço." />
        ) : (
          <div className="divide-y divide-zinc-100">
            {orders.map((o: any) => (
              <button key={o.id} onClick={() => openDetail(o.id)} className="w-full flex items-center gap-3 p-4 hover:bg-zinc-50/60 text-left">
                <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-800 font-black flex items-center justify-center shrink-0">
                  #{o.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-zinc-900 truncate">{o.clientName} • {o.serviceType}</div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {o.technicianName ? `${o.technicianName} • ` : ''}{o.scheduledAt ? fmtDT(o.scheduledAt) : 'Sem agendamento'} • {brl(o.totalCents)}
                  </div>
                </div>
                <Badge className={ST[o.status]?.cls}>{ST[o.status]?.label || o.status}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nova OS */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova ordem de serviço</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold">Cliente (cadastro)</label>
              <select
                value={form.customerId}
                onChange={(e) => {
                  const c = (customers || []).find((x: any) => x.id === e.target.value);
                  setForm({ ...form, customerId: e.target.value, clientName: c?.name || '', phone: c?.phone || form.phone });
                }}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]"
              >
                <option value="">Avulso / digitar...</option>
                {(customers || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Nome do cliente *</label>
              <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Endereço</label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold">Tipo de serviço</label>
              <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Equipamento</label>
              <select value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]">
                <option value="">Descrever abaixo...</option>
                {(equipment || []).map((x: any) => (
                  <option key={x.id} value={x.id}>{x.type} {x.brand || ''} {x.capacity || ''} — {x.clientName || x.customer?.name || ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Equip. (descrição livre)</label>
              <Input value={form.equipmentDesc} onChange={(e) => setForm({ ...form, equipmentDesc: e.target.value })} placeholder="Split 12000 BTUs Samsung" />
            </div>
            <div>
              <label className="text-xs font-semibold">Técnico</label>
              <select
                value={form.technicianId}
                onChange={(e) => {
                  const t = (technicians || []).find((x: any) => x.id === e.target.value);
                  setForm({ ...form, technicianId: e.target.value, technicianName: t?.name || '' });
                }}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]"
              >
                <option value="">A definir...</option>
                {(technicians || []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Agendar para</label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Problema relatado</label>
              <Input value={form.reportedProblem} onChange={(e) => setForm({ ...form, reportedProblem: e.target.value })} placeholder="Não gela, faz barulho..." />
            </div>
            <div>
              <label className="text-xs font-semibold">Mão de obra (R$)</label>
              <Input value={form.labor} onChange={(e) => setForm({ ...form, labor: e.target.value })} placeholder="150,00" inputMode="decimal" />
            </div>
            <div>
              <label className="text-xs font-semibold">Deslocamento (R$)</label>
              <Input value={form.travel} onChange={(e) => setForm({ ...form, travel: e.target.value })} placeholder="30,00" inputMode="decimal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700"
              disabled={createMutation.isPending}
              onClick={() => {
                if (!form.clientName.trim() && !form.customerId) return toast.error('Informe o cliente');
                createMutation.mutate({
                  customerId: form.customerId || undefined,
                  clientName: form.clientName,
                  phone: form.phone || undefined,
                  address: form.address || undefined,
                  equipmentId: form.equipmentId || undefined,
                  equipmentDesc: form.equipmentDesc || undefined,
                  serviceType: form.serviceType,
                  reportedProblem: form.reportedProblem || undefined,
                  technicianId: form.technicianId || undefined,
                  technicianName: form.technicianName || undefined,
                  scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
                  laborCents: parseMoney(form.labor),
                  travelCents: parseMoney(form.travel),
                  discountCents: parseMoney(form.discount),
                });
              }}
            >
              Abrir OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe / execução */}
      <Dialog open={Boolean(detailId)} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>OS #{detail?.number} — {detail?.clientName}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={ST[detail.status]?.cls}>{ST[detail.status]?.label}</Badge>
                <span className="text-xs text-zinc-500">{detail.serviceType} • {brl(detail.totalCents)}</span>
              </div>

              {(NEXT[detail.status] || []).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {(NEXT[detail.status] || []).map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      className={st === 'CONCLUIDA' ? 'bg-emerald-600 hover:bg-emerald-700' : st === 'CANCELADA' ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'}
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: detail.id, st })}
                    >
                      {st === 'CONCLUIDA' ? 'Concluir + cobrar' : ST[st]?.label}
                    </Button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-zinc-50 rounded-xl p-3">
                  <div className="font-bold mb-1">Problema relatado</div>
                  <div className="text-zinc-600">{detail.reportedProblem || '—'}</div>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3">
                  <div className="font-bold mb-1">Equipamento</div>
                  <div className="text-zinc-600">{detail.equipment ? `${detail.equipment.type} ${detail.equipment.brand || ''} ${detail.equipment.capacity || ''}` : detail.equipmentDesc || '—'}</div>
                  <div className="text-zinc-500 mt-1">{detail.address || ''}</div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">DIAGNÓSTICO DO TÉCNICO</label>
                <div className="flex gap-2 mt-1">
                  <Input key={`${detail.id}-diag`} defaultValue={detail.diagnosis || ''} onChange={(e) => setDiag(e.target.value)} placeholder="Ex: capacitor fraco, gás baixo..." />
                  <Button size="sm" onClick={() => fieldMutation.mutate({ id: detail.id, patch: { diagnosis: diag } })}>Salvar</Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">SERVIÇO REALIZADO</label>
                <div className="flex gap-2 mt-1">
                  <Input key={`${detail.id}-done`} defaultValue={detail.performedService || ''} onChange={(e) => setDone(e.target.value)} placeholder="Ex: troca do capacitor + recarga..." />
                  <Button size="sm" onClick={() => fieldMutation.mutate({ id: detail.id, patch: { performedService: done } })}>Salvar</Button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold">PEÇAS UTILIZADAS ({brl(detail.partsCents)})</label>
                  {['ABERTA', 'AGENDADA', 'EM_ATENDIMENTO', 'AGUARDANDO_PECA'].includes(detail.status) && (
                    <Button size="sm" variant="outline" onClick={() => setPartModal(true)}>
                      <PackagePlus className="w-3.5 h-3.5 mr-1" /> Lançar peça
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  {(detail.items || []).length === 0 && <div className="text-xs text-zinc-400">Nenhuma peça lançada.</div>}
                  {(detail.items || []).map((it: any) => (
                    <div key={it.id} className="flex items-center gap-2 text-xs bg-zinc-50 rounded-lg px-3 py-2">
                      <span className="flex-1 font-semibold">{it.partName} × {it.quantity}</span>
                      <span>{brl(it.totalCents)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">FOTOS DO SERVIÇO ({(detail.photos || []).length}/3)</label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(detail.photos || []).map((p: string, i: number) => (
                    <img key={i} src={p} alt={`OS ${detail.number} foto ${i + 1}`} className="w-20 h-20 rounded-xl object-cover border" />
                  ))}
                  {(detail.photos || []).length < 3 && ['ABERTA', 'AGENDADA', 'EM_ATENDIMENTO', 'AGUARDANDO_PECA'].includes(detail.status) && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-zinc-400 cursor-pointer min-w-[80px] min-h-[80px]">
                      <Camera className="w-5 h-5" />
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                    </label>
                  )}
                </div>
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs grid grid-cols-2 gap-1">
                <span>Mão de obra: <b>{brl(detail.laborCents)}</b></span>
                <span>Peças: <b>{brl(detail.partsCents)}</b></span>
                <span>Deslocamento: <b>{brl(detail.travelCents)}</b></span>
                <span>Desconto: <b>{brl(detail.discountCents)}</b></span>
                <span className="col-span-2 text-sm">Total: <b>{brl(detail.totalCents)}</b></span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Carregando OS...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lançar peça */}
      <Dialog open={partModal} onOpenChange={setPartModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançar peça na OS #{detail?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold">Peça do estoque</label>
              <select
                value={partForm.productId}
                onChange={(e) => {
                  const p = products.find((x: any) => x.id === e.target.value);
                  setPartForm({ ...partForm, productId: e.target.value, partName: p?.name || '', unitPrice: p ? (p.salePriceCents / 100).toFixed(2).replace('.', ',') : partForm.unitPrice });
                }}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white min-h-[48px]"
              >
                <option value="">Avulsa / digitar...</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} (est: {p.stockQuantity})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Nome da peça</label>
              <Input value={partForm.partName} onChange={(e) => setPartForm({ ...partForm, partName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold">Qtd</label>
                <Input value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} inputMode="decimal" />
              </div>
              <div>
                <label className="text-xs font-semibold">Preço un. (R$)</label>
                <Input value={partForm.unitPrice} onChange={(e) => setPartForm({ ...partForm, unitPrice: e.target.value })} inputMode="decimal" disabled={Boolean(partForm.productId)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartModal(false)}>Cancelar</Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700"
              disabled={partMutation.isPending}
              onClick={() => {
                if (!partForm.partName.trim() && !partForm.productId) return toast.error('Informe a peça');
                partMutation.mutate({
                  id: detail.id,
                  payload: {
                    productId: partForm.productId || undefined,
                    partName: partForm.partName,
                    quantity: Number(String(partForm.quantity).replace(',', '.')) || 0,
                    unitPriceCents: parseMoney(partForm.unitPrice),
                  },
                });
              }}
            >
              Lançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceOrdersPage;
