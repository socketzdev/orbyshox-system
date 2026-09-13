import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Truck,
  Link as LinkIcon,
  Plus,
  Sparkles,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  CossPanel,
  CossBadge,
  CossTable,
  CossTableHeader,
  CossTableBody,
  CossTableRow,
  CossTableHead,
  CossTableCell,
  CossEmpty,
  CossLabel,
  CossInput,
} from '@/components/coss-ui';
import { PageLoader } from '@/components/ui/page-loader';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTenant } from '../context/tenant-context';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

interface NfeItem {
  id: string;
  cProd: string;
  xProd: string;
  cEAN: string | null;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  productId: string | null;
  reconciliationType: string | null;
  product: { id: string; name: string } | null;
}

interface NfeEntry {
  id: string;
  accessKey: string;
  nfeNumber: string;
  series: string;
  issueDate: string;
  totalCents: number;
  status: string;
  importedAt: string;
  supplier: { id: string; legalName: string; tradeName: string | null } | null;
  _count: { items: number; batches: number };
}


const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'neutral' | 'success' | 'outline'; className?: string }> = {
  PENDING_RECONCILE: { label: 'Pendente', variant: 'default', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  RECONCILED: { label: 'Conciliada', variant: 'default', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  STOCKED: { label: 'Estocada', variant: 'success' },
  CANCELED: { label: 'Cancelada', variant: 'outline' },
};

export const NfeListPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedNfeId, setSelectedNfeId] = useState<string | null>(null);

  const { data: nfes = [], isLoading } = useQuery<NfeEntry[]>({
    queryKey: ['nfe', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/nfe`),
  });

  const selectedNfe = useQuery<NfeEntry & { items: NfeItem[] }>({
    queryKey: ['nfe', slug, selectedNfeId],
    queryFn: () => apiGet(`/tenant-app/${slug}/nfe/${selectedNfeId}`),
    enabled: !!selectedNfeId,
  });

  const finalize = useMutation({
    mutationFn: (id: string) => apiPost(`/tenant-app/${slug}/nfe/${id}/finalize`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfe', slug] });
      queryClient.invalidateQueries({ queryKey: ['batches', slug] });
      toast.success('Estoque atualizado com sucesso!');
      setSelectedNfeId(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Falha ao efetivar'),
  });

  return (
    <div className="space-y-5 font-sans pb-12">
      <CossPanel className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">Notas Fiscais Eletrônicas</h2>
              <p className="text-xs text-zinc-500">Importe XMLs e mantenha o estoque atualizado.</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setImportOpen(true)}
            className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar XML
          </Button>
        </div>
      </CossPanel>

      {isLoading ? (
        <PageLoader label="Carregando NF-e..." />
      ) : nfes.length === 0 ? (
        <CossPanel>
          <CossEmpty
            icon={<FileText className="w-5 h-5" />}
            title="Nenhuma NF-e importada"
            description="Faça upload do arquivo XML emitido pelo seu fornecedor. O sistema lê automaticamente os produtos, atualiza o custo e cria os lotes com data de validade."
            action={
              <Button
                size="sm"
                onClick={() => setImportOpen(true)}
                className="h-9 px-3.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar primeiro XML
              </Button>
            }
          />
        </CossPanel>
      ) : (
        <CossPanel className="p-0 overflow-hidden">
          <CossTable>
            <CossTableHeader>
              <tr>
                <CossTableHead>NF-e</CossTableHead>
                <CossTableHead>Fornecedor</CossTableHead>
                <CossTableHead>Emissão</CossTableHead>
                <CossTableHead className="text-center">Itens</CossTableHead>
                <CossTableHead className="text-right">Total</CossTableHead>
                <CossTableHead className="text-center">Status</CossTableHead>
                <CossTableHead className="text-right">Ações</CossTableHead>
              </tr>
            </CossTableHeader>
            <CossTableBody>
              {nfes.map((n) => {
                const s = STATUS_LABELS[n.status] || STATUS_LABELS.PENDING_RECONCILE;
                return (
                  <CossTableRow key={n.id}>
                    <CossTableCell>
                      <p className="font-mono font-bold text-zinc-900">#{n.nfeNumber}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate max-w-[180px]">{n.accessKey}</p>
                    </CossTableCell>
                    <CossTableCell>
                      {n.supplier ? (
                        <span className="text-xs text-zinc-800 font-medium">{n.supplier.tradeName || n.supplier.legalName}</span>
                      ) : (
                        <span className="text-[11px] text-zinc-400">Não identificado</span>
                      )}
                    </CossTableCell>
                    <CossTableCell>
                      <span className="text-xs text-zinc-700">{formatDate(n.issueDate)}</span>
                    </CossTableCell>
                    <CossTableCell className="text-center font-mono font-bold">{n._count.items}</CossTableCell>
                    <CossTableCell className="text-right font-mono font-bold text-zinc-900">
                      {formatCurrency(n.totalCents)}
                    </CossTableCell>
                    <CossTableCell className="text-center">
                      <CossBadge variant={s.variant} className={s.className}>{s.label}</CossBadge>
                    </CossTableCell>
                    <CossTableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedNfeId(n.id)}
                        className="h-7 px-2.5 text-[11px] rounded-lg border-zinc-200"
                      >
                        Conciliar
                      </Button>
                    </CossTableCell>
                  </CossTableRow>
                );
              })}
            </CossTableBody>
          </CossTable>
        </CossPanel>
      )}

      <NfeImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          setImportOpen(false);
          queryClient.invalidateQueries({ queryKey: ['nfe', slug] });
        }}
      />

      <NfeDetailDialog
        nfeId={selectedNfeId}
        nfe={selectedNfe.data}
        isLoading={selectedNfe.isLoading}
        onOpenChange={(open) => !open && setSelectedNfeId(null)}
        onReconcile={async (itemId, action, payload) => {
          await apiPatch(`/tenant-app/${slug}/nfe/${selectedNfeId}/reconcile/${itemId}`, { action, ...payload });
          queryClient.invalidateQueries({ queryKey: ['nfe', slug] });
          await selectedNfe.refetch();
          toast.success('Item conciliado');
        }}
        onFinalize={() => selectedNfeId && finalize.mutate(selectedNfeId)}
        finalizing={finalize.isPending}
      />
    </div>
  );
};

interface NfeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const NfeImportDialog: React.FC<NfeImportDialogProps> = ({ open, onOpenChange, onSuccess }) => {
  const { slug } = useTenant();
  const [xmlContent, setXmlContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setXmlContent(text);
    toast.success(`Arquivo "${file.name}" carregado (${(file.size / 1024).toFixed(1)} KB)`);
  };

  const submit = async () => {
    if (!xmlContent || xmlContent.length < 200) {
      toast.error('XML vazio ou inválido');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiPost(`/tenant-app/${slug}/nfe/import`, { xml: xmlContent });
      toast.success('NF-e importada!');
      setXmlContent('');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Falha ao importar XML');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white rounded-3xl p-6 border-zinc-200">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            Importar XML de NF-e
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Cole o conteúdo do XML ou selecione o arquivo do seu fornecedor.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-24 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50 transition flex flex-col items-center justify-center gap-1.5 text-zinc-500 hover:text-zinc-700"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs font-semibold">Clique para selecionar o arquivo XML</span>
            <span className="text-[10px] text-zinc-400">Tamanho máximo recomendado: 5MB</span>
          </button>
          <div className="space-y-1.5">
            <CossLabel>Ou cole o conteúdo do XML</CossLabel>
            <textarea
              value={xmlContent}
              onChange={(e) => setXmlContent(e.target.value)}
              placeholder="<nfeProc>...</nfeProc>"
              className="w-full h-32 rounded-xl border border-zinc-200 p-3 text-[11px] font-mono resize-none focus:outline-none focus:border-zinc-900"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs rounded-xl">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={isSubmitting || !xmlContent}
            className="bg-zinc-900 text-white text-xs font-bold rounded-xl gap-1.5"
          >
            {isSubmitting ? 'Importando...' : 'Importar e Conciliar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface NfeDetailDialogProps {
  nfeId: string | null;
  nfe: (NfeEntry & { items: NfeItem[] }) | undefined;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onReconcile: (itemId: string, action: 'LINK_EXISTING' | 'CREATE_NEW', payload: any) => Promise<void>;
  onFinalize: () => void;
  finalizing: boolean;
}

const NfeDetailDialog: React.FC<NfeDetailDialogProps> = ({
  nfeId,
  nfe,
  isLoading,
  onOpenChange,
  onReconcile,
  onFinalize,
  finalizing,
}) => {
  const { slug } = useTenant();
  const [reconcilingItem, setReconcilingItem] = useState<NfeItem | null>(null);
  const [action, setAction] = useState<'LINK_EXISTING' | 'CREATE_NEW'>('LINK_EXISTING');
  const [search, setSearch] = useState('');

  const { data: rawProductsData } = useQuery<any>({
    queryKey: ['products-search', slug, search],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
    enabled: !!reconcilingItem && action === 'LINK_EXISTING',
  });

  const products: Array<{ id: string; name: string; barcode: string | null }> = useMemo(() => {
    if (Array.isArray(rawProductsData)) return rawProductsData;
    if (rawProductsData && Array.isArray(rawProductsData.products)) return rawProductsData.products;
    return [];
  }, [rawProductsData]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) =>
      !search ? true : p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search),
    );
  }, [products, search]);

  if (!nfeId) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white rounded-3xl p-6 border-zinc-200 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            NF-e #{nfe?.nfeNumber} · Conciliação
          </DialogTitle>
        </DialogHeader>
        {isLoading || !nfe ? (
          <PageLoader label="Carregando NF-e..." className="py-8" />
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Info label="Fornecedor" value={nfe.supplier?.tradeName || nfe.supplier?.legalName || '—'} />
              <Info label="Emissão" value={formatDate(nfe.issueDate)} />
              <Info label="Total" value={formatCurrency(nfe.totalCents)} mono />
              <Info label="Status" value={STATUS_LABELS[nfe.status]?.label || nfe.status} />
            </div>

            <CossPanel className="p-0 overflow-hidden">
              <CossTable>
                <CossTableHeader>
                  <tr>
                    <CossTableHead>Produto da NF-e</CossTableHead>
                    <CossTableHead className="text-center">Qtd</CossTableHead>
                    <CossTableHead className="text-right">Custo</CossTableHead>
                    <CossTableHead>Vinculado a</CossTableHead>
                    <CossTableHead className="text-right">Ação</CossTableHead>
                  </tr>
                </CossTableHeader>
                <CossTableBody>
                  {nfe.items.map((item) => (
                    <CossTableRow key={item.id}>
                      <CossTableCell>
                        <p className="font-bold text-zinc-900 text-xs truncate max-w-[260px]">{item.xProd}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">
                          {item.cEAN && item.cEAN !== 'SEM GTIN' ? `EAN: ${item.cEAN}` : `Cód: ${item.cProd}`}
                        </p>
                      </CossTableCell>
                      <CossTableCell className="text-center font-mono">
                        {item.qCom} {item.uCom}
                      </CossTableCell>
                      <CossTableCell className="text-right font-mono font-semibold">
                        {formatCurrency(item.vUnCom)}
                      </CossTableCell>
                      <CossTableCell>
                        {item.product ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="text-xs font-medium text-zinc-800 truncate max-w-[180px]">{item.product.name}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-700 font-bold">Pendente</span>
                        )}
                      </CossTableCell>
                      <CossTableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setReconcilingItem(item);
                            setAction('LINK_EXISTING');
                            setSearch('');
                          }}
                          className="text-[10px] font-bold text-zinc-700 hover:bg-zinc-100 px-2 py-1 rounded-lg transition flex items-center gap-1 ml-auto"
                        >
                          <LinkIcon className="w-3 h-3" />
                          Vincular
                        </button>
                      </CossTableCell>
                    </CossTableRow>
                  ))}
                </CossTableBody>
              </CossTable>
            </CossPanel>

            {nfe.status === 'RECONCILED' && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">
                    Todos os itens conciliados. Pronto para efetivar a entrada no estoque.
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={onFinalize}
                  disabled={finalizing}
                  className="h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                >
                  <ArrowRight className="w-3.5 h-3.5 mr-1" />
                  {finalizing ? 'Efetivando...' : 'Efetivar Estoque'}
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="pt-2 border-t border-zinc-100">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs rounded-xl">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={!!reconcilingItem} onOpenChange={(o) => !o && setReconcilingItem(null)}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-zinc-900">Vincular item</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 truncate">{reconcilingItem?.xProd}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction('LINK_EXISTING')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                  action === 'LINK_EXISTING' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5 inline mr-1" /> Vincular existente
              </button>
              <button
                type="button"
                onClick={() => setAction('CREATE_NEW')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                  action === 'CREATE_NEW' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" /> Criar novo
              </button>
            </div>
            {action === 'LINK_EXISTING' ? (
              <div className="space-y-2">
                <CossInput
                  placeholder="Buscar produto pelo nome ou EAN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-60 overflow-y-auto space-y-1 rounded-xl border border-zinc-200 p-1">
                  {filteredProducts.slice(0, 20).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (reconcilingItem) {
                          onReconcile(reconcilingItem.id, 'LINK_EXISTING', { productId: p.id });
                          setReconcilingItem(null);
                        }
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-zinc-50 transition"
                    >
                      <p className="text-xs font-semibold text-zinc-800">{p.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">{p.barcode || 'sem EAN'}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <p className="text-xs text-zinc-600">
                  Será criado um novo produto com o nome da NF-e e custo de{' '}
                  <strong className="font-mono text-zinc-900">
                    {reconcilingItem && formatCurrency(reconcilingItem.vUnCom)}
                  </strong>{' '}
                  + 40% de margem.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReconcilingItem(null)} className="text-xs rounded-xl">
              Cancelar
            </Button>
            {action === 'CREATE_NEW' && (
              <Button
                size="sm"
                onClick={() => {
                  if (reconcilingItem) {
                    onReconcile(reconcilingItem.id, 'CREATE_NEW', { name: reconcilingItem.xProd });
                    setReconcilingItem(null);
                  }
                }}
                className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
              >
                Criar produto
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

const Info: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold block">{label}</span>
    <span className={`text-xs text-zinc-800 font-semibold ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);
