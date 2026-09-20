import React, { useState, useMemo } from 'react';
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
  X,
  Info,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ImageUploadField } from './image-upload-field';

export interface ModifierItemInput {
  tempId: string;
  name: string;
  price: string; // Ex: "0,00" ou "4,00"
}

export interface ModifierGroupInput {
  tempId: string;
  name: string;
  isRequired: boolean;
  minSelectable: number;
  maxSelectable: number;
  items: ModifierItemInput[];
}

interface PresetDef {
  id: string;
  chipLabel: string;
  groupName: string;
  isRequired: boolean;
  minSelectable: number;
  maxSelectable: number;
  items: Array<{ name: string; price: string }>;
}

interface SpecialtyConfig {
  label: string;
  badge: string;
  emoji: string;
  isDirectServingDefault?: boolean;
  description: string;
  presets: PresetDef[];
}

const SPECIALTY_CONFIGS: Record<string, SpecialtyConfig> = {
  JAPANESE: {
    label: 'Culinária Japonesa & Sushi',
    badge: 'Japonesa',
    emoji: '🍣',
    isDirectServingDefault: true,
    description:
      'Na culinária japonesa, sushis, sashimis e temakis geralmente não exigem personalizações de carne. Você pode salvar sem opcionais ou usar os atalhos abaixo se quiser oferecer molhos ou adicionais.',
    presets: [
      {
        id: 'sauces-jp',
        chipLabel: '🥢 + Molhos & Wasabi',
        groupName: 'Molhos & Condimentos',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 3,
        items: [
          { name: 'Molho Tarê Artesanal', price: '0,00' },
          { name: 'Wasabi (Raiz Forte)', price: '0,00' },
          { name: 'Gengibre em Conserva (Gari)', price: '0,00' },
          { name: 'Shoyu Extra', price: '0,00' },
        ],
      },
      {
        id: 'cream-cheese-jp',
        chipLabel: '🧀 + Cream Cheese Extra',
        groupName: 'Adicionais & Cream Cheese',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 2,
        items: [
          { name: 'Cream Cheese Tradicional', price: '4,00' },
          { name: 'Cream Cheese Maçaricado', price: '5,00' },
          { name: 'Couve Crispy no Topo', price: '3,50' },
          { name: 'Geleia de Pimenta', price: '3,00' },
        ],
      },
      {
        id: 'rice-jp',
        chipLabel: '🍚 + Arroz / Low Carb',
        groupName: 'Preparo do Arroz',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 1,
        items: [
          { name: 'Arroz Japonês Tradicional', price: '0,00' },
          { name: 'Sem Arroz (Low Carb / Fit)', price: '0,00' },
          { name: 'Arroz Integral Especial', price: '3,00' },
        ],
      },
    ],
  },
  BURGER_HOUSE: {
    label: 'Hamburgueria Artesanal',
    badge: 'Hamburgueria',
    emoji: '🍔',
    description:
      'Hamburgueria com opções de ponto da carne, tipos de pão, molhos da casa e adicionais.',
    presets: [
      {
        id: 'meat-point',
        chipLabel: '🥩 + Ponto da Carne',
        groupName: 'Ponto da Carne',
        isRequired: true,
        minSelectable: 1,
        maxSelectable: 1,
        items: [
          { name: 'Ao Ponto (Recomendado)', price: '0,00' },
          { name: 'Mal Passado (Suculento)', price: '0,00' },
          { name: 'Bem Passado', price: '0,00' },
        ],
      },
      {
        id: 'bread',
        chipLabel: '🍞 + Tipo de Pão',
        groupName: 'Tipo de Pão',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 1,
        items: [
          { name: 'Pão Brioche Tostado na Manteiga', price: '0,00' },
          { name: 'Pão Australiano', price: '0,00' },
          { name: 'Pão Tradicional com Gergelim', price: '0,00' },
        ],
      },
      {
        id: 'burger-extras',
        chipLabel: '🥓 + Bacon & Adicionais',
        groupName: 'Turbine seu Burger',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 4,
        items: [
          { name: 'Bacon Crocante em Tiras', price: '5,00' },
          { name: 'Cheddar Cremoso Melt Extra', price: '4,00' },
          { name: 'Cebola Caramelizada', price: '3,00' },
          { name: 'Hambúrguer Extra 160g', price: '10,00' },
        ],
      },
      {
        id: 'sauces',
        chipLabel: '🥫 + Molhos da Casa',
        groupName: 'Opção de Molho',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 2,
        items: [
          { name: 'Maionese Verde da Casa', price: '0,00' },
          { name: 'Barbecue Defumado', price: '0,00' },
          { name: 'Maionese de Bacon Artesanal', price: '3,00' },
          { name: 'Sem Molho', price: '0,00' },
        ],
      },
    ],
  },
  PIZZERIA: {
    label: 'Pizzaria',
    badge: 'Pizzaria',
    emoji: '🍕',
    description:
      'Pizzaria com opções de bordas recheadas, massas e ingredientes adicionais.',
    presets: [
      {
        id: 'crust',
        chipLabel: '🍕 + Borda Recheada',
        groupName: 'Borda Recheada',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 1,
        items: [
          { name: 'Sem Borda Recheada', price: '0,00' },
          { name: 'Borda Catupiry Original', price: '10,00' },
          { name: 'Borda Cheddar Cremoso', price: '10,00' },
          { name: 'Borda Chocolate ao Leite', price: '12,00' },
        ],
      },
      {
        id: 'dough',
        chipLabel: '🌾 + Tipo de Massa',
        groupName: 'Tipo de Massa',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 1,
        items: [
          { name: 'Massa Tradicional', price: '0,00' },
          { name: 'Massa Fina Crocante', price: '0,00' },
          { name: 'Massa Pan Alta', price: '5,00' },
        ],
      },
      {
        id: 'pizza-extras',
        chipLabel: '🧀 + Ingredientes Extras',
        groupName: 'Ingredientes Extras',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 3,
        items: [
          { name: 'Muçarela Extra', price: '8,00' },
          { name: 'Bacon em Cubos', price: '6,00' },
          { name: 'Cebola Roxa Fatiada', price: '3,00' },
          { name: 'Alho Frito Crocante', price: '3,00' },
        ],
      },
    ],
  },
  PASTRY: {
    label: 'Pastelaria & Frituras',
    badge: 'Pastelaria',
    emoji: '🥟',
    description:
      'Pastéis com tipos de massa crocante, vinagrete, molhos e adicionais de recheio.',
    presets: [
      {
        id: 'pastry-dough',
        chipLabel: '🥟 + Massa do Pastel',
        groupName: 'Massa do Pastel',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 1,
        items: [
          { name: 'Massa Tradicional Crocante', price: '0,00' },
          { name: 'Massa com Pimenta Suave', price: '0,00' },
          { name: 'Massa Integral', price: '2,00' },
        ],
      },
      {
        id: 'pastry-sauce',
        chipLabel: '🥫 + Molhos & Vinagrete',
        groupName: 'Acompanhamentos',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 2,
        items: [
          { name: 'Vinagrete da Casa Fresco', price: '0,00' },
          { name: 'Pimenta Especial da Casa', price: '0,00' },
          { name: 'Maionese Verde', price: '0,00' },
        ],
      },
      {
        id: 'pastry-extras',
        chipLabel: '🧀 + Recheio Extra',
        groupName: 'Adicionais de Recheio',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 3,
        items: [
          { name: 'Catupiry Extra', price: '4,00' },
          { name: 'Queijo Prato Extra', price: '4,00' },
          { name: 'Bacon Picado', price: '3,50' },
          { name: 'Ovo Picado', price: '2,00' },
        ],
      },
    ],
  },
  RESTAURANT: {
    label: 'Restaurante Tradicional / Executivo',
    badge: 'Restaurante',
    emoji: '🍽️',
    description:
      'Pratos executivos, porções e refeições completas com acompanhamentos e guarnições.',
    presets: [
      {
        id: 'sides',
        chipLabel: '🍚 + Acompanhamentos',
        groupName: 'Acompanhamentos do Prato',
        isRequired: true,
        minSelectable: 1,
        maxSelectable: 3,
        items: [
          { name: 'Arroz Branco', price: '0,00' },
          { name: 'Feijão Carioca', price: '0,00' },
          { name: 'Feijão Preto', price: '0,00' },
          { name: 'Batata Frita Crocante', price: '0,00' },
          { name: 'Farofa da Casa', price: '0,00' },
          { name: 'Salada Verde Simples', price: '0,00' },
        ],
      },
      {
        id: 'meat-point-exec',
        chipLabel: '🥩 + Ponto da Carne (se houver)',
        groupName: 'Ponto da Carne',
        isRequired: false,
        minSelectable: 0,
        maxSelectable: 1,
        items: [
          { name: 'Ao Ponto (Recomendado)', price: '0,00' },
          { name: 'Mal Passado', price: '0,00' },
          { name: 'Bem Passado', price: '0,00' },
        ],
      },
    ],
  },
};

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

  // Sistema de Identificação da Categoria Gastronômica
  const specialtyKey = useMemo(() => {
    const raw =
      (tenant as any)?.company?.category ||
      (tenant as any)?.category ||
      (tenant as any)?.restaurantCategory ||
      (tenant as any)?.company?.branding?.category ||
      'BURGER_HOUSE';
    const upper = String(raw).toUpperCase();
    return SPECIALTY_CONFIGS[upper] ? upper : 'BURGER_HOUSE';
  }, [tenant]);

  const specialty = SPECIALTY_CONFIGS[specialtyKey];

  // Basic food fields
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Controle de Estoque Opcional (Default: desativado / produção contínua)
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('50');
  const [minStockAlert, setMinStockAlert] = useState('5');

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
    setImageUrl('');
    setTrackStock(false);
    setStockQuantity('50');
    setMinStockAlert('5');
    setModifierGroups([]);
    setIsCreatingCategory(false);
    setNewCategoryName('');
  };

  // Add Preset by definition
  const handleAddPreset = (preset: PresetDef) => {
    if (
      modifierGroups.some(
        (g) => g.name.toLowerCase() === preset.groupName.toLowerCase(),
      )
    ) {
      toast.info(`O grupo "${preset.groupName}" já está na lista.`);
      return;
    }

    const newGroup: ModifierGroupInput = {
      tempId: preset.id + '-' + Date.now(),
      name: preset.groupName,
      isRequired: preset.isRequired,
      minSelectable: preset.minSelectable,
      maxSelectable: preset.maxSelectable,
      items: preset.items.map((it, idx) => ({
        tempId: String(Date.now() + idx),
        name: it.name,
        price: it.price,
      })),
    };

    setModifierGroups((prev) => [...prev, newGroup]);
    toast.success(`Grupo "${preset.groupName}" adicionado!`);
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
        { tempId: String(Date.now()), name: '', price: '0,00' },
      ],
    };

    setModifierGroups((prev) => [...prev, newGroup]);
  };

  // Remove Group
  const handleRemoveGroup = (groupIndex: number) => {
    setModifierGroups((prev) => prev.filter((_, idx) => idx !== groupIndex));
  };

  // Update Group Header
  const handleUpdateGroup = (
    groupIndex: number,
    field: keyof ModifierGroupInput,
    value: any,
  ) => {
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
      const items = [
        ...copy[groupIndex].items,
        { tempId: String(Date.now()), name: '', price: '0,00' },
      ];
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
    value: string,
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
        return apiPost(`/tenant-app/${effectiveSlug}/categories`, {
          name: catName,
          color: '#f59e0b',
        });
      }
      return apiPost(`/restaurant/categories`, {
        name: catName,
        color: '#f59e0b',
      });
    },
    onSuccess: (newCat) => {
      if (effectiveSlug) {
        queryClient.invalidateQueries({
          queryKey: ['pos-products', effectiveSlug],
        });
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
        queryClient.invalidateQueries({
          queryKey: ['pos-products', effectiveSlug],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['pos-products-or-menu'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-session'] });

      toast.success(`🎉 Comida "${newProduct.name}" cadastrada no cardápio!`);
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
      toast.error('Informe o nome da comida / prato');
      return;
    }

    const priceCents = Math.round(
      parseFloat(salePrice.replace(',', '.') || '0') * 100,
    );
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
            priceCents: Math.round(
              parseFloat(i.price.replace(',', '.') || '0') * 100,
            ),
          }));

        return {
          name: g.name.trim(),
          isRequired: g.isRequired,
          minSelectable: g.isRequired
            ? Math.max(1, g.minSelectable)
            : g.minSelectable,
          maxSelectable: Math.max(1, g.maxSelectable),
          items: validItems,
        };
      })
      .filter((g) => g.items.length > 0);

    const finalStock = trackStock ? (parseFloat(stockQuantity) || 0) : 999999;
    const finalMinAlert = trackStock ? (parseFloat(minStockAlert) || 0) : 0;

    const payload = {
      name: name.trim(),
      salePriceCents: priceCents,
      costPriceCents: 0,
      stockQuantity: finalStock,
      minStockAlert: finalMinAlert,
      unit: 'UN',
      categoryId: categoryId || null,
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      modifierGroups: validGroups,
    };

    createFoodMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl max-h-[92vh] flex flex-col font-sans">
        <DialogHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-black text-zinc-900 dark:text-white">
                    Nova Comida & Cardápio
                  </DialogTitle>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80">
                    <span>{specialty.emoji}</span>
                    <span>{specialty.badge}</span>
                  </span>
                </div>
                <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                  Cadastre o prato para o salão de mesas, pedidos e aplicativo.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 my-2 flex-1 overflow-y-auto pr-1"
        >
          {/* Informações Básicas da Comida */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Nome da Comida / Prato *
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  specialtyKey === 'JAPANESE'
                    ? 'Ex: Combo Salmão 20 Peças, Temaki Hot Filadélfia, Sashimi de Atum'
                    : specialtyKey === 'BURGER_HOUSE'
                    ? 'Ex: Smash Burger Duplo Cheddar, Picanha Artesanal, Fritas com Bacon'
                    : specialtyKey === 'PIZZERIA'
                    ? 'Ex: Pizza Calabresa Especial, Pizza Marguerita Gourmet'
                    : 'Ex: Prato Feito Executivo, Contrafilé na Chapa, Pastel Especial'
                }
                className="rounded-xl mt-1 text-xs h-10 bg-zinc-50/70 dark:bg-zinc-800 border-zinc-200"
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
                  placeholder="28,90"
                  className="pl-9 rounded-xl text-xs h-10 font-bold bg-zinc-50/70 dark:bg-zinc-800 border-zinc-200"
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
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Nova</span>
                  </button>
                )}
              </div>

              {isCreatingCategory ? (
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Ex: Sushis, Sobremesas, Bebidas"
                    className="h-10 text-xs rounded-xl border-zinc-200"
                    autoFocus
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
                    className="h-10 px-3 rounded-xl bg-zinc-900 text-white text-xs shrink-0 cursor-pointer"
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingCategory(false)}
                    className="h-10 px-2 text-xs text-zinc-400 cursor-pointer"
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
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
                placeholder="Ex: Acompanha cebolinha fresca, gergelim torrado e molho especial..."
                className="rounded-xl mt-1 text-xs h-10 bg-zinc-50/70 dark:bg-zinc-800 border-zinc-200"
              />
            </div>

            {/* Foto do Prato / Comida */}
            <div className="sm:col-span-2">
              <ImageUploadField
                value={imageUrl}
                onChange={setImageUrl}
                label="Foto da Comida / Prato"
                helperText="Formatos aceitos: JPG, PNG, WEBP. A imagem aparecerá no cardápio, mesas e pedidos."
              />
            </div>

            {/* Controle de Estoque Opcional */}
            <div className="sm:col-span-2 rounded-2xl border border-zinc-200/80 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        Controle de Estoque
                      </span>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-200/60 dark:bg-zinc-700 px-1.5 py-0.2 rounded-full">
                        Opcional
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 block">
                      {trackStock
                        ? 'Estoque com contagem e alertas de reposição ativados'
                        : 'Prato preparado na cozinha sob demanda (estoque livre / sem limite)'}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackStock}
                    onChange={(e) => setTrackStock(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-900 dark:peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {trackStock && (
                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-700 grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                  <div>
                    <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                      Quantidade Inicial
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      placeholder="Ex: 50"
                      className="h-8 text-xs mt-1 bg-white dark:bg-zinc-900 font-mono rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                      Alerta de Estoque Mínimo
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={minStockAlert}
                      onChange={(e) => setMinStockAlert(e.target.value)}
                      placeholder="Ex: 5"
                      className="h-8 text-xs mt-1 bg-white dark:bg-zinc-900 font-mono rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── SEÇÃO DE PERSONALIZAÇÃO & OPÇÕES INTELIGENTES ─── */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                    Opções de Personalização
                  </h3>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-zinc-100 text-zinc-800 border-zinc-300"
                  >
                    {specialty.label}
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed max-w-lg">
                  {specialty.description}
                </p>
              </div>

              {/* Botão para limpar todas */}
              {modifierGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModifierGroups([])}
                  className="text-[11px] font-bold text-zinc-400 hover:text-rose-600 transition flex items-center gap-1 shrink-0 cursor-pointer pt-0.5"
                >
                  <X className="w-3 h-3" />
                  <span>Sem Opcionais (Venda Simples)</span>
                </button>
              )}
            </div>

            {/* Presets em Chips de 1 Toque */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/70 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Atalhos Rápidos Recomendados (1 Clique):
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {specialty.presets.map((preset) => {
                  const alreadyAdded = modifierGroups.some(
                    (g) =>
                      g.name.toLowerCase() === preset.groupName.toLowerCase(),
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => handleAddPreset(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                        alreadyAdded
                          ? 'bg-zinc-200 text-zinc-400 border border-transparent cursor-not-allowed opacity-60'
                          : 'bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <span>{preset.chipLabel}</span>
                      {alreadyAdded && (
                        <Check className="w-3 h-3 text-emerald-600" />
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddCustomGroup}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-transparent hover:bg-white border border-dashed border-zinc-300 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>＋ Criar Grupo Manual</span>
                </button>
              </div>
            </div>

            {/* Lista de Grupos Adicionados */}
            {modifierGroups.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/40 text-center space-y-1">
                <p className="text-xs font-bold text-zinc-600">
                  Nenhum adicional ou personalização selecionada
                </p>
                <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                  {specialtyKey === 'JAPANESE'
                    ? 'Este prato será lançado diretamente na comanda ou tablet sem exigir escolha de adicionais.'
                    : 'Clique nos atalhos acima se este prato tiver opções (ponto, bordas, adicionais ou molhos).'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {modifierGroups.map((group, gIdx) => (
                  <div
                    key={group.tempId}
                    className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 space-y-3 shadow-2xs"
                  >
                    {/* Linha 1: Título do Grupo e Ações Rápidas */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100 dark:border-zinc-700/60">
                      <div className="flex-1 min-w-[200px]">
                        <Label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Nome do Grupo
                        </Label>
                        <Input
                          value={group.name}
                          onChange={(e) =>
                            handleUpdateGroup(gIdx, 'name', e.target.value)
                          }
                          placeholder="Ex: Ponto da Carne, Tipo de Pão, Molhos"
                          className="h-9 text-xs font-bold rounded-xl bg-zinc-50 border-zinc-200"
                        />
                      </div>

                      {/* Toggles de Obrigatório e Seleção */}
                      <div className="flex items-center gap-2 flex-wrap sm:pt-4">
                        {/* Toggle Obrigatório */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = !group.isRequired;
                            handleUpdateGroup(gIdx, 'isRequired', next);
                            if (next && group.minSelectable === 0) {
                              handleUpdateGroup(gIdx, 'minSelectable', 1);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                            group.isRequired
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              group.isRequired ? 'bg-rose-600' : 'bg-zinc-400'
                            }`}
                          />
                          <span>
                            {group.isRequired
                              ? 'Obrigatório (Escolha Exigida)'
                              : 'Opcional (Cliente Escolhe se Quiser)'}
                          </span>
                        </button>

                        {/* Modo: 1 Opção vs Múltiplos */}
                        <div className="flex items-center rounded-xl bg-zinc-100 p-0.5 border border-zinc-200">
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateGroup(gIdx, 'maxSelectable', 1);
                              if (group.isRequired) {
                                handleUpdateGroup(gIdx, 'minSelectable', 1);
                              }
                            }}
                            className={`px-2 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                              group.maxSelectable === 1
                                ? 'bg-white text-zinc-900 shadow-2xs'
                                : 'text-zinc-500 hover:text-zinc-800'
                            }`}
                          >
                            Escolha 1
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateGroup(gIdx, 'maxSelectable', 4)
                            }
                            className={`px-2 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                              group.maxSelectable > 1
                                ? 'bg-white text-zinc-900 shadow-2xs'
                                : 'text-zinc-500 hover:text-zinc-800'
                            }`}
                          >
                            Vários (até {group.maxSelectable > 1 ? group.maxSelectable : 4})
                          </button>
                        </div>

                        {/* Excluir Grupo */}
                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(gIdx)}
                          className="w-8 h-8 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer"
                          title="Excluir Grupo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Linha 2: Opções do Grupo */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">
                          Opções Cadastradas ({group.items.length})
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          Preço adicional com R$ 0,00 é gratuito
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items.map((item, iIdx) => (
                          <div
                            key={item.tempId}
                            className="flex items-center gap-1.5 bg-zinc-50 p-2 rounded-xl border border-zinc-200"
                          >
                            <Input
                              value={item.name}
                              onChange={(e) =>
                                handleUpdateItemInGroup(
                                  gIdx,
                                  iIdx,
                                  'name',
                                  e.target.value,
                                )
                              }
                              placeholder="Nome da opção (ex: Wasabi, Bacon)"
                              className="h-8 text-xs font-semibold rounded-lg bg-white border-zinc-200 flex-1"
                            />
                            <div className="relative w-24 shrink-0">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400">
                                +R$
                              </span>
                              <Input
                                value={item.price}
                                onChange={(e) =>
                                  handleUpdateItemInGroup(
                                    gIdx,
                                    iIdx,
                                    'price',
                                    e.target.value,
                                  )
                                }
                                placeholder="0,00"
                                className="h-8 pl-7 text-xs font-mono font-bold rounded-lg bg-white border-zinc-200"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveItemFromGroup(gIdx, iIdx)
                              }
                              className="w-7 h-7 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer"
                              title="Remover Opção"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddItemToGroup(gIdx)}
                        className="text-xs text-zinc-700 font-bold gap-1.5 h-8 px-3 rounded-xl border-dashed border-zinc-300 hover:bg-zinc-50 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Adicionar Mais uma Opção</span>
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
              className="rounded-xl text-xs text-zinc-500 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createFoodMutation.isPending}
              className="rounded-2xl gap-2 bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs px-6 h-11 shadow-sm cursor-pointer"
            >
              {createFoodMutation.isPending ? (
                <span>Salvando Prato...</span>
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

export default CreateFoodProductDialog;
