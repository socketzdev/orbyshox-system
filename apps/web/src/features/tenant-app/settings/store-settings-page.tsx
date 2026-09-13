import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Store,
  Printer,
  ShieldCheck,
  FileCheck,
  Save,
  Lock,
  Percent,
  CheckCircle2,
  Tablet,
  Sliders,
  Plus,
  Trash2,
  Sparkles,
  Flame,
  Check,
  AlertCircle,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPut, apiPost, apiDelete } from '@/lib/api';
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

type SettingsTab = 'cadastral' | 'pos_fiscal' | 'self_order' | 'modifiers';

export const StoreSettingsPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SettingsTab>('modifiers');

  // Form State (Geral & Fiscal)
  const [storeName, setStoreName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [thermalPrinter, setThermalPrinter] = useState<'80mm' | '58mm' | 'DISABLED'>('80mm');
  const [maxCashierDiscount, setMaxCashierDiscount] = useState('10');
  const [managerPin, setManagerPin] = useState('1234');
  const [fiscalType, setFiscalType] = useState('SIMPLES_NACIONAL');
  const [nfceEnvironment, setNfceEnvironment] = useState<'HOMOLOGATION' | 'PRODUCTION'>('HOMOLOGATION');
  const [nfceCscId, setNfceCscId] = useState('');
  const [nfceCscToken, setNfceCscToken] = useState('');

  // Autoatendimento State
  const [tabletLandscape, setTabletLandscape] = useState(true);
  const [allowWaiterCall, setAllowWaiterCall] = useState(true);
  const [allowBillRequest, setAllowBillRequest] = useState(true);
  const [showTableBill, setShowTableBill] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState('Bem-vindo ao nosso restaurante! Faça seus pedidos direto pelo tablet.');

  // Modal State para Grupos de Modificadores
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [targetProductId, setTargetProductId] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [minSelectable, setMinSelectable] = useState(0);
  const [maxSelectable, setMaxSelectable] = useState(1);
  const [initialOptions, setInitialOptions] = useState<{ name: string; priceFormatted: string }[]>([
    { name: '', priceFormatted: '0,00' },
  ]);

  // Modal State para Adicionar Opção Avulsa
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [targetGroupIdForOption, setTargetGroupIdForOption] = useState<string | null>(null);
  const [optionName, setOptionName] = useState('');
  const [optionPriceFormatted, setOptionPriceFormatted] = useState('0,00');

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ['store-settings', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/settings/store`),
  });

  const { data: modifierGroupsData, refetch: refetchModifierGroups } = useQuery({
    queryKey: ['modifier-groups', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/modifier-groups`),
  });

  const { data: productsData } = useQuery({
    queryKey: ['tenant-products-simple', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
  });

  const modifierGroups = modifierGroupsData?.groups || [];
  const productsList = Array.isArray(productsData) ? productsData : productsData?.products || [];

  useEffect(() => {
    if (data) {
      setStoreName(data.storeName || '');
      setLegalName(data.legalName || '');
      setCnpj(data.cnpj || '');
      setStateRegistration(data.stateRegistration || '');
      setAddress(data.address || '');
      setPhone(data.phone || '');
      setThermalPrinter(data.thermalPrinter || '80mm');
      setMaxCashierDiscount(String(data.maxCashierDiscount ?? 10));
      setManagerPin(data.managerPin || '1234');
      setFiscalType(data.fiscalType || 'SIMPLES_NACIONAL');
      setNfceEnvironment(data.nfceEnvironment || 'HOMOLOGATION');
      setNfceCscId(data.nfceCscId || '');
      setNfceCscToken(data.nfceCscToken || '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) => apiPut(`/tenant-app/${slug}/settings/store`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings', slug] });
      toast.success('Configurações operacionais salvas com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao salvar configurações'),
  });

  // Mutações de Grupos de Modificadores
  const createGroupMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/modifier-groups`, payload),
    onSuccess: () => {
      refetchModifierGroups();
      setIsGroupModalOpen(false);
      resetGroupForm();
      toast.success('Grupo de personalização registrado com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao criar grupo de personalização'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiDelete(`/tenant-app/${slug}/modifier-groups/${groupId}`),
    onSuccess: () => {
      refetchModifierGroups();
      toast.success('Grupo de personalização removido.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir grupo'),
  });

  const addOptionMutation = useMutation({
    mutationFn: ({ groupId, payload }: { groupId: string; payload: any }) =>
      apiPost(`/tenant-app/${slug}/modifier-groups/${groupId}/items`, payload),
    onSuccess: () => {
      refetchModifierGroups();
      setIsOptionModalOpen(false);
      setOptionName('');
      setOptionPriceFormatted('0,00');
      toast.success('Opção adicionada com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao adicionar opção'),
  });

  const deleteOptionMutation = useMutation({
    mutationFn: ({ groupId, itemId }: { groupId: string; itemId: string }) =>
      apiDelete(`/tenant-app/${slug}/modifier-groups/${groupId}/items/${itemId}`),
    onSuccess: () => {
      refetchModifierGroups();
      toast.success('Opção removida.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir opção'),
  });

  const resetGroupForm = () => {
    setGroupName('');
    setTargetProductId(productsList[0]?.id || '');
    setIsRequired(false);
    setMinSelectable(0);
    setMaxSelectable(1);
    setInitialOptions([{ name: '', priceFormatted: '0,00' }]);
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      storeName,
      legalName,
      cnpj,
      stateRegistration,
      address,
      phone,
      thermalPrinter,
      maxCashierDiscount: parseInt(maxCashierDiscount, 10) || 10,
      managerPin,
      fiscalType,
      nfceEnvironment,
      nfceCscId,
      nfceCscToken,
    });
  };

  // Presets de 1 Clique com Textos Formais de Alta Gastronomia
  const applyPreset = (presetType: 'MEAT_DONENESS' | 'GARNISH' | 'SAUCES') => {
    if (productsList.length === 0) {
      return toast.error('Cadastre pelo menos 1 produto no cardápio antes de aplicar modelos.');
    }
    const targetProd = productsList[0];

    if (presetType === 'MEAT_DONENESS') {
      createGroupMutation.mutate({
        productId: targetProd.id,
        name: 'Especificação de Ponto & Cocção (Ponto da Carne)',
        minSelectable: 1,
        maxSelectable: 1,
        isRequired: true,
        items: [
          { name: 'Mal Passado (Centro avermelhado e suculento)', priceCents: 0 },
          { name: 'Ao Ponto (Centro rosado com maciez ideal)', priceCents: 0 },
          { name: 'Bem Passado (Cocção completa, tostado homogêneo)', priceCents: 0 },
        ],
      });
    } else if (presetType === 'GARNISH') {
      createGroupMutation.mutate({
        productId: targetProd.id,
        name: 'Guarnições & Acompanhamentos Especiais',
        minSelectable: 0,
        maxSelectable: 3,
        isRequired: false,
        items: [
          { name: 'Farofa Crocante de Castanhas Nobres', priceCents: 1400 },
          { name: 'Batatas Rústicas com Sal Grosso e Alecrim', priceCents: 1800 },
          { name: 'Shimeji Fresco Salteado na Manteiga da Fazenda', priceCents: 2200 },
        ],
      });
    } else if (presetType === 'SAUCES') {
      createGroupMutation.mutate({
        productId: targetProd.id,
        name: 'Molhos & Emulsões Artesanais',
        minSelectable: 0,
        maxSelectable: 2,
        isRequired: false,
        items: [
          { name: 'Chimichurri Tradicional com Azeite de Ervas', priceCents: 0 },
          { name: 'Redução Demi-Glace com Vinho Tinto', priceCents: 1200 },
          { name: 'Manteiga Aromatizada com Alho Confitado', priceCents: 900 },
        ],
      });
    }
  };

  const handleCreateCustomGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      return toast.error('Informe o nome do grupo de personalização');
    }
    const cleanItems = initialOptions
      .filter((opt) => opt.name.trim().length > 0)
      .map((opt) => ({
        name: opt.name.trim(),
        priceCents: Math.round(parseFloat(opt.priceFormatted.replace(',', '.')) * 100) || 0,
      }));

    createGroupMutation.mutate({
      productId: targetProductId || productsList[0]?.id,
      name: groupName.trim(),
      minSelectable: isRequired ? Math.max(1, minSelectable) : minSelectable,
      maxSelectable: Math.max(1, maxSelectable),
      isRequired,
      items: cleanItems,
    });
  };

  const handleAddOptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetGroupIdForOption || !optionName.trim()) {
      return toast.error('Informe o nome da opção');
    }
    const priceCents = Math.round(parseFloat(optionPriceFormatted.replace(',', '.')) * 100) || 0;
    addOptionMutation.mutate({
      groupId: targetGroupIdForOption,
      payload: { name: optionName.trim(), priceCents },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl pb-16">
      {/* Header Corporativo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
            <Settings className="w-4 h-4 text-zinc-700" />
            <span>Configurações do Sistema</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">
            Parâmetros & Personalização
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Gerencie dados cadastrais, operação fiscal, experiência do tablet de mesa e os modais dinâmicos do cardápio.
          </p>
        </div>

        {activeTab !== 'modifiers' ? (
          <Button
            onClick={handleSaveGeneral}
            disabled={saveMutation.isPending}
            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-5 text-xs font-bold flex items-center gap-2 shadow-sm shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>{saveMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}</span>
          </Button>
        ) : (
          <Button
            onClick={() => {
              resetGroupForm();
              setIsGroupModalOpen(true);
            }}
            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl h-10 px-5 text-xs font-bold flex items-center gap-2 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Grupo de Personalização</span>
          </Button>
        )}
      </div>

      {/* Navegação em Abas Corporativas */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-100/80 border border-zinc-200/80 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('modifiers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'modifiers'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
          }`}
        >
          <Sliders className="w-4 h-4 text-amber-600" />
          <span>Central de Modais & Opcionais</span>
          <Badge className="ml-1 bg-amber-100 text-amber-900 text-[10px] font-mono border-0">
            {modifierGroups.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('self_order')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'self_order'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
          }`}
        >
          <Tablet className="w-4 h-4 text-emerald-600" />
          <span>Terminal de Mesa & Autoatendimento</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cadastral')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'cadastral'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
          }`}
        >
          <Store className="w-4 h-4 text-blue-600" />
          <span>Identificação Cadastral</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pos_fiscal')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'pos_fiscal'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
          }`}
        >
          <FileCheck className="w-4 h-4 text-indigo-600" />
          <span>Frente de Caixa & Fiscal</span>
        </button>
      </div>

      {/* ─── ABA 4: CENTRAL DE MODAIS & GRUPOS DE PERSONALIZAÇÃO ─── */}
      {activeTab === 'modifiers' && (
        <div className="space-y-6">
          {/* Card de Apresentação e Presets */}
          <div className="rounded-3xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/10 text-amber-800 text-[10px] font-black uppercase tracking-wider border-amber-500/20">
                    Autoatendimento & Cardápio
                  </Badge>
                </div>
                <h2 className="text-base font-black text-zinc-900 mt-1">
                  Modelos Rápidos de Alta Gastronomia (1 Clique)
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">
                  Insira instantaneamente grupos padronizados no cardápio da sua empresa. As opções serão exibidas automaticamente no modal de personalização do tablet e smartphone.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div
                onClick={() => applyPreset('MEAT_DONENESS')}
                className="p-4 rounded-2xl border border-zinc-200 hover:border-amber-400 bg-white hover:bg-amber-50/20 transition cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🥩</span>
                  <h3 className="text-xs font-black text-zinc-900 group-hover:text-amber-700 transition">
                    Ponto da Carne
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Seleção compulsória (Mal Passado, Ao Ponto e Bem Passado) com acabamento visual gourmet.
                </p>
                <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-amber-700">
                  <span>+ Adicionar Modelo</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>

              <div
                onClick={() => applyPreset('GARNISH')}
                className="p-4 rounded-2xl border border-zinc-200 hover:border-amber-400 bg-white hover:bg-amber-50/20 transition cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🧀</span>
                  <h3 className="text-xs font-black text-zinc-900 group-hover:text-amber-700 transition">
                    Guarnições & Adicionais
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Acréscimos tarifados opcionais (Shimeji na manteiga, farofa crocante e batatas rústicas).
                </p>
                <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-amber-700">
                  <span>+ Adicionar Modelo</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>

              <div
                onClick={() => applyPreset('SAUCES')}
                className="p-4 rounded-2xl border border-zinc-200 hover:border-amber-400 bg-white hover:bg-amber-50/20 transition cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🥣</span>
                  <h3 className="text-xs font-black text-zinc-900 group-hover:text-amber-700 transition">
                    Molhos & Emulsões
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Chimichurri artesanal, redução demi-glace com vinho tinto e manteiga de ervas frescas.
                </p>
                <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-amber-700">
                  <span>+ Adicionar Modelo</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Listagem Organizada dos Grupos de Modificadores */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Grupos de Personalização Ativos no Cardápio
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Cada grupo representa uma seção dentro do modal do produto no terminal de autoatendimento.
                </p>
              </div>
              <span className="text-xs font-bold text-zinc-400">
                {modifierGroups.length} {modifierGroups.length === 1 ? 'grupo' : 'grupos'}
              </span>
            </div>

            {modifierGroups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center space-y-3">
                <Sliders className="w-10 h-10 text-zinc-300 mx-auto" />
                <h4 className="text-sm font-bold text-zinc-700">Nenhum grupo de modais cadastrado</h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Clique nos modelos rápidos acima ou crie um novo grupo personalizado para começar a oferecer opções aos clientes no tablet.
                </p>
                <Button
                  onClick={() => {
                    resetGroupForm();
                    setIsGroupModalOpen(true);
                  }}
                  className="bg-zinc-900 text-white rounded-xl text-xs font-bold"
                >
                  + Criar Primeiro Grupo
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {modifierGroups.map((group: any) => {
                  const isSingleChoice = group.maxSelectable === 1;

                  return (
                    <div
                      key={group.id}
                      className="rounded-3xl border border-zinc-200/90 bg-white p-5 shadow-xs hover:border-zinc-300 transition space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-zinc-900">{group.name}</h4>
                            <Badge
                              className={`text-[10px] font-bold border-0 ${
                                group.isRequired
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-zinc-100 text-zinc-700'
                              }`}
                            >
                              {group.isRequired ? 'Seleção Compulsória' : 'Opcional'}
                            </Badge>
                            <Badge
                              className={`text-[10px] font-bold border-0 ${
                                isSingleChoice
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {isSingleChoice ? 'Exclusiva (1 Opção)' : `Até ${group.maxSelectable} Opções`}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <span>Prato vinculado:</span>
                            <span className="font-bold text-zinc-700">
                              {group.product?.name || 'Todos os itens aplicáveis'}
                            </span>
                            <span>•</span>
                            <span>Regra: mín. {group.minSelectable} / máx. {group.maxSelectable}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTargetGroupIdForOption(group.id);
                              setOptionName('');
                              setOptionPriceFormatted('0,00');
                              setIsOptionModalOpen(true);
                            }}
                            className="h-8 px-3 text-xs font-bold text-zinc-700 rounded-xl"
                          >
                            + Adicionar Opção
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Deseja realmente remover o grupo "${group.name}"?`)) {
                                deleteGroupMutation.mutate(group.id);
                              }
                            }}
                            className="h-8 w-8 p-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Opções cadastradas dentro deste grupo */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                          Opções Configuradas neste Modal ({group.items?.length || 0})
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {(group.items || []).map((item: any) => {
                            const formattedPrice = item.priceCents > 0
                              ? `+ ${(item.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                              : 'Incluso (Sem acréscimo)';

                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs"
                              >
                                <div className="space-y-0.5 truncate mr-2">
                                  <span className="font-bold text-zinc-800 block truncate">{item.name}</span>
                                  <span
                                    className={`text-[10px] font-mono font-bold block ${
                                      item.priceCents > 0 ? 'text-emerald-700' : 'text-zinc-400'
                                    }`}
                                  >
                                    {formattedPrice}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Remover a opção "${item.name}"?`)) {
                                      deleteOptionMutation.mutate({ groupId: group.id, itemId: item.id });
                                    }
                                  }}
                                  className="text-zinc-400 hover:text-rose-600 p-1 shrink-0 transition"
                                  title="Remover opção"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ABA 3: TERMINAL DE MESA & AUTOATENDIMENTO (TABLET) ─── */}
      {activeTab === 'self_order' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Tablet className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900">Comportamento do Terminal de Autoatendimento</h2>
                <p className="text-[11px] text-zinc-400">
                  Parâmetros de interação para os tablets fixados nas mesas e cardápios via QR Code no celular
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Chamado de Garçom no Tablet</span>
                  <input
                    type="checkbox"
                    checked={allowWaiterCall}
                    onChange={(e) => setAllowWaiterCall(e.target.checked)}
                    className="w-4 h-4 rounded text-zinc-900"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Permite que o cliente acione o botão "Chamar Garçom" no tablet, notificando o painel de atendimento.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Solicitação de Fechamento de Conta</span>
                  <input
                    type="checkbox"
                    checked={allowBillRequest}
                    onChange={(e) => setAllowBillRequest(e.target.checked)}
                    className="w-4 h-4 rounded text-zinc-900"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Exibe o botão "Pedir Conta" diretamente no tablet, agilizando o fechamento com o garçom.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Comanda Digital da Mesa (Extrato)</span>
                  <input
                    type="checkbox"
                    checked={showTableBill}
                    onChange={(e) => setShowTableBill(e.target.checked)}
                    className="w-4 h-4 rounded text-zinc-900"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Permite aos clientes consultar a lista de itens já enviados e o total parcial acumulado da mesa.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Layout Tablet Landscape (Horizontal)</span>
                  <input
                    type="checkbox"
                    checked={tabletLandscape}
                    onChange={(e) => setTabletLandscape(e.target.checked)}
                    className="w-4 h-4 rounded text-zinc-900"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Otimização no estilo Goomer com barra lateral esquerda de categorias e grid panorâmico de pratos.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <label className="block font-semibold text-zinc-700 mb-1 text-xs">
                Mensagem de Boas-Vindas no Topo do Tablet
              </label>
              <Input
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Ex: Bem-vindo ao nosso restaurante! Faça seus pedidos diretamente pelo tablet."
                className="h-10 text-xs rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 1: IDENTIFICAÇÃO CADASTRAL ─── */}
      {activeTab === 'cadastral' && (
        <form onSubmit={handleSaveGeneral} className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900">Identificação & Dados Comerciais</h2>
                <p className="text-[11px] text-zinc-400">Informações corporativas impressas no cabeçalho de comandas e notas fiscais</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nome Fantasia da Loja / Restaurante</label>
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Ex: Restaurante Japonês & Carnes"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Razão Social</label>
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Ex: Gastronomia Contemporânea LTDA"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">CNPJ</label>
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Inscrição Estadual (IE)</label>
                <Input
                  value={stateRegistration}
                  onChange={(e) => setStateRegistration(e.target.value)}
                  placeholder="Ex: 123.456.789.000"
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Endereço Completo</label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Gastronômica, 1000"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Telefone / WhatsApp Comercial</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ─── ABA 2: FRENTE DE CAIXA & FISCAL ─── */}
      {activeTab === 'pos_fiscal' && (
        <form onSubmit={handleSaveGeneral} className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900">Operação de Caixa & Segurança do PDV</h2>
                <p className="text-[11px] text-zinc-400">Controle de autorização por PIN e limites de desconto no caixa</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  PIN de Autorização do Gerente *
                </label>
                <Input
                  type="password"
                  maxLength={6}
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="1234"
                  className="h-9 text-xs font-mono rounded-xl tracking-widest"
                  required
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Utilizado no PDV para cancelar vendas, estornar itens ou liberar descontos altos.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Desconto Máximo do Operador sem Senha (%)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={maxCashierDiscount}
                  onChange={(e) => setMaxCashierDiscount(e.target.value)}
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Formato de Impressora Térmica</label>
                <select
                  value={thermalPrinter}
                  onChange={(e) => setThermalPrinter(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="80mm">Bobina Térmica 80mm (Padrão KDS & Balcão)</option>
                  <option value="58mm">Bobina Estreita 58mm (Móvel / Bluetooth)</option>
                  <option value="DISABLED">Desativado (Somente na tela)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FileCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900">Emissão Fiscal NFC-e (Cupom Fiscal)</h2>
                <p className="text-[11px] text-zinc-400">Credenciais fiscais da SEFAZ para emissão do QR Code da NFC-e</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Regime Tributário</label>
                <select
                  value={fiscalType}
                  onChange={(e) => setFiscalType(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="SIMPLES_NACIONAL">Simples Nacional / MEI</option>
                  <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                  <option value="LUCRO_REAL">Lucro Real</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Ambiente SEFAZ</label>
                <select
                  value={nfceEnvironment}
                  onChange={(e) => setNfceEnvironment(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="HOMOLOGATION">Homologação (Ambiente de Testes)</option>
                  <option value="PRODUCTION">Produção (Validade Jurídica Real)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Id do Token CSC</label>
                <Input
                  value={nfceCscId}
                  onChange={(e) => setNfceCscId(e.target.value)}
                  placeholder="Ex: 000001"
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Código CSC da SEFAZ</label>
                <Input
                  type="password"
                  value={nfceCscToken}
                  onChange={(e) => setNfceCscToken(e.target.value)}
                  placeholder="Token alfanumérico fornecido pela SEFAZ"
                  className="h-9 text-xs font-mono rounded-xl"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ─── MODAL: CRIAR NOVO GRUPO DE PERSONALIZAÇÃO ─── */}
      <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white rounded-3xl p-6 border border-zinc-200 shadow-xl max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleCreateCustomGroup} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-zinc-900">
                Novo Grupo de Personalização & Modal
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-1">
                Configure as regras de seleção e as opções disponíveis para o cliente no tablet de mesa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Nome do Grupo *
                </label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ex: Ponto da Carne, Guarnições Nobres, Molhos..."
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Prato do Cardápio Vinculado *
                </label>
                <select
                  value={targetProductId}
                  onChange={(e) => setTargetProductId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs focus:ring-1 focus:ring-zinc-900"
                  required
                >
                  {productsList.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Seleção Compulsória?
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={isRequired}
                      onChange={(e) => {
                        setIsRequired(e.target.checked);
                        if (e.target.checked && minSelectable === 0) setMinSelectable(1);
                      }}
                      className="w-4 h-4 rounded text-zinc-900"
                    />
                    <span className="text-[11px] text-zinc-600 font-medium">Obrigatório escolher</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Máximo de Escolhas
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={maxSelectable}
                    onChange={(e) => setMaxSelectable(parseInt(e.target.value, 10) || 1)}
                    className="h-8 text-xs font-mono rounded-xl"
                  />
                </div>
              </div>

              {/* Opções Iniciais */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-zinc-700">
                    Opções Iniciais do Grupo
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setInitialOptions((prev) => [...prev, { name: '', priceFormatted: '0,00' }])
                    }
                    className="text-[11px] font-bold text-amber-700 hover:underline"
                  >
                    + Linha de Opção
                  </button>
                </div>

                {initialOptions.map((opt, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={opt.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInitialOptions((prev) => {
                          const next = [...prev];
                          next[index].name = val;
                          return next;
                        });
                      }}
                      placeholder={`Ex: Opção ${index + 1}`}
                      className="h-8 text-xs rounded-xl flex-1"
                    />
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold">R$</span>
                      <Input
                        value={opt.priceFormatted}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInitialOptions((prev) => {
                            const next = [...prev];
                            next[index].priceFormatted = val;
                            return next;
                          });
                        }}
                        placeholder="0,00"
                        className="pl-6 h-8 text-xs font-mono rounded-xl"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsGroupModalOpen(false)}
                className="h-9 px-4 text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createGroupMutation.isPending}
                className="bg-zinc-900 text-white h-9 px-4 text-xs font-bold rounded-xl"
              >
                {createGroupMutation.isPending ? 'Salvando...' : 'Salvar Grupo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: ADICIONAR OPÇÃO AVULSA ─── */}
      <Dialog open={isOptionModalOpen} onOpenChange={setIsOptionModalOpen}>
        <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6 border border-zinc-200 shadow-xl">
          <form onSubmit={handleAddOptionSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-zinc-900">
                Cadastrar Opção de Customização
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-1">
                Adicione um item tarifado ou gratuito a este grupo de personalização.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Nome da Opção *
                </label>
                <Input
                  value={optionName}
                  onChange={(e) => setOptionName(e.target.value)}
                  placeholder="Ex: Shimeji na Manteiga, Ao Ponto, etc."
                  className="h-9 text-xs rounded-xl"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Acréscimo Tarifário (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-bold">R$</span>
                  <Input
                    value={optionPriceFormatted}
                    onChange={(e) => setOptionPriceFormatted(e.target.value)}
                    placeholder="0,00"
                    className="pl-8 h-9 text-xs font-mono rounded-xl"
                  />
                </div>
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Deixe 0,00 se a opção for gratuita ou inclusa no prato.
                </span>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOptionModalOpen(false)}
                className="h-9 px-4 text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={addOptionMutation.isPending}
                className="bg-zinc-900 text-white h-9 px-4 text-xs font-bold rounded-xl"
              >
                {addOptionMutation.isPending ? 'Salvando...' : 'Adicionar Opção'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
