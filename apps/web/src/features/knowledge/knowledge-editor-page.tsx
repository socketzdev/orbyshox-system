import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Save, Trash2, Eye, Plus } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_CATEGORIES = ['Onboarding', 'Pagamentos', 'Suporte', 'API', 'Operação'];

export const KnowledgeEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge', id],
    queryFn: () => apiGet(`/knowledge/${id}`),
    enabled: isEdit,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['knowledge-categories'],
    queryFn: () => apiGet('/knowledge/categories'),
  });

  const categories = Array.from(
    new Set([
      ...(Array.isArray(categoriesData) ? categoriesData : []),
      ...DEFAULT_CATEGORIES,
    ]),
  );

  useEffect(() => {
    if (data) {
      setTitle(data.title || '');
      setCategory(data.category || '');
      setContent(data.content || '');
      setIsPublished(Boolean(data.isPublished));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      isEdit ? apiPatch(`/knowledge/${id}`, payload) : apiPost('/knowledge', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success(isEdit ? 'Artigo atualizado' : 'Artigo criado');
      navigate('/knowledge');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao salvar artigo');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/knowledge/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success('Artigo excluído');
      navigate('/knowledge');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Falha ao excluir artigo');
    },
  });

  const handleSave = () => {
    if (!title.trim() || !category.trim() || !content.trim()) {
      toast.error('Preencha título, categoria e conteúdo');
      return;
    }
    saveMutation.mutate({ title, category, content, isPublished });
  };

  if (isEdit && isLoading) {
    return <div className="p-12 text-center text-xs text-zinc-500">Carregando artigo...</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/knowledge')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              {isEdit ? 'Editar Artigo' : 'Novo Artigo'}
            </h1>
            <p className="text-xs text-zinc-500">Conteúdo em Markdown.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="published" checked={isPublished} onCheckedChange={setIsPublished} />
            <Label htmlFor="published">{isPublished ? 'Publicado' : 'Rascunho'}</Label>
          </div>

          {isEdit && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Excluir Artigo</DialogTitle>
                  <DialogDescription>
                    Tem certeza que deseja excluir o artigo "{title}"? Esta ação não pode ser desfeita.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancelar</Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    Confirmar exclusão
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 gap-6 lg:grid-cols-3 overflow-hidden">
        <div className="flex h-full flex-col gap-4 overflow-y-auto pb-4 pr-2 lg:col-span-2">
          <div>
            <Label htmlFor="title" className="mb-2 block">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Como configurar a integração com a API"
              className="text-base font-medium"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="category" className="mb-2 block">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" type="button">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar categoria</DialogTitle>
                </DialogHeader>
                <div className="py-3">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Ex: Operações de Caixa"
                  />
                  <p className="mt-2 text-[11px] text-zinc-500">
                    A categoria será persistida assim que você salvar um artigo com ela.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancelar</Button>
                  <Button
                    onClick={() => {
                      if (!newCategory.trim()) {
                        toast.error('Informe o nome da categoria');
                        return;
                      }
                      setCategory(newCategory);
                      setNewCategory('');
                      setShowCategoryDialog(false);
                    }}
                  >
                    Selecionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex min-h-[300px] flex-1 flex-col">
            <Label htmlFor="content" className="mb-2 block">Conteúdo (Markdown)</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Título Principal&#10;&#10;Escreva o conteúdo aqui utilizando markdown..."
              className="flex-1 resize-none font-mono"
            />
          </div>
        </div>

        <div className="hidden lg:flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-2 border-b border-zinc-200 bg-white p-2 text-xs font-medium text-zinc-500">
            <Eye className="h-3.5 w-3.5" />
            Visualização
          </div>
          <div className="prose prose-sm max-w-none overflow-y-auto p-5">
            {title && <h1 className="text-zinc-900">{title}</h1>}
            <div className="whitespace-pre-wrap text-zinc-700">
              {content || <span className="italic text-zinc-400">O conteúdo aparecerá aqui...</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
