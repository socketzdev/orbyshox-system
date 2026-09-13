import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed,
  Plus,
  Trash2,
  Sparkles,
  Check,
  Flame,
  ChefHat,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface ModifierItemInput {
  tempId: string;
  name: string;
  price: string; // Ex: "0,00" ou "4,00"
}

export interface ModifierGroupInput {
  tempId: string;
  name: string; // Ex: "Ponto da Carne", "Opção de Molho"
  isRequired: boolean;
  minSelectable: number;
  maxSelectable: number;
  items: ModifierItemInput[];
}

interface CreateFoodProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (createdProduct: any) => void;
}

export function CreateFoodProductDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateFoodProductDialogProps) {
  const { slug, tenant } = useTenant();
  const queryClient = useQueryClient();

  const effectiveSlug = slug || tenant?.slug;

  // Basic food fields
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');

  // Inline new category
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Modifier Groups
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupInput[]>([]);

  // Fetch existing categories
  const { data: productsData } = useQuery({
    queryKey: ['pos-products-or-menu', effectiveSlug, tenant?.id],
    queryFn: async () => {
      if (effectiveSlug) {
        return apiGet(`/tenant-app/${effectiveSlug}/products`);
      }
      try {
        const menu = await apiGet('/restaurant/menu');
        return { categories: menu || [], products: [] };
      } catch {
        return { categories: [], products: [] };
      }
    },
    enabled: open && (!!effectiveSlug || !!tenant?.id),
  });

  const categories = productsData?.categories || [];

  // Reset form
  const resetForm = () => {
    setName('');
    setSalePrice('');
    setCategoryId(categories.length > 0 ? categories[0].id : '');
    setDescription('');
    setModifierGroups([]);
    setIsCreatingCategory(false);
    setNewCategoryName('');
  };

  // Add Preset: Ponto da Carne
  const handleAddMeatPointPreset = () => {
    // Check if already added
    if (modifierGroups.some((g) => g.name.toLowerCase().includes('ponto'))) {
      toast.info('O grupo de Ponto da Carne já foi adicionado!');
      return;
    }

    const meatGroup: ModifierGroupInput = {
      tempId: 'meat-point-' + Date.now(),
      name: 'Ponto da Carne',
      isRequired: true,
      minSelectable: 1,
      maxSelectable: 1,
      items: [
        { tempId: '1', name: 'Mal Passado', price: '0,00' },
        { tempId: '2', name: 'Ao Ponto', price: '0,00' },
        { tempId: '3', name: 'Bem Passado', price: '0,00' },
      ],
    };

    setModifierGroups((prev) => [meatGroup, ...prev]);
    toast.success('Grupo "Ponto da Carne" adicionado! Você pode editar os pontos.');
  };

  // Add Preset: Opção de Molho
  const handleAddSaucePreset = () => {
    if (modifierGroups.some((g) => g.name.toLowerCase().includes('molho'))) {
      toast.info('O grupo de Opção de Molho já foi adicionado!');
      return;
    }

    const sauceGroup: ModifierGroupInput = {
      tempId: 'sauce-' + Date.now(),
      name: 'Opção de Molho',
      isRequired: false,
      minSelectable: 0,
      maxSelectable: 2,
      items: [
        { tempId: '1', name: 'Maionese Verde da Casa', price: '0,00' },
        { tempId: '2', name: 'Molho Barbecue Artesanal', price: '0,00' },
        { tempId: '3', name: 'Molho Especial Cheddar Melt', price: '4,00' },
        { tempId: '4', name: 'Sem Molho', price: '0,00' },
      ],
    };

    setModifierGroups((prev) => [...prev, sauceGroup]);
    toast.success('Grupo "Opção de Molho" adicionado com sucesso!');
  };

  // Add Custom Modifier Group
  const handleAddCustomGroup = () => {
    const newGroup: ModifierGroupInput = {
      tempId: 'custom-' + Date.now(),
      name: '',
      isRequired: false,
      minSelectable: 0,
      maxSelectable: 1,
      items: [
        { tempId: '1', name: '', price: '0,00' },
        { tempId: '2', name: '', price: '0,00' },
      ],
    };

    setModifierGroups((prev) => [...prev, newGroup]);
  };

  // Remove Group
  const handleRemoveGroup = (groupIndex: number) => {
    setModifierGroups((prev) => prev.filter((_, idx) => idx !== groupIndex));
  };

  // Update Group Header
  const handleUpdateGroup = (groupIndex: number, field: keyof ModifierGroupInput, value: any) => {
    setModifierGroups((prev) => {
      const copy = [...prev];
      copy[groupIndex] = { ...copy[groupIndex], [field]: value };
      return copy;
    });
  };

  // Add Item to Group
  const handleAddItemToGroup = (groupIndex: number) => {
    setModifierGroups((prev) => {
      const copy = [...prev];
      const items = [...copy[groupIndex].items, { tempId: String(Date.now()), name: '', price: '0,00' }];
      copy[groupIndex] = { ...copy[groupIndex], items };
      return copy;
    });
  };

  // Remove Item from Group
  const handleRemoveItemFromGroup = (groupIndex: number, itemIndex: number) => {
    setModifierGroups((prev) => {
      const copy = [...prev];
      const items = copy[groupIndex].items.filter((_, idx) => idx !== itemIndex);
      copy[groupIndex] = { ...copy[groupIndex], items };
      return copy;
    });
  };

  // Update Item in Group
  const handleUpdateItemInGroup = (
    groupIndex: number,
    itemIndex: number,
    field: keyof ModifierItemInput,
    value: string
  ) => {
    setModifierGroups((prev) => {
      const copy = [...prev];
      const items = [...copy[groupIndex].items];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      copy[groupIndex] = { ...copy[groupIndex], items };
      return copy;
    });
  };

  // Category Mutation
  const createCategoryMutation = useMutation({
    mutationFn: (catName: string) => {
      if (effectiveSlug) {
        return apiPost(`/tenant-app/${effectiveSlug}/categories`, { name: catName, color: '#f59e0b' });
      }
      return apiPost(`/restaurant/categories`, { name: catName, color: '#f59e0b' });
    },
    onSuccess: (newCat) => {
      if (effectiveSlug) {
        queryClient.invalidateQueries({ queryKey: ['pos-products', effectiveSlug] });
      }
      queryClient.invalidateQueries({ queryKey: ['pos-products-or-menu'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
      setCategoryId(newCat.id);
      setIsCreatingCategory(false);
      setNewCategoryName('');
      toast.success(`Categoria "${newCat.name}" criada!`);
    },
    onError: () => toast.error('Erro ao criar categoria'),
  });

  // Food Mutation
  const createFoodMutation = useMutation({
    mutationFn: (payload: any) => {
      if (effectiveSlug) {
        return apiPost(`/tenant-app/${effectiveSlug}/products`, payload);
      }
      return apiPost(`/restaurant/products`, payload);
    },
    onSuccess: (newProduct) => {
      if (effectiveSlug) {
        queryClient.invalidateQueries({ queryKey: ['pos-products', effectiveSlug] });
      }
      queryClient.invalidateQueries({ queryKey: ['pos-products-or-menu'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-session'] });

      toast.success(`🎉 Comida "${newProduct.name}" cadastrada com sucesso!`);
      resetForm();
      onOpenChange(false);
      if (onSuccess) onSuccess(newProduct);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar comida');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Informe o nome da comida / produto');
      return;
    }

    const priceCents = Math.round(parseFloat(salePrice.replace(',', '.') || '0') * 100);
    if (priceCents <= 0) {
      toast.error('Informe um preço de venda válido (ex: 28,90)');
      return;
    }

    // Process modifier groups
    const validGroups = modifierGroups
      .filter((g) => g.name.trim().length > 0)
      .map((g) => {
        const validItems = g.items
          .filter((i) => i.name.trim().length > 0)
          .map((i) => ({
            name: i.name.trim(),
            priceCents: Math.round(parseFloat(i.price.replace(',', '.') || '0') * 100),
          }));

        return {
          name: g.name.trim(),
          isRequired: g.isRequired,
          minSelectable: g.isRequired ? Math.max(1, g.minSelectable) : g.minSelectable,
          maxSelectable: Math.max(1, g.maxSelectable),
          items: validItems,
        };
      })
      .filter((g) => g.items.length > 0);

    const payload = {
      name: name.trim(),
      salePriceCents: priceCents,
      costPriceCents: 0,
      stockQuantity: 100,
      unit: 'UN',
      categoryId: categoryId || null,
      description: description.trim() || null,
      modifierGroups: validGroups,
    };

    createFoodMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl max-h-[92vh] flex flex-col">
        <DialogHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-zinc-900 dark:text-white">
                Cadastrar Comida / Prato no Cardápio
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500">
                Crie o prato com opções de ponto da carne, molhos e adicionais para o salão e delivery.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2 flex-1 overflow-y-auto pr-1">
          {/* Informações Básicas da Comida */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Nome do Prato / Comida *
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Smash Burger Especial, Picanha na Chapa, Pizza Calabresa"
                className="rounded-xl mt-1 text-xs h-9 bg-zinc-50/70 dark:bg-zinc-800"
                required
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Preço de Venda (R$) *
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
                  R$
                </span>
                <Input
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0,00"
                  className="rounded-xl pl-9 text-xs font-bold h-9 bg-zinc-50/70 dark:bg-zinc-800"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Categoria do Cardápio
                </Label>
                {!isCreatingCategory && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingCategory(true)}
                    className="text-[11px] font-bold text-amber-700 hover:underline"
                  >
                    + Nova Categoria
                  </button>
                )}
              </div>

              {isCreatingCategory ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nome da categoria (ex: Lanches)"
                    className="rounded-xl text-xs h-9 bg-white"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (newCategoryName.trim()) {
                        createCategoryMutation.mutate(newCategoryName.trim());
                      }
                    }}
                    disabled={createCategoryMutation.isPending}
                    className="h-9 px-3 rounded-xl bg-zinc-900 text-white text-xs shrink-0"
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingCategory(false)}
                    className="h-9 px-2 text-xs text-zinc-400"
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
                >
                  <option value="">Geral & Outros</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Descrição & Ingredientes (opcional)
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Blend 180g de costela, queijo cheddar cremoso, cebola caramelizada..."
                className="rounded-xl mt-1 text-xs h-9 bg-zinc-50/70 dark:bg-zinc-800"
              />
            </div>
          </div>

          {/* ─── SEÇÃO: OPÇÕES DE PERSONALIZAÇÃO (PONTO, MOLHOS, ETC) ─── */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                    Opções de Personalização
                  </h3>
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                    Ponto, Molhos & Extras
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Clique nos atalhos abaixo para adicionar grupos prontos em 1 clique:
                </p>
              </div>

              {/* Botões de Presets Rápidos */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddMeatPointPreset}
                  className="rounded-xl text-xs font-bold gap-1.5 h-8 border-rose-200 bg-rose-50/60 text-rose-800 hover:bg-rose-100/80 hover:text-rose-900 cursor-pointer shadow-2xs"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-600" />
                  <span>🥩 + Ponto da Carne</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddSaucePreset}
                  className="rounded-xl text-xs font-bold gap-1.5 h-8 border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100/80 hover:text-amber-900 cursor-pointer shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>🥫 + Opção de Molho</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddCustomGroup}
                  className="rounded-xl text-xs font-medium gap-1 h-8 text-zinc-600 hover:text-zinc-900 border-dashed"
                >
                  <Plus className="w-3 h-3" />
                  <span>Outro Grupo</span>
                </Button>
              </div>
            </div>

            {/* Grupos Adicionados */}
            {modifierGroups.length === 0 ? (
              <div className="p-5 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 text-center space-y-1.5">
                <p className="text-xs font-semibold text-zinc-600">
                  Nenhuma opção de personalização adicionada.
                </p>
                <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                  Para carnes, hambúrgueres ou pratos com opções, clique em <strong>🥩 + Ponto da Carne</strong> ou <strong>🥫 + Opção de Molho</strong> acima.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {modifierGroups.map((group, gIdx) => (
                  <div
                    key={group.tempId}
                    className="p-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/50 space-y-3 shadow-2xs"
                  >
                    {/* Header do Grupo */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 max-w-xs">
                        <Label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Nome do Grupo
                        </Label>
                        <Input
                          value={group.name}
                          onChange={(e) => handleUpdateGroup(gIdx, 'name', e.target.value)}
                          placeholder="Ex: Ponto da Carne, Molho"
                          className="h-8 text-xs font-bold rounded-xl bg-white dark:bg-zinc-900"
                        />
                      </div>

                      <div className="flex items-center gap-3 shrink-0 pt-3">
                        <button
                          type="button"
                          onClick={() => handleUpdateGroup(gIdx, 'isRequired', !group.isRequired)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            group.isRequired
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-zinc-200 text-zinc-700 border border-zinc-300'
                          }`}
                        >
                          {group.isRequired ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                              Obrigatório (Exige Escolha)
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-zinc-400" />
                              Opcional
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(gIdx)}
                          className="w-7 h-7 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"
                          title="Remover Grupo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Itens do Grupo */}
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-[10px] uppercase font-bold text-zinc-400">
                        Opções Escolhíveis ({group.items.length})
                      </Label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items.map((item, iIdx) => (
                          <div
                            key={item.tempId}
                            className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700"
                          >
                            <Input
                              value={item.name}
                              onChange={(e) =>
                                handleUpdateItemInGroup(gIdx, iIdx, 'name', e.target.value)
                              }
                              placeholder="Ex: Ao Ponto, Barbecue"
                              className="h-7 text-xs rounded-lg border-zinc-200 flex-1"
                            />
                            <div className="relative w-24 shrink-0">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">
                                +R$
                              </span>
                              <Input
                                value={item.price}
                                onChange={(e) =>
                                  handleUpdateItemInGroup(gIdx, iIdx, 'price', e.target.value)
                                }
                                placeholder="0,00"
                                className="h-7 pl-6 text-xs font-mono rounded-lg border-zinc-200"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromGroup(gIdx, iIdx)}
                              className="w-6 h-6 rounded text-zinc-300 hover:text-rose-600 flex items-center justify-center transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddItemToGroup(gIdx)}
                        className="text-xs text-zinc-600 hover:text-zinc-900 gap-1 h-7 px-2 rounded-lg font-semibold"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar mais uma opção</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              className="rounded-xl text-xs text-zinc-500"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createFoodMutation.isPending}
              className="rounded-2xl gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs px-5 shadow-sm"
            >
              {createFoodMutation.isPending ? (
                <span>Salvando Comida...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Cadastrar no Cardápio</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
