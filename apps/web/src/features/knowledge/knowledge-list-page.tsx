import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { CossBadge, CossEmpty, CossSpinner } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { Plus, Search, User, Calendar, BookOpen, ExternalLink, Sparkles } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  authorName: string;
  createdAt: string;
  isPublished: boolean;
}

interface KnowledgeResponse {
  data: KnowledgeArticle[];
  total: number;
}

export const KnowledgeListPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('published');

  const debouncedSearch = useDebounce(search, 500);

  const { data, isLoading } = useQuery<KnowledgeResponse>({
    queryKey: ['knowledge', debouncedSearch, category, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (category !== 'all') params.append('category', category);
      params.append('isPublished', status === 'published' ? 'true' : 'false');
      return apiGet(`/knowledge?${params.toString()}`);
    },
  });

  const articles = data?.data || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Artigos técnicos, manuais de onboarding e documentação de ajuda para seus assinantes.
        </p>
        <Button
          onClick={() => navigate('/knowledge/new')}
          className="h-10 px-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-2xs gap-2"
        >
          <Plus className="h-4 w-4" /> Novo Artigo
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por título ou assunto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Category Select */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 px-3 rounded-xl border border-zinc-200/80 bg-zinc-50 text-xs font-medium text-zinc-800 focus:bg-white focus:border-zinc-900 focus:outline-none"
          >
            <option value="all">Todas as Categorias</option>
            <option value="getting-started">Primeiros Passos</option>
            <option value="billing">Financeiro & Assinatura</option>
            <option value="features">Funcionalidades</option>
            <option value="api">Integração & API</option>
          </select>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setStatus('published')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                status === 'published'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Publicados
            </button>
            <button
              type="button"
              onClick={() => setStatus('draft')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                status === 'draft'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Rascunhos
            </button>
          </div>
        </div>
      </div>

      {/* Articles Grid */}
      {isLoading ? (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-12 text-center shadow-2xs">
          <CossSpinner className="w-6 h-6 mb-2" />
          <p className="text-xs text-zinc-500">Carregando artigos...</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/80 bg-white shadow-2xs">
          <CossEmpty
            icon={<BookOpen className="w-6 h-6 text-zinc-400" />}
            title="Nenhum artigo encontrado"
            description="Não encontramos nenhum artigo cadastrado para os filtros selecionados."
            action={
              <Button
                onClick={() => navigate('/knowledge/new')}
                className="rounded-xl bg-zinc-900 text-white text-xs"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Escrever Artigo
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((article) => (
            <div
              key={article.id}
              onClick={() => navigate(`/knowledge/${article.id}/edit`)}
              className="flex flex-col justify-between rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs transition-all hover:shadow-md hover:border-zinc-300 cursor-pointer group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200/60">
                    {article.category}
                  </span>
                  <CossBadge variant={article.isPublished ? 'success' : 'neutral'}>
                    {article.isPublished ? 'Publicado' : 'Rascunho'}
                  </CossBadge>
                </div>

                <h3 className="text-base font-bold text-zinc-900 group-hover:text-zinc-700 transition-colors line-clamp-2 mb-4 leading-snug">
                  {article.title}
                </h3>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-600">
                <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                  <User className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  <span className="truncate">{article.authorName || 'Suporte'}</span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-600">
                  <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                  <span>{new Date(article.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
