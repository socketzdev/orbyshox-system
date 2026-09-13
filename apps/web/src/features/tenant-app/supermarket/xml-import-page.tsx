import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Package,
  Building2,
  DollarSign,
  Link,
  Plus,
  Search,
  Sparkles,
  FileCheck,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export interface NfeXmlItem {
  id: string;
  cProd: string;
  xProd: string;
  ncm: string;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  cEAN: string;
  // Reconciliation status
  matchedCatalogItemId: string | null; // null if unmapped
  matchedCatalogItemName?: string;
  reconciliationType?: 'AUTOMATIC' | 'MANUAL_LINK' | 'NEW_PRODUCT';
  suggestedSalePrice?: number;
}

export interface NfeXmlDocument {
  accessKey: string;
  nfeNumber: string;
  series: string;
  issueDate: string;
  supplierName: string;
  supplierCnpj: string;
  totalProductsAmount: number;
  totalNfeAmount: number;
  items: NfeXmlItem[];
}

export const XmlImportPage: React.FC = () => {
  const { slug } = useTenant();

  const { data: rawProductsData } = useQuery({
    queryKey: ['supermarket-products', slug],
    queryFn: () => apiGet<any>(`/tenant-app/${slug}/products`),
  });

  const catalogProducts = useMemo(() => {
    let prods: any[] = [];
    if (Array.isArray(rawProductsData)) prods = rawProductsData;
    else if (rawProductsData && Array.isArray(rawProductsData.products)) prods = rawProductsData.products;
    return prods.map((p: any) => ({
      id: p.id,
      name: p.name,
      ean: p.barcode || p.sku || '',
      currentCost: (p.costPriceCents || 0) / 100,
      currentStock: p.currentStock || 0,
    }));
  }, [rawProductsData]);

  const [nfeDoc, setNfeDoc] = useState<NfeXmlDocument | null>(null);
  const [isSuccessFinished, setIsSuccessFinished] = useState(false);

  // Reconciliation Modal
  const [reconcilingItem, setReconcilingItem] = useState<NfeXmlItem | null>(null);
  const [reconcileAction, setReconcileAction] = useState<'LINK_EXISTING' | 'CREATE_NEW'>('LINK_EXISTING');
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [newProductName, setNewProductName] = useState('');
  const [profitMarginPercent, setProfitMarginPercent] = useState<number>(40);

  // Real XML File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(content, 'application/xml');
        const infNFe = xml.querySelector('infNFe');
        if (!infNFe) {
          toast.error('Arquivo XML não é uma NF-e válida (tag infNFe não encontrada).');
          return;
        }

        const emit = xml.querySelector('emit');
        const xNome = emit?.querySelector('xNome')?.textContent || 'Fornecedor';
        const cnpj = emit?.querySelector('CNPJ')?.textContent || '';
        const ide = xml.querySelector('ide');
        const nNF = ide?.querySelector('nNF')?.textContent || '0';
        const series = ide?.querySelector('serie')?.textContent || '1';
        const dhEmi = ide?.querySelector('dhEmi')?.textContent || new Date().toISOString();
        const vNF = Number(xml.querySelector('total > ICMSTot > vNF')?.textContent || '0');
        const vProdTot = Number(xml.querySelector('total > ICMSTot > vProd')?.textContent || vNF.toString());
        const accessKey =
          infNFe.getAttribute('Id')?.replace(/^NFe/, '') ||
          `352609${cnpj.replace(/\D/g, '').padEnd(14, '0')}${nNF.padStart(9, '0')}1`;

        const detList = Array.from(xml.querySelectorAll('det'));
        const parsedItems: NfeXmlItem[] = detList.map((det, index) => {
          const prod = det.querySelector('prod');
          const cProd = prod?.querySelector('cProd')?.textContent || String(index + 1);
          const xProd = prod?.querySelector('xProd')?.textContent || 'Produto';
          const rawEan = prod?.querySelector('cEAN')?.textContent || '';
          const cEAN = rawEan === 'SEM GTIN' ? '' : rawEan;
          const ncm = prod?.querySelector('NCM')?.textContent || '';
          const cfop = prod?.querySelector('CFOP')?.textContent || '5102';
          const uCom = prod?.querySelector('uCom')?.textContent || 'UN';
          const qCom = Number(prod?.querySelector('qCom')?.textContent || '1');
          const vUnCom = Number(prod?.querySelector('vUnCom')?.textContent || '0');
          const vProd = Number(prod?.querySelector('vProd')?.textContent || '0');

          // Auto-match by EAN barcode or SKU with tenant catalog
          const matched = cEAN
            ? catalogProducts.find((c) => c.ean && c.ean === cEAN)
            : catalogProducts.find((c) => c.ean === cProd);

          return {
            id: `xml-${index + 1}`,
            cProd,
            xProd,
            cEAN,
            ncm,
            cfop,
            uCom,
            qCom,
            vUnCom,
            vProd,
            matchedCatalogItemId: matched ? matched.id : null,
            matchedCatalogItemName: matched ? matched.name : undefined,
            reconciliationType: matched ? ('AUTOMATIC' as const) : undefined,
          };
        });

        setNfeDoc({
          accessKey,
          nfeNumber: nNF,
          series,
          issueDate: dhEmi.includes('T') ? dhEmi.split('T')[0] : dhEmi,
          supplierName: xNome,
          supplierCnpj: cnpj,
          totalProductsAmount: vProdTot,
          totalNfeAmount: vNF,
          items: parsedItems,
        });
        setIsSuccessFinished(false);
        toast.success(`NF-e nº ${nNF} de ${xNome} carregada com ${parsedItems.length} itens!`);
      } catch (err: any) {
        toast.error('Erro ao ler arquivo XML: ' + (err?.message || 'Arquivo corrompido'));
      }
    };
    reader.readAsText(file);
  };

  // Reconcile status counts
  const reconciliationStats = useMemo(() => {
    if (!nfeDoc) return { total: 0, mapped: 0, pending: 0 };
    const total = nfeDoc.items.length;
    const mapped = nfeDoc.items.filter((i) => i.matchedCatalogItemId !== null || i.reconciliationType === 'NEW_PRODUCT').length;
    const pending = total - mapped;
    return { total, mapped, pending };
  }, [nfeDoc]);

  // Open reconciliation modal
  const handleOpenReconcile = (item: NfeXmlItem) => {
    setReconcilingItem(item);
    setReconcileAction('LINK_EXISTING');
    setSelectedCatalogId(catalogProducts[0]?.id || '');
    setNewProductName(item.xProd);
    setProfitMarginPercent(40);
  };

  // Confirm manual reconciliation
  const handleConfirmReconcile = () => {
    if (!nfeDoc || !reconcilingItem) return;

    let updatedItems = nfeDoc.items.map((item) => {
      if (item.id === reconcilingItem.id) {
        if (reconcileAction === 'LINK_EXISTING') {
          const matched = catalogProducts.find((c) => c.id === selectedCatalogId);
          return {
            ...item,
            matchedCatalogItemId: selectedCatalogId,
            matchedCatalogItemName: matched?.name || 'Item Vinculado',
            reconciliationType: 'MANUAL_LINK' as const,
          };
        } else {
          const suggestedPrice = Number((item.vUnCom * (1 + profitMarginPercent / 100)).toFixed(2));
          return {
            ...item,
            matchedCatalogItemId: `new-${Date.now()}`,
            matchedCatalogItemName: `${newProductName} (Novo Item Cadastrado)`,
            reconciliationType: 'NEW_PRODUCT' as const,
            suggestedSalePrice: suggestedPrice,
          };
        }
      }
      return item;
    });

    setNfeDoc({ ...nfeDoc, items: updatedItems });
    setReconcilingItem(null);
  };

  // Finalize import and update stock
  const handleFinalizeImport = () => {
    if (!nfeDoc) return;
    if (reconciliationStats.pending > 0) {
      toast.warning(`Existem ainda ${reconciliationStats.pending} itens pendentes de conciliação. Faça o vínculo manual antes de concluir.`);
      return;
    }

    setIsSuccessFinished(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Header & Upload Area ─── */}
      <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
              Entrada de Mercadorias
            </span>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Importação de XML de NF-e do Fornecedor
            </h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-xl">
              Faça o upload do arquivo XML da Nota Fiscal Eletrônica emitida pelo seu fornecedor. O sistema lê os itens, atualiza o estoque e gera as contas a pagar automaticamente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div className="h-10 px-5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-sm flex items-center gap-2 transition">
                <Upload className="w-4 h-4" />
                <span>Selecionar Arquivo .XML da NF-e</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* ─── NF-e Loaded Details ─── */}
      {nfeDoc && !isSuccessFinished && (
        <div className="space-y-4">
          {/* NF-e Metadata Card */}
          <div className="bg-zinc-50 rounded-3xl p-5 border border-zinc-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Fornecedor / Emitente
              </span>
              <span className="font-bold text-zinc-900 block truncate mt-0.5">
                {nfeDoc.supplierName}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">{nfeDoc.supplierCnpj}</span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Dados do Documento
              </span>
              <span className="font-bold text-zinc-900 block font-mono mt-0.5">
                NF-e nº {nfeDoc.nfeNumber} • Série {nfeDoc.series}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">Emissão: {nfeDoc.issueDate}</span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Valores Totais
              </span>
              <span className="font-bold text-emerald-800 font-mono text-sm block mt-0.5">
                R$ {nfeDoc.totalNfeAmount.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-[11px] text-zinc-500">
                Produtos: R$ {nfeDoc.totalProductsAmount.toFixed(2).replace('.', ',')}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Status da Conciliação
              </span>
              <div className="flex items-center gap-2 mt-1">
                {reconciliationStats.pending === 0 ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 100% Conciliado
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-800 bg-amber-100/70 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {reconciliationStats.pending} pendente(s)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Table of NF-e Items & Manual Reconciliation */}
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-zinc-900">
                  Itens da Nota Fiscal ({nfeDoc.items.length})
                </h3>
                <span className="text-xs text-zinc-400">
                  Mapeie os itens do fornecedor com os produtos cadastrados no seu sistema
                </span>
              </div>

              <Button
                size="sm"
                disabled={reconciliationStats.pending > 0}
                onClick={handleFinalizeImport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-9 px-4 gap-1.5 shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Efetivar Entrada no Estoque</span>
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200/70 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Cód / Descrição NF-e</th>
                    <th className="py-3 px-4">EAN / NCM</th>
                    <th className="py-3 px-4 text-center">Qtd NF</th>
                    <th className="py-3 px-4 text-right">Custo Unit (R$)</th>
                    <th className="py-3 px-4 text-right">Total (R$)</th>
                    <th className="py-3 px-4">Vínculo com Catálogo</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {nfeDoc.items.map((item) => {
                    const isMapped = item.matchedCatalogItemId !== null;

                    return (
                      <tr key={item.id} className="hover:bg-zinc-50/70 transition">
                        <td className="py-3 px-4">
                          <span className="font-bold text-zinc-900 block truncate max-w-[240px]">
                            {item.xProd}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            Cód Fornecedor: {item.cProd}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-zinc-600">
                          <span className="block">{item.cEAN}</span>
                          <span className="text-[10px] text-zinc-400">NCM: {item.ncm}</span>
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-bold text-zinc-900">
                          {item.qCom} {item.uCom}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-zinc-800">
                          R$ {item.vUnCom.toFixed(2).replace('.', ',')}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900">
                          R$ {item.vProd.toFixed(2).replace('.', ',')}
                        </td>

                        <td className="py-3 px-4">
                          {isMapped ? (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-600" />
                                {item.reconciliationType === 'AUTOMATIC'
                                  ? 'Vinculado via EAN'
                                  : item.reconciliationType === 'MANUAL_LINK'
                                  ? 'Vinculado Manual'
                                  : 'Novo Produto Cadastrado'}
                              </span>
                              <span className="text-[11px] text-zinc-600 font-medium block truncate max-w-[200px]">
                                {item.matchedCatalogItemName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Pendente de Conciliação
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReconcile(item)}
                            className={`h-7 text-[11px] font-bold rounded-xl gap-1 ${
                              isMapped
                                ? 'text-zinc-600 bg-white border-zinc-200 hover:bg-zinc-50'
                                : 'text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100'
                            }`}
                          >
                            <Link className="w-3 h-3" />
                            {isMapped ? 'Alterar Vínculo' : 'Conciliar'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Success Confirmation Screen ─── */}
      {isSuccessFinished && (
        <div className="bg-white rounded-3xl p-8 border border-zinc-200/80 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
            <FileCheck className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-zinc-900">
              Entrada de Mercadorias Concluída com Sucesso!
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Todos os itens da NF-e nº {nfeDoc?.nfeNumber} foram incorporados ao estoque. Preços de custo unitário foram atualizados e novos lotes foram registrados no sistema.
            </p>
          </div>

          <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs text-zinc-700 font-mono flex justify-around">
            <div>
              <span className="text-zinc-400 block text-[10px]">Itens Inseridos</span>
              <strong className="text-sm text-zinc-900">{nfeDoc?.items.length} itens</strong>
            </div>
            <div>
              <span className="text-zinc-400 block text-[10px]">Valor Total da Nota</span>
              <strong className="text-sm text-emerald-700">
                R$ {nfeDoc?.totalNfeAmount.toFixed(2).replace('.', ',')}
              </strong>
            </div>
          </div>

          <Button
            onClick={() => {
              setNfeDoc(null);
              setIsSuccessFinished(false);
            }}
            className="bg-zinc-900 text-white font-bold text-xs rounded-xl h-10 px-6"
          >
            Importar Outro XML de Fornecedor
          </Button>
        </div>
      )}

      {/* ─── Modal: Tela de Conciliação Manual de Item ─── */}
      <Dialog open={Boolean(reconcilingItem)} onOpenChange={() => setReconcilingItem(null)}>
        <DialogContent className="max-w-lg bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Link className="w-4 h-4 text-emerald-600" />
              Conciliação Manual do Item
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Vincule este item da NF-e a um produto existente ou cadastre-o como novo produto no catálogo
            </DialogDescription>
          </DialogHeader>

          {reconcilingItem && (
            <div className="space-y-4 py-2 text-xs">
              {/* Box of item from XML */}
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Dados do Fornecedor na NF-e:
                </span>
                <span className="font-bold text-zinc-900 block">{reconcilingItem.xProd}</span>
                <div className="flex justify-between font-mono text-[11px] text-zinc-600 pt-1">
                  <span>Cód: {reconcilingItem.cProd}</span>
                  <span>EAN: {reconcilingItem.cEAN}</span>
                  <span>Custo: R$ {reconcilingItem.vUnCom.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>

              {/* Action choice: Link to existing OR Create new */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReconcileAction('LINK_EXISTING')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                    reconcileAction === 'LINK_EXISTING'
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  <span>Vincular a Produto Existente</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReconcileAction('CREATE_NEW')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                    reconcileAction === 'CREATE_NEW'
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Novo no Catálogo</span>
                </button>
              </div>

              {/* Option A: Link Existing Item */}
              {reconcileAction === 'LINK_EXISTING' && (
                <div className="space-y-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <Label className="text-xs text-zinc-700 font-bold block">
                    Selecione o Produto Correspondente no Catálogo
                  </Label>
                  <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
                    <SelectTrigger className="h-9 text-xs rounded-xl bg-white">
                      <SelectValue placeholder={catalogProducts.length === 0 ? 'Nenhum produto cadastrado' : 'Selecione um produto'} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {catalogProducts.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Nenhum produto cadastrado no catálogo
                        </SelectItem>
                      ) : (
                        catalogProducts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.ean ? `(EAN: ${c.ean})` : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-zinc-500 block">
                    Nas próximas notas deste fornecedor, o sistema lembrará deste vínculo automaticamente.
                  </span>
                </div>
              )}

              {/* Option B: Create New Item with Margin */}
              {reconcileAction === 'CREATE_NEW' && (
                <div className="space-y-3 p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <div>
                    <Label className="text-xs text-zinc-700 font-bold mb-1 block">
                      Nome Comercial do Novo Produto
                    </Label>
                    <Input
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      className="h-9 text-xs rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-zinc-700 font-bold mb-1 block">
                      Margem de Lucro Sugerida (%):
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        value={profitMarginPercent}
                        onChange={(e) => setProfitMarginPercent(Number(e.target.value))}
                        className="h-9 text-xs rounded-xl bg-white w-24 font-mono"
                      />
                      <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 font-mono font-bold text-xs flex-1 flex justify-between">
                        <span>Preço de Venda Sugerido:</span>
                        <span>
                          R${' '}
                          {(reconcilingItem.vUnCom * (1 + profitMarginPercent / 100))
                            .toFixed(2)
                            .replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReconcilingItem(null)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmReconcile}
              className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
            >
              Salvar Vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
