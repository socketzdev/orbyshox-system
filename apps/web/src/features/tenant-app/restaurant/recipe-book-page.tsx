import React, { useState, useMemo } from 'react';
import { useTenant } from '../context/tenant-context';
import {
  BookOpen,
  Plus,
  Search,
  DollarSign,
  PieChart,
  Percent,
  Layers,
  ArrowUpRight,
  TrendingDown,
  Clock,
  Sparkles,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Scale,
  ChefHat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import {
  RecipeItem,
  RecipeIngredient,
  calculateRecipeCost,
  calculateCmvPercentage,
  calculateGrossMargin,
  simulateStockConsumption,
} from './recipe-calculator';

// Sem ficha de exemplo: a casa cadastra as suas (vazio mostra vazio).
const INITIAL_RECIPES: RecipeItem[] = [];

export const RecipeBookPage: React.FC = () => {
  const { slug } = useTenant();

  const [recipes, setRecipes] = useState<RecipeItem[]>(() => {
    const saved = localStorage.getItem(`restaurant_recipes_${slug}`);
    return saved ? JSON.parse(saved) : INITIAL_RECIPES;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeItem | null>(null);

  // Delete confirmation state
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

  // Simulation Modal State
  const [simulatingRecipe, setSimulatingRecipe] = useState<RecipeItem | null>(null);
  const [simulationPortions, setSimulationPortions] = useState(10);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Hambúrgueres');
  const [formPrice, setFormPrice] = useState(30.0);
  const [formPrepTime, setFormPrepTime] = useState(15);
  const [formIngredients, setFormIngredients] = useState<RecipeIngredient[]>([]);

  // New Ingredient Input State
  const [ingName, setIngName] = useState('');
  const [ingQty, setIngQty] = useState(1);
  const [ingUnit, setIngUnit] = useState<'g' | 'kg' | 'ml' | 'L' | 'un' | 'fatia'>('un');
  const [ingCost, setIngCost] = useState(2.0);

  // Save changes helper
  const saveRecipes = (newRecipes: RecipeItem[]) => {
    setRecipes(newRecipes);
    localStorage.setItem(`restaurant_recipes_${slug}`, JSON.stringify(newRecipes));
  };

  // KPIs
  const kpis = useMemo(() => {
    if (recipes.length === 0) return { avgCmv: 0, bestMargin: null, totalItems: 0 };

    const totalCmv = recipes.reduce((acc, rec) => {
      const cost = calculateRecipeCost(rec.ingredients);
      return acc + calculateCmvPercentage(cost, rec.salePrice);
    }, 0);

    const avgCmv = Number((totalCmv / recipes.length).toFixed(1));

    const sortedByMargin = [...recipes].sort((a, b) => {
      const marginA = calculateGrossMargin(calculateRecipeCost(a.ingredients), a.salePrice).amount;
      const marginB = calculateGrossMargin(calculateRecipeCost(b.ingredients), b.salePrice).amount;
      return marginB - marginA;
    });

    return {
      avgCmv,
      bestMargin: sortedByMargin[0] || null,
      totalItems: recipes.length,
    };
  }, [recipes]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(recipes.map((r) => r.category));
    return Array.from(set);
  }, [recipes]);

  // Filtered recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchCat = selectedCategory === 'ALL' || r.category === selectedCategory;
      const matchSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [recipes, selectedCategory, searchQuery]);

  const handleOpenNewModal = () => {
    setEditingRecipe(null);
    setFormName('');
    setFormCategory('Hambúrgueres');
    setFormPrice(30.0);
    setFormPrepTime(15);
    setFormIngredients([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rec: RecipeItem) => {
    setEditingRecipe(rec);
    setFormName(rec.name);
    setFormCategory(rec.category);
    setFormPrice(rec.salePrice);
    setFormPrepTime(rec.preparationTimeMinutes);
    setFormIngredients([...rec.ingredients]);
    setIsModalOpen(true);
  };

  const handleAddIngredient = () => {
    if (!ingName.trim()) return;
    const newIng: RecipeIngredient = {
      id: `ing-${Date.now()}`,
      name: ingName.trim(),
      quantity: Number(ingQty),
      unit: ingUnit,
      unitCost: Number(ingCost),
    };
    setFormIngredients([...formIngredients, newIng]);
    setIngName('');
    setIngQty(1);
    setIngCost(2.0);
  };

  const handleRemoveIngredient = (id: string) => {
    setFormIngredients(formIngredients.filter((i) => i.id !== id));
  };

  const handleSaveRecipe = () => {
    if (!formName.trim()) return;

    const recipeData: RecipeItem = {
      id: editingRecipe ? editingRecipe.id : `rec-${Date.now()}`,
      name: formName.trim(),
      category: formCategory,
      salePrice: Number(formPrice),
      preparationTimeMinutes: Number(formPrepTime),
      ingredients: formIngredients,
    };

    if (editingRecipe) {
      saveRecipes(recipes.map((r) => (r.id === editingRecipe.id ? recipeData : r)));
    } else {
      saveRecipes([...recipes, recipeData]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipeToDelete(id);
  };

  const confirmDeleteRecipe = () => {
    if (recipeToDelete) {
      saveRecipes(recipes.filter((r) => r.id !== recipeToDelete));
      setRecipeToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Top KPIs Bar ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">CMV Médio do Cardápio</span>
            <PieChart className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-bold font-mono text-zinc-900">{kpis.avgCmv}%</p>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Meta ideal &lt; 32%
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">Custo de mercadoria sobre faturamento</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Prato Mais Rentável</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          {kpis.bestMargin ? (
            <div className="mt-2">
              <p className="text-lg font-bold text-zinc-900 truncate">
                {kpis.bestMargin.name}
              </p>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-700 mt-0.5">
                <span>
                  +R${' '}
                  {calculateGrossMargin(
                    calculateRecipeCost(kpis.bestMargin.ingredients),
                    kpis.bestMargin.salePrice
                  ).amount.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-zinc-400 font-sans font-normal">por unidade</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400 mt-2">Nenhum prato cadastrado</p>
          )}
        </div>

        <div className="bg-zinc-900 text-white rounded-2xl p-5 border border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total Fichas Técnicas</span>
            <ChefHat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-3xl font-bold font-mono text-white">{kpis.totalItems}</p>
            <Button
              size="sm"
              onClick={handleOpenNewModal}
              className="bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs rounded-xl h-8 px-3 gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Ficha
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Search & Category Filters ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={selectedCategory === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('ALL')}
            className={`rounded-xl text-xs font-semibold h-8 ${selectedCategory === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'}`}
          >
            Todas ({recipes.length})
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl text-xs font-semibold h-8 ${selectedCategory === cat ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'}`}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar ficha técnica..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs rounded-xl bg-white border-zinc-200"
          />
        </div>
      </div>

      {/* ─── Recipes Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRecipes.map((recipe) => {
          const cost = calculateRecipeCost(recipe.ingredients);
          const cmvPercent = calculateCmvPercentage(cost, recipe.salePrice);
          const margin = calculateGrossMargin(cost, recipe.salePrice);

          const isCmvExcellent = cmvPercent <= 30;
          const isCmvWarning = cmvPercent > 35;

          return (
            <div
              key={recipe.id}
              className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      {recipe.category}
                    </span>
                    <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                      {recipe.name}
                    </h3>
                  </div>

                  {/* CMV Badge */}
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      isCmvExcellent
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : isCmvWarning
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    CMV {cmvPercent}%
                  </span>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/60 mb-3 text-center">
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">Custo Insumos</span>
                    <span className="text-xs font-mono font-bold text-zinc-800">
                      R$ {cost.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">Preço Venda</span>
                    <span className="text-xs font-mono font-bold text-zinc-900">
                      R$ {recipe.salePrice.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">Margem Bruta</span>
                    <span className="text-xs font-mono font-bold text-emerald-700">
                      R$ {margin.amount.toFixed(2).replace('.', ',')} ({margin.percentage}%)
                    </span>
                  </div>
                </div>

                {/* Ingredients List */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                    <span>Composição ({recipe.ingredients.length} insumos)</span>
                    <span>Qtd / Custo</span>
                  </div>

                  <div className="space-y-1">
                    {recipe.ingredients.map((ing) => {
                      let costCalc = ing.quantity * ing.unitCost;
                      if (ing.unit === 'g' || ing.unit === 'ml') costCalc = (ing.quantity / 1000) * ing.unitCost;

                      return (
                        <div
                          key={ing.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-xl bg-zinc-50/50 border border-zinc-100"
                        >
                          <span className="text-zinc-700 font-medium truncate max-w-[210px]">
                            {ing.name}
                          </span>
                          <span className="text-zinc-500 font-mono text-[11px]">
                            {ing.quantity} {ing.unit} • R$ {costCalc.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSimulatingRecipe(recipe);
                    setSimulationPortions(10);
                  }}
                  className="h-8 text-xs font-semibold rounded-xl text-zinc-700 bg-zinc-50 border-zinc-200 gap-1"
                >
                  <Scale className="w-3.5 h-3.5 text-zinc-500" />
                  Simular Baixa Estoque
                </Button>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEditModal(recipe)}
                    className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 rounded-xl"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRecipes.length === 0 && (
        <div className="p-12 text-center rounded-3xl border border-dashed border-zinc-300 bg-white">
          <ChefHat className="w-10 h-10 mx-auto mb-2 text-zinc-300" />
          <p className="font-bold text-zinc-700">Nenhuma ficha técnica cadastrada</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            Cadastre a composição dos seus pratos para calcular custo, CMV e margem de verdade.
          </p>
          <Button
            size="sm"
            onClick={handleOpenNewModal}
            className="mt-4 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl h-9 px-4 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Cadastrar primeira ficha
          </Button>
        </div>
      )}

      {/* ─── Modal: Cadastro / Edição de Ficha Técnica ─── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-zinc-900">
              {editingRecipe ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica (Engenharia de Cardápio)'}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Cadastre a composição detalhada com baixa fracionada de insumos e cálculo automático de CMV
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Header Form Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs text-zinc-600 mb-1 block">Nome do Prato</Label>
                <Input
                  placeholder="Ex: X-Salada Artesanal"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Categoria</Label>
                <Input
                  placeholder="Ex: Hambúrgueres"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-600 mb-1 block">Preço de Venda (R$)</Label>
                <Input
                  type="number"
                  step="0.10"
                  value={formPrice}
                  onChange={(e) => setFormPrice(Number(e.target.value))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
            </div>

            {/* Insumos & Ficha Técnica */}
            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/70 space-y-3">
              <span className="text-xs font-bold text-zinc-800 block">Adicionar Insumo à Receita</span>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Nome do insumo (ex: Carne Bovina Blend)"
                    value={ingName}
                    onChange={(e) => setIngName(e.target.value)}
                    className="h-8 text-xs rounded-xl bg-white"
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Qtd"
                    value={ingQty}
                    onChange={(e) => setIngQty(Number(e.target.value))}
                    className="h-8 text-xs rounded-xl bg-white font-mono"
                  />
                </div>

                <div>
                  <Select value={ingUnit} onValueChange={(val: any) => setIngUnit(val)}>
                    <SelectTrigger className="h-8 text-xs rounded-xl bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="un">un (unidade)</SelectItem>
                      <SelectItem value="g">g (gramas)</SelectItem>
                      <SelectItem value="kg">kg (quilos)</SelectItem>
                      <SelectItem value="ml">ml (mililitros)</SelectItem>
                      <SelectItem value="L">L (litros)</SelectItem>
                      <SelectItem value="fatia">fatia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Button
                    size="sm"
                    type="button"
                    onClick={handleAddIngredient}
                    className="w-full h-8 text-xs font-bold bg-zinc-900 text-white rounded-xl"
                  >
                    + Adicionar
                  </Button>
                </div>
              </div>

              {/* Lista dos insumos na receita */}
              <div className="space-y-1.5 pt-2 max-h-40 overflow-y-auto">
                {formIngredients.length === 0 ? (
                  <span className="text-xs text-zinc-400 block text-center py-2">
                    Nenhum ingrediente adicionado ainda.
                  </span>
                ) : (
                  formIngredients.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-200 text-xs"
                    >
                      <span className="font-semibold text-zinc-800">{item.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-zinc-600">
                          {item.quantity} {item.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(item.id)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Resumo Dinâmico do CMV */}
            {formIngredients.length > 0 && (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-emerald-900 font-bold block">
                    Custo Total dos Insumos: R${' '}
                    {calculateRecipeCost(formIngredients).toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-emerald-700 text-[11px]">
                    Margem Bruta:{' '}
                    {calculateGrossMargin(calculateRecipeCost(formIngredients), formPrice).percentage}%
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-800 block">
                    CMV Estimado:{' '}
                    {calculateCmvPercentage(calculateRecipeCost(formIngredients), formPrice)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRecipe}
              className="bg-zinc-900 text-white text-xs font-bold rounded-xl"
            >
              Salvar Ficha Técnica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Simulação de Baixa Fracionada no Estoque ─── */}
      <Dialog open={Boolean(simulatingRecipe)} onOpenChange={() => setSimulatingRecipe(null)}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-zinc-500" />
              Simulação de Baixa Fracionada
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Cálculo exato de matéria-prima consumida no estoque para {simulatingRecipe?.name}
            </DialogDescription>
          </DialogHeader>

          {simulatingRecipe && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-zinc-600 shrink-0">Porções Vendidas:</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={simulationPortions}
                  onChange={(e) => setSimulationPortions(Math.max(1, Number(e.target.value)))}
                  className="h-9 text-xs rounded-xl w-24 font-mono"
                />
                <span className="text-xs text-zinc-400">unidades no turno</span>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-zinc-700 block">
                  Baixa Real no Estoque:
                </span>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {simulateStockConsumption(simulatingRecipe.ingredients, simulationPortions).map(
                    (item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/80 text-xs"
                      >
                        <span className="font-medium text-zinc-800">{item.name}</span>
                        <span className="font-mono font-bold text-zinc-900">
                          - {item.consumed} {item.unit}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              size="sm"
              onClick={() => setSimulatingRecipe(null)}
              className="w-full bg-zinc-900 text-white text-xs font-bold rounded-xl"
            >
              Fechar Simulação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={recipeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setRecipeToDelete(null);
        }}
        title="Excluir ficha técnica"
        description="Tem certeza que deseja excluir esta ficha técnica? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={confirmDeleteRecipe}
      />
    </div>
  );
};
