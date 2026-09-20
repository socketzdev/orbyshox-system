import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Barcode,
  TrendingUp,
  Tag,
  Boxes,
  ChevronDown,
  Camera,
  Upload,
  Loader2,
  UtensilsCrossed,
  X,
  Trash2,
  FolderPlus,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { analyzeProductImage, DetectedProductInfo } from './product-vision-ai';
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
import { CreateFoodProductDialog } from '../components/create-food-product-dialog';
import { ImageUploadField } from '../components/image-upload-field';

export const ProductListPage: React.FC = () => {
  const { slug, tenant } = useTenant();
  const queryClient = useQueryClient();
  const isRestaurant =
    tenant?.niche === 'RESTAURANT' ||
    (!['RESTAURANT', 'BARBERSHOP', 'SUPERMARKET', 'UNIVERSAL'].includes(String(tenant?.niche || '').toUpperCase()) &&
      ['JAPANESE', 'BURGER_HOUSE', 'PIZZERIA', 'PASTRY', 'RESTAURANT'].includes(
        String(tenant?.niche || (tenant as any)?.category || (tenant as any)?.company?.category || '').toUpperCase()
      )) ||
    (tenant?.features || []).includes('tables');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createFoodOpen, setCreateFoodOpen] = useState(false);

  // Category management state
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<any | null>(null);
  const [categoryToRename, setCategoryToRename] = useState<any | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState('');

  // Product deletion state (single + bulk via checkbox)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [productToDelete, setProductToDelete] = useState<any | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
    queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
  };

  const deleteProductMutation = useMutation({
    mutationFn: (prodId: string) => apiDelete(`/tenant-app/${slug}/products/${prodId}`),
    onSuccess: (res: any) => {
      invalidateProducts();
      setProductToDelete(null);
      if (res?.deactivated) {
        toast.warning(`"${res.name}" tem vendas registradas e foi desativado (saiu da venda, histórico preservado).`);
      } else {
        toast.success(`"${res?.name || 'Produto'}" excluído de vez!`);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Falha ao excluir produto');
    },
  });

  const deleteBulkMutation = useMutation({
    mutationFn: (ids: string[]) => apiDelete(`/tenant-app/${slug}/products`, { data: { ids } }),
    onSuccess: (res: any) => {
      invalidateProducts();
      setSelectedIds([]);
      setBulkConfirmOpen(false);
      const parts: string[] = [];
      if (res?.deleted > 0) parts.push(`${res.deleted} excluído(s)`);
      if (res?.deactivated > 0) parts.push(`${res.deactivated} desativado(s) por terem vendas`);
      toast.success(parts.length > 0 ? parts.join(' • ') + '!' : 'Nada para excluir.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Falha ao excluir produtos');
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (newCatData: { name: string }) =>
      apiPost(`/tenant-app/${slug}/categories`, newCatData),
    onSuccess: (newCat) => {
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
      setCreateCategoryOpen(false);
      setNewCategoryName('');
      toast.success(`Categoria "${newCat?.name || 'Nova'}" criada com sucesso!`);
      if (newCat?.id) {
        setSelectedCategory(newCat.id);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Falha ao criar categoria');
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (catId: string) =>
      apiDelete(`/tenant-app/${slug}/categories/${catId}`),
    onSuccess: (_, deletedCatId) => {
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
      if (selectedCategory === deletedCatId) {
        setSelectedCategory(null);
      }
      setCategoryToDelete(null);
      toast.success('Categoria excluída com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Falha ao excluir categoria');
    },
  });

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast.error('Informe o nome da categoria');
      return;
    }
    createCategoryMutation.mutate({ name: newCategoryName.trim() });
  };

  const renameCategoryMutation = useMutation({
    mutationFn: ({ catId, name }: { catId: string; name: string }) =>
      apiPatch(`/tenant-app/${slug}/categories/${catId}`, { name }),
    onSuccess: (renamed: any) => {
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
      setCategoryToRename(null);
      setRenameCategoryName('');
      toast.success(`Categoria renomeada para "${renamed?.name || 'nova'}"!`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Falha ao renomear categoria');
    },
  });

  const handleRenameCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryToRename?.id) return;
    if (!renameCategoryName.trim()) {
      toast.error('Informe o novo nome da categoria');
      return;
    }
    renameCategoryMutation.mutate({ catId: categoryToRename.id, name: renameCategoryName.trim() });
  };

  // Form state
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('');
  const [ncm, setNcm] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('50');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [unit, setUnit] = useState('UN');
  const [imageUrl, setImageUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // AI Vision state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [detectedItem, setDetectedItem] = useState<DetectedProductInfo | null>(null);

  // Quick adjust state
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProd, setAdjustProd] = useState<any>(null);
  const [adjustQty, setAdjustQty] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: () => apiGet(`/tenant-app/${slug}/products`),
    refetchInterval: 30000,
  });

  const categories = data?.categories || [];
  const products = Array.isArray(data) ? data : data?.products || [];

  const generateBarcode = () => {
    // Generate valid 13-digit EAN style barcode starting with 789
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    const code = `789${randomDigits}`;
    setBarcode(code);
    toast.success('Código de barras gerado automaticamente!');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingImage(true);
    setAnalysisStatus('Iniciando análise inteligente com IA...');
    try {
      const result = await analyzeProductImage(file, (msg) => setAnalysisStatus(msg));
      setDetectedItem(result);

      if (result.name) setName(result.name);
      if (result.barcode) setBarcode(result.barcode);
      if (result.suggestedSalePrice) setSalePrice(result.suggestedSalePrice.toFixed(2).replace('.', ','));
      if (result.costPrice) setCostPrice(result.costPrice.toFixed(2).replace('.', ','));
      if (result.brand) setBrand(result.brand);
      if (result.ncm) setNcm(result.ncm);
      if (result.unit) setUnit(result.unit);

      // Match category
      if (categories.length > 0 && result.categorySuggestion) {
        const matched = categories.find((c: any) =>
          c.name.toLowerCase().includes(result.categorySuggestion.toLowerCase()) ||
          result.categorySuggestion.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matched) setCategoryId(matched.id);
      }

      toast.success(`✨ Produto "${result.name}" identificado pela IA!`);
    } catch (err: any) {
      toast.error('Não foi possível reconhecer o produto na imagem. Tente uma foto mais nítida.');
    } finally {
      setIsAnalyzingImage(false);
      setAnalysisStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenNewModal = () => {
    setName('');
    setBarcode('');
    setSku('');
    setBrand('');
    setNcm('');
    setSalePrice('');
    setCostPrice('');
    setStockQuantity('50');
    setMinStockAlert('5');
    setUnit('UN');
    setImageUrl('');
    setShowAdvanced(false);
    setDetectedItem(null);
    setIsAnalyzingImage(false);
    setAnalysisStatus('');
    if (categories.length > 0) {
      setCategoryId(categories[0].id);
    } else {
      setCategoryId('');
    }
    setModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (newProd: any) => apiPost(`/tenant-app/${slug}/products`, newProd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard', slug] });
      setModalOpen(false);
      setName('');
      setBarcode('');
      setSku('');
      setBrand('');
      setNcm('');
      setSalePrice('');
      setCostPrice('');
      setImageUrl('');
      toast.success('Produto cadastrado com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao cadastrar produto'),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      apiPost(`/tenant-app/${slug}/products/${id}/adjust-stock`, {
        newQuantity: qty,
        reason: 'Ajuste rápido pelo catálogo de produtos',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
      toast.success('Estoque atualizado!');
      setAdjustModalOpen(false);
      setAdjustProd(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao ajustar estoque'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Nome do produto é obrigatório');
    const priceCents = Math.round(parseFloat(salePrice.replace(',', '.') || '0') * 100);
    if (priceCents <= 0) return toast.error('Informe um preço de venda válido (ex: 10,00)');

    const costCents = Math.round(parseFloat(costPrice.replace(',', '.') || '0') * 100);
    const generatedSku = sku.trim() || `PRD-${Date.now().toString().slice(-5)}`;
    const effectiveCatId = categoryId || (categories.length > 0 ? categories[0].id : null);
    const effectiveStock = parseFloat(stockQuantity) || 50;
    const effectiveMinAlert = parseFloat(minStockAlert) || 5;

    createMutation.mutate({
      name: name.trim(),
      categoryId: effectiveCatId,
      barcode: barcode.trim() || null,
      sku: generatedSku,
      brand: brand.trim() || null,
      ncm: ncm.trim() || '0000.00.00',
      salePriceCents: priceCents,
      costPriceCents: costCents,
      stockQuantity: effectiveStock,
      minStockAlert: effectiveMinAlert,
      unit: unit || 'UN',
      imageUrl: imageUrl.trim() || null,
    });
  };

  // Margin calculation
  const marginCalculation = useMemo(() => {
    const sale = parseFloat(salePrice.replace(',', '.') || '0');
    const cost = parseFloat(costPrice.replace(',', '.') || '0');
    const profit = sale - cost;
    const marginPct = sale > 0 ? ((profit / sale) * 100).toFixed(1) : '0.0';
    return { sale, cost, profit, marginPct };
  }, [salePrice, costPrice]);

  const filtered = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchTerm));
      const matchesCat = selectedCategory ? p.categoryId === selectedCategory : true;
      return matchesSearch && matchesCat;
    });
  }, [products, searchTerm, selectedCategory]);

  const lowStockCount = products.filter(
    (p: any) =>
      Number(p.stockQuantity) < 999000 &&
      Number(p.stockQuantity) <= Number(p.minStockAlert)
  ).length;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              {isRestaurant ? (
                <UtensilsCrossed className="w-5 h-5 text-amber-600" />
              ) : (
                <Package className="w-5 h-5 text-zinc-700" />
              )}
              {isRestaurant ? 'Cardápio & Catálogo de Pratos' : 'Catálogo & Controle de Estoque'}
            </h1>
            <Badge variant="outline" className="text-[11px] font-semibold bg-zinc-50">
              {products.length} {isRestaurant ? 'pratos/itens' : 'produtos'}
            </Badge>
            {lowStockCount > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px] font-bold">
                {lowStockCount} em alerta
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {isRestaurant
              ? 'Gerencie pratos, preços, opções de personalização e itens do cardápio.'
              : 'Gerencie itens de venda, margem de lucro e limites para disparo de alertas automáticos.'}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {isRestaurant ? (
            <Button
              size="sm"
              onClick={() => setCreateFoodOpen(true)}
              className="h-10 px-4 text-xs font-bold text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 border border-amber-400/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>＋ Nova Comida</span>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleOpenNewModal}
              className="h-10 px-4 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Cadastrar Produto</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft overflow-hidden p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder={isRestaurant ? 'Pesquisar por prato, sabor ou categoria...' : 'Pesquisar por nome ou código...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 text-xs rounded-xl border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-800 transition"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {/* + Criar Categoria (primeiro na esquerda de todas as categorias) */}
            <button
              type="button"
              onClick={() => {
                setNewCategoryName('');
                setCreateCategoryOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border border-dashed border-amber-400/80 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:border-amber-500 shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
              title="Criar nova categoria"
            >
              <Plus className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
              <span>+ Criar Categoria</span>
            </button>

            {/* Todas Categorias */}
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                selectedCategory === null
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              Todas Categorias
            </button>

            {/* Categorias com botão X na ponta da direita ao passar o mouse */}
            {categories.map((cat: any) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <div
                  key={cat.id}
                  className="relative group shrink-0 inline-flex items-center"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`pl-3 pr-2 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      title={`Renomear categoria "${cat.name}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryToRename(cat);
                        setRenameCategoryName(cat.name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          setCategoryToRename(cat);
                          setRenameCategoryName(cat.name);
                        }
                      }}
                      className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-md flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'hover:bg-white/20 text-zinc-300 hover:text-white'
                          : 'hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700'
                      }`}
                    >
                      <Pencil className="w-3 h-3 stroke-[2.5]" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      title={`Excluir categoria "${cat.name}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryToDelete(cat);
                      }}
                      className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-md flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'hover:bg-white/20 text-zinc-300 hover:text-white'
                          : 'hover:bg-rose-100 text-zinc-400 hover:text-rose-600'
                      }`}
                    >
                      <X className="w-3 h-3 stroke-[2.5]" />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <table className="w-full text-left text-xs">
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <ErpEmptyState
            icon={isRestaurant ? UtensilsCrossed : Package}
            title={isRestaurant ? "Nenhuma comida cadastrada" : "Nenhum produto cadastrado"}
            description={isRestaurant ? "Cadastre seu primeiro prato para montar o cardápio do restaurante." : "Cadastre seu primeiro produto para começar a vender e controlar o estoque."}
            actionLabel={isRestaurant ? "＋ Nova Comida" : "Cadastrar Produto"}
            onAction={isRestaurant ? () => setCreateFoodOpen(true) : handleOpenNewModal}
          />
        ) : (
          <div className="overflow-x-auto">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl bg-red-50 border border-red-200">
                <span className="text-xs font-bold text-red-800">
                  {selectedIds.length} selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={() => setBulkConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 transition min-h-[40px] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir selecionados
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 min-h-[40px] cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            )}
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="pb-3 pl-2 w-10">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={filtered.length > 0 && filtered.every((p: any) => selectedIds.includes(p.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(Array.from(new Set([...selectedIds, ...filtered.map((p: any) => p.id)])));
                        } else {
                          const visible = new Set(filtered.map((p: any) => p.id));
                          setSelectedIds(selectedIds.filter((id) => !visible.has(id)));
                        }
                      }}
                      className="w-4 h-4 accent-red-600 cursor-pointer"
                    />
                  </th>
                  <th className="pb-3">{isRestaurant ? 'Prato / Alimento' : 'Produto / Código'}</th>
                  <th className="pb-3">Categoria</th>
                  <th className="pb-3 text-right">Preço Venda</th>
                  <th className="pb-3 text-right">{isRestaurant ? 'Custo Estimado' : 'Preço Custo'}</th>
                  <th className="pb-3 text-center">{isRestaurant ? 'Preparo / Cozinha' : 'Estoque Atual'}</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 pr-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filtered.map((item: any) => {
                  const isUnlimited =
                    Number(item.stockQuantity) >= 999000 ||
                    item.stockQuantity === null ||
                    item.stockQuantity === undefined;
                  const isLow =
                    !isUnlimited &&
                    Number(item.stockQuantity) <= Number(item.minStockAlert);
                  const price = ((item.salePriceCents || 0) / 100).toFixed(2);
                  const cost = ((item.costPriceCents || 0) / 100).toFixed(2);

                  return (
                    <tr key={item.id} className={`hover:bg-zinc-50/60 transition-colors ${selectedIds.includes(item.id) ? 'bg-red-50/40' : ''} ${item.isActive === false ? 'opacity-60' : ''}`}>
                      <td className="py-3.5 pl-2">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${item.name}`}
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => {
                            setSelectedIds(
                              e.target.checked
                                ? [...selectedIds, item.id]
                                : selectedIds.filter((id) => id !== item.id),
                            );
                          }}
                          className="w-4 h-4 accent-red-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 font-medium text-zinc-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0 overflow-hidden border border-zinc-200/60">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : isRestaurant ? (
                              <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                            ) : (
                              <Package className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold block">{item.name}</span>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                              <span>{item.barcode || item.sku || 'Sem cód.'}</span>
                              {item.brand && <span>• {item.brand}</span>}
                            </div>
                            {item.modifierGroups && item.modifierGroups.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.modifierGroups.map((g: any) => (
                                  <span
                                    key={g.id || g.name}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                                  >
                                    {g.name.toLowerCase().includes('ponto')
                                      ? '🥩 '
                                      : g.name.toLowerCase().includes('molho')
                                      ? '🥫 '
                                      : '✨ '}
                                    {g.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 text-zinc-600">
                        <span className="bg-zinc-100 px-2 py-0.5 rounded-md text-[11px] font-medium">
                          {item.category?.name || 'Geral'}
                        </span>
                      </td>

                      <td className="py-3.5 text-right font-mono font-bold text-zinc-900">
                        R$ {price}
                      </td>

                      <td className="py-3.5 text-right font-mono text-zinc-500">
                        R$ {cost}
                      </td>

                      <td className="py-3.5 text-center font-mono font-semibold">
                        {isUnlimited ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-lg">
                            Feito na Hora
                          </span>
                        ) : (
                          <span className={isLow ? 'text-rose-600 font-bold' : 'text-zinc-800'}>
                            {item.stockQuantity} {item.unit || 'UN'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 text-center">
                        {item.isActive === false ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-200/70 px-2 py-0.5 rounded-full border border-zinc-300">
                            <X className="w-3 h-3" />
                            Inativo
                          </span>
                        ) : isUnlimited ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">
                            Sob Demanda
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            Estoque Baixo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Normal
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 pr-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustProd(item);
                              setAdjustQty(String(item.stockQuantity));
                              setAdjustModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition cursor-pointer"
                          >
                            Ajustar
                          </button>
                          <button
                            type="button"
                            title={`Excluir "${item.name}"`}
                            onClick={() => setProductToDelete(item)}
                            className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Cadastro Rápido & Inteligente de Produto */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-zinc-200/90 p-6 sm:p-7 rounded-3xl font-sans shadow-xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-zinc-700" />
              Cadastrar Novo Produto ou Serviço
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Basta preencher o nome e o preço. O sistema automatiza o estoque e códigos pra você!
            </DialogDescription>
          </DialogHeader>

          {/* ─── Scanner IA por Imagem ou Câmera ─── */}
          <div className="mt-2 p-3 rounded-2xl bg-gradient-to-r from-violet-50 via-indigo-50 to-purple-50 border border-indigo-200/80 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-zinc-900">Preencher via Imagem (IA)</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Smart
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Tire ou envie uma foto do produto/código de barras. A IA preenche tudo!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isAnalyzingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                >
                  {isAnalyzingImage ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Lendo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Escanear Foto</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Status / feedback em tempo real durante o processamento */}
            {isAnalyzingImage && (
              <div className="mt-2 pt-2 border-t border-indigo-100 flex items-center gap-2 text-xs font-semibold text-indigo-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                <span className="animate-pulse">{analysisStatus || 'Analisando imagem com inteligência artificial...'}</span>
              </div>
            )}

            {/* Feedback do produto detectado com sucesso */}
            {detectedItem && !isAnalyzingImage && (
              <div className="mt-2.5 pt-2.5 border-t border-emerald-200 bg-emerald-50/80 -mx-3 -mb-3 p-2.5 rounded-b-2xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="text-[11px] text-emerald-900 font-medium truncate">
                    Identificado: <strong className="font-bold">{detectedItem.name}</strong> ({detectedItem.confidence}% de precisão)
                  </div>
                </div>
                <Badge className="bg-emerald-600 text-white text-[9px] font-bold shrink-0">
                  {detectedItem.detectionMethod === 'OPEN_FOOD_FACTS'
                    ? 'Base Oficial'
                    : detectedItem.detectionMethod === 'CATALOG_KNOWLEDGE'
                    ? 'Catálogo Brasil'
                    : 'IA Visual'}
                </Badge>
              </div>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-3.5 mt-2">
            {/* 1. Nome do Produto (Destaque Principal) */}
            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1">
                Nome do Item / Produto *
              </label>
              <Input
                placeholder="Ex: Arroz 5kg, Coca-Cola 2L, Pomada Matte..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-xs font-medium rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 transition"
                required
                autoFocus
              />
            </div>

            {/* 2. Preço de Venda e Estoque Inicial */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">
                  Preço de Venda (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">R$</span>
                  <Input
                    placeholder="0,00"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="pl-9 h-10 text-xs font-mono font-bold rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-900 transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1 flex items-center justify-between">
                  <span>Estoque Inicial</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Padrão 50</span>
                </label>
                <Input
                  type="number"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="h-10 text-xs font-mono font-medium rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-900 transition"
                />
              </div>
            </div>

            {/* 3. Código de Barras com Automação de 1 Clique */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-zinc-800">
                  Código de Barras (EAN)
                </label>
                <span className="text-[10px] text-zinc-400">Opcional</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    placeholder="Passe no leitor ou deixe automático..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="pl-9 h-9 text-xs font-mono rounded-xl bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-900 transition"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateBarcode}
                  title="Gerar código de barras automático"
                  className="h-9 px-3 text-xs font-medium rounded-xl border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 shrink-0 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Gerar</span>
                </Button>
              </div>
            </div>

            {/* 4. Categoria */}
            {categories.length > 0 && (
              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1">Categoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-800 focus:bg-white focus:outline-none focus:border-zinc-900 transition"
                >
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Foto do Produto */}
            <div>
              <ImageUploadField
                value={imageUrl}
                onChange={setImageUrl}
                label="Foto do Produto / Item"
                helperText="Formatos aceitos: JPG, PNG, WEBP. A imagem aparecerá no PDV e catálogo."
              />
            </div>

            {/* 5. Sanfona Expansível: Detalhes Adicionais (Apenas se quiser) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-dashed border-zinc-200 text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition"
              >
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-zinc-400" />
                  {showAdvanced ? 'Ocultar detalhes avançados' : 'Mais detalhes (Custo, NCM fiscal, Marca, Balança)'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-3 p-3 mt-2 bg-zinc-50/80 rounded-2xl border border-zinc-200/80 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Preço de Custo & Margem */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                        Preço de Custo (R$)
                      </label>
                      <Input
                        placeholder="0,00"
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        className="h-8 text-xs font-mono rounded-lg bg-white border-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                        Unidade de Medida
                      </label>
                      <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800"
                      >
                        <option value="UN">Unidade (UN)</option>
                        <option value="KG">Quilo (KG - Balança)</option>
                        <option value="L">Litro (L)</option>
                        <option value="CX">Caixa (CX)</option>
                        <option value="PCT">Pacote (PCT)</option>
                      </select>
                    </div>
                  </div>

                  {/* Margem Bruta */}
                  {Number(costPrice) > 0 && (
                    <div className="bg-white border border-zinc-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-400 block font-bold">MARGEM BRUTA</span>
                        <span className="font-bold font-mono text-emerald-600">{marginCalculation.marginPct}%</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 block font-bold">LUCRO ESTIMADO</span>
                        <span className="font-bold font-mono text-zinc-900">R$ {marginCalculation.profit.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                  )}

                  {/* Marca & NCM */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">Marca / Fabricante</label>
                      <Input
                        placeholder="Ex: Nestlé, Própria..."
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className="h-8 text-xs rounded-lg bg-white border-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">NCM Fiscal</label>
                      <Input
                        placeholder="0000.00.00"
                        value={ncm}
                        onChange={(e) => setNcm(e.target.value)}
                        className="h-8 text-xs font-mono rounded-lg bg-white border-zinc-200"
                      />
                    </div>
                  </div>

                  {/* SKU & Estoque Mínimo */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">SKU / Cód. Interno</label>
                      <Input
                        placeholder="Auto-gerado..."
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        className="h-8 text-xs font-mono rounded-lg bg-white border-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">Alerta Estoque Mínimo</label>
                      <Input
                        type="number"
                        value={minStockAlert}
                        onChange={(e) => setMinStockAlert(e.target.value)}
                        className="h-8 text-xs font-mono rounded-lg bg-white border-zinc-200"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 sticky bottom-0 bg-white/95 backdrop-blur pb-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="h-11 px-5 text-xs font-semibold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="h-11 px-6 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer shadow-sm"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar Produto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Ajuste Rápido de Estoque */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="max-w-xs bg-white rounded-3xl p-5 border-zinc-200 shadow-elevated">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-zinc-900">
              Ajustar Saldo de Estoque
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              {adjustProd?.name}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!adjustProd) return;
              const q = parseFloat(adjustQty.replace(',', '.') || '0');
              adjustMutation.mutate({ id: adjustProd.id, qty: q });
            }}
            className="space-y-3 py-1 text-xs"
          >
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Novo Saldo ({adjustProd?.unit || 'UN'})</label>
              <Input
                type="number"
                step="any"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="h-10 text-sm font-mono rounded-xl"
                autoFocus
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdjustModalOpen(false)} className="rounded-xl text-xs">
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={adjustMutation.isPending} className="bg-zinc-900 text-white rounded-xl text-xs font-semibold">
                {adjustMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Criação Rápida de Comidas com Ponto e Molhos */}
      <CreateFoodProductDialog
        open={createFoodOpen}
        onOpenChange={setCreateFoodOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['pos-products'] });
          queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
        }}
      />

      {/* Modal: Nova Categoria */}
      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
              <FolderPlus className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Nova Categoria
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Crie uma nova categoria para organizar os itens e pratos do seu cardápio.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCategorySubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1.5">
                Nome da Categoria *
              </label>
              <Input
                type="text"
                autoFocus
                placeholder="Ex: Sobremesas da Casa, Bebidas & Sucos, Pratos Executivos..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateCategoryOpen(false)}
                className="h-9 text-xs rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createCategoryMutation.isPending || !newCategoryName.trim()}
                className="h-9 text-xs rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
              >
                {createCategoryMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Criar Categoria'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Renomear Categoria */}
      <Dialog
        open={!!categoryToRename}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryToRename(null);
            setRenameCategoryName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center mb-2">
              <Pencil className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Renomear Categoria
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              O novo nome aparece na hora nos atalhos do garçom ao lançar itens.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRenameCategorySubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1.5">
                Novo nome *
              </label>
              <Input
                type="text"
                autoFocus
                placeholder="Ex: Bebidas, Sobremesas, Batatas..."
                value={renameCategoryName}
                onChange={(e) => setRenameCategoryName(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCategoryToRename(null);
                  setRenameCategoryName('');
                }}
                className="h-9 text-xs rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={renameCategoryMutation.isPending || !renameCategoryName.trim()}
                className="h-9 text-xs rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
              >
                {renameCategoryMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Renomear Categoria'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Exclusão de Categoria */}
      <Dialog
        open={!!categoryToDelete}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Excluir Categoria
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-600 leading-relaxed">
              Tem certeza que deseja excluir a categoria{' '}
              <strong className="text-zinc-900 font-bold">
                "{categoryToDelete?.name}"
              </strong>
              ?
              <br />
              <span className="text-zinc-400 block mt-1">
                Os pratos vinculados a ela não serão apagados, apenas ficarão sem categoria.
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={deleteCategoryMutation.isPending}
              onClick={() => setCategoryToDelete(null)}
              className="h-9 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={deleteCategoryMutation.isPending}
              onClick={() => {
                if (categoryToDelete?.id) {
                  deleteCategoryMutation.mutate(categoryToDelete.id);
                }
              }}
              className="h-9 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deleteCategoryMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Sim, Excluir Categoria'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Exclusão de Produto (unitário) */}
      <Dialog
        open={!!productToDelete}
        onOpenChange={(open) => !open && setProductToDelete(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Excluir Produto
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-600 leading-relaxed">
              Tem certeza que deseja excluir{' '}
              <strong className="text-zinc-900 font-bold">
                "{productToDelete?.name}"
              </strong>
              ?
              <br />
              <span className="text-zinc-400 block mt-1">
                Sem vendas: apaga de vez. Com vendas: só desativa (sai da venda, mas o histórico é preservado).
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={deleteProductMutation.isPending}
              onClick={() => setProductToDelete(null)}
              className="h-9 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={deleteProductMutation.isPending}
              onClick={() => {
                if (productToDelete?.id) {
                  deleteProductMutation.mutate(productToDelete.id);
                }
              }}
              className="h-9 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deleteProductMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Sim, Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Exclusão em Lote */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-zinc-900">
              Excluir {selectedIds.length} produto(s)
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-600 leading-relaxed">
              Tem certeza? Itens sem vendas são apagados de vez; itens com vendas são apenas desativados para preservar o histórico.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={deleteBulkMutation.isPending}
              onClick={() => setBulkConfirmOpen(false)}
              className="h-9 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={deleteBulkMutation.isPending}
              onClick={() => deleteBulkMutation.mutate(selectedIds)}
              className="h-9 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deleteBulkMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Excluindo...
                </>
              ) : (
                `Sim, Excluir ${selectedIds.length}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
