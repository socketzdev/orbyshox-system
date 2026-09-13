import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { ClientSiteData } from '@projeto-saas/shared-types';
import { apiGet } from '@/lib/api';
import { SitePreview } from './site-preview';

export const PublicSitePage: React.FC = () => {
  const { slug = '' } = useParams();
  const { data, isLoading, isError } = useQuery<ClientSiteData>({
    queryKey: ['public-client-site', slug],
    queryFn: () => apiGet<ClientSiteData>(`/client-sites/public/${slug}`),
    enabled: Boolean(slug),
    retry: false,
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] text-sm text-zinc-500">Carregando experiência...</div>;
  if (isError || !data) return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6 text-center"><div><p className="text-5xl font-semibold tracking-tight text-zinc-900">404</p><p className="mt-3 text-sm text-zinc-500">Este painel ainda não está publicado ou não existe.</p><a href="/login" className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Voltar para a plataforma</a></div></div>;

  return <div className="min-h-screen" style={{ backgroundColor: data.site.theme.background }}><div className="mx-auto max-w-7xl"><div className="flex items-center justify-between px-5 py-3 text-[10px] text-zinc-500 sm:px-8"><span>Experiência digital de {data.tenant.tradeName || data.tenant.companyName}</span><a href="/login" className="inline-flex items-center gap-1.5 hover:text-zinc-900"><ExternalLink className="h-3 w-3" /> Plataforma</a></div><SitePreview data={data} /></div></div>;
};
