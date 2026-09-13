import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ChevronRight, ExternalLink, Layers, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  CLIENT_SITE_NICHES,
  DEFAULT_SITE_CONTENT_BY_NICHE,
  SITE_TEMPLATE_CATALOG,
  type ClientSiteData,
  type ClientSiteNiche,
  type SiteContent,
  type SiteTheme,
} from '@projeto-saas/shared-types';
import { apiGet, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SitePreview } from './site-preview';

const DEFAULT_SITE_THEME: SiteTheme = {
  primary: '#e87932',
  accent: '#facc15',
  background: '#fffaf4',
  surface: '#ffffff',
  text: '#172033',
  muted: '#667085',
  radius: 'soft',
  font: 'sans',
};

const NICHE_OPTIONS: Array<{ value: ClientSiteNiche; label: string; description: string; mark: string }> = [
  { value: 'RESTAURANT', label: 'Restaurante', description: 'Cardápio, reservas e experiência gastronômica.', mark: 'R' },
  { value: 'BARBERSHOP', label: 'Barbearia', description: 'Serviços, profissionais e agenda.', mark: 'B' },
  { value: 'SUPERMARKET', label: 'Mercado', description: 'Ofertas, categorias e conveniência.', mark: 'M' },
];

const STEPS = [
  { label: 'Nicho', icon: Building2 },
  { label: 'Template', icon: Layers },
  { label: 'Personalizar', icon: Sparkles },
];

function makeFallbackData(id: string): ClientSiteData {
  const niche = 'RESTAURANT';
  return {
    tenant: { id, companyName: 'Novo cliente', tradeName: null, niche, status: 'TRIAL' },
    site: {
      slug: '',
      templateKey: 'bistro',
      theme: DEFAULT_SITE_THEME,
      content: DEFAULT_SITE_CONTENT_BY_NICHE[niche],
      isPublished: true,
    },
  };
}

export const TenantSiteBuilderPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ClientSiteData>(() => makeFallbackData(id));

  const { data, isLoading, isError } = useQuery<ClientSiteData>({
    queryKey: ['client-site', id],
    queryFn: () => apiGet<ClientSiteData>(`/client-sites/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (data) {
      setDraft({
        ...data,
        site: {
          ...data.site,
          slug: data.site.slug || '',
        },
      });
    }
  }, [data]);

  const templates = useMemo(
    () => SITE_TEMPLATE_CATALOG.filter((template) => (template.niches as readonly string[]).includes(draft.tenant.niche)),
    [draft.tenant.niche],
  );

  const saveMutation = useMutation({
    mutationFn: () => apiPatch<ClientSiteData>(`/client-sites/${id}`, {
      niche: draft.tenant.niche,
      slug: draft.site.slug,
      templateKey: draft.site.templateKey,
      theme: draft.site.theme,
      content: draft.site.content,
      isPublished: draft.site.isPublished,
    }),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.setQueryData(['client-site', id], saved);
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      toast.success('Site do cliente publicado com sucesso');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Não foi possível salvar o site'),
  });

  const updateTheme = (key: keyof SiteTheme, value: string) => {
    setDraft((current) => ({ ...current, site: { ...current.site, theme: { ...current.site.theme, [key]: value } } }));
  };

  const updateContent = (key: keyof SiteContent, value: string) => {
    setDraft((current) => ({ ...current, site: { ...current.site, content: { ...current.site.content, [key]: value } } }));
  };

  const selectNiche = (niche: ClientSiteNiche) => {
    const defaultTemplate = niche === 'RESTAURANT' ? 'bistro' : niche === 'BARBERSHOP' ? 'studio' : 'market';
    setDraft((current) => ({
      ...current,
      tenant: { ...current.tenant, niche },
      site: {
        ...current.site,
        templateKey: (current.site.templateKey && (SITE_TEMPLATE_CATALOG.find((template) => template.key === current.site.templateKey)?.niches as readonly string[] | undefined)?.includes(niche)) ? current.site.templateKey : defaultTemplate,
        content: { ...DEFAULT_SITE_CONTENT_BY_NICHE[niche], ...current.site.content },
      },
    }));
  };

  if (isLoading) return <div className="py-16 text-sm text-zinc-400">Carregando configurador...</div>;
  if (isError && !draft) return <div className="py-16 text-sm text-rose-400">Não foi possível carregar este cliente.</div>;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button type="button" onClick={() => navigate(`/tenants/${id}`)} className="mb-3 text-xs text-zinc-500 transition hover:text-zinc-200">← Voltar para o cliente</button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200"><Sparkles className="h-4 w-4" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Criar painel do cliente</h1>
              <p className="mt-1 text-xs text-zinc-400">Configure a presença digital de <span className="text-zinc-200">{draft.tenant.tradeName || draft.tenant.companyName}</span>.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.site.slug && (
            <Button variant="outline" size="sm" onClick={() => window.open(`/${draft.site.slug}`, '_blank')}><ExternalLink className="h-3.5 w-3.5" /> Abrir painel</Button>
          )}
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !draft.site.slug.trim()}><Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? 'Publicando...' : 'Publicar alterações'}</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              return <button key={item.label} type="button" onClick={() => setStep(index)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${step === index ? 'bg-zinc-100 font-semibold text-zinc-900' : index < step ? 'text-emerald-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}><Icon className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline">0{index + 1}. </span>{item.label}{index < step && <CheckCircle2 className="ml-auto h-3.5 w-3.5" />}</button>;
            })}
          </div>

          {step === 0 && (
            <Card>
              <CardHeader><CardTitle>Qual é o tipo de negócio?</CardTitle><CardDescription>Isso pré-configura o conteúdo, os templates e os textos do painel.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {NICHE_OPTIONS.map((option) => {
                  const selected = draft.tenant.niche === option.value;
                  return <button key={option.value} type="button" onClick={() => selectNiche(option.value)} className={`group rounded-xl border p-4 text-left transition ${selected ? 'border-zinc-200 bg-zinc-100 text-zinc-900 shadow-lg' : 'border-zinc-800 bg-zinc-900/50 text-zinc-200 hover:border-zinc-600'}`}><span className={`mb-8 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ${selected ? 'bg-zinc-900 text-white' : 'bg-zinc-800 text-zinc-300'}`}>{option.mark}</span><span className="block text-sm font-semibold">{option.label}</span><span className={`mt-2 block text-xs leading-5 ${selected ? 'text-zinc-600' : 'text-zinc-500'}`}>{option.description}</span></button>;
                })}
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <Card>
              <CardHeader><CardTitle>Escolha o template inicial</CardTitle><CardDescription>O administrador poderá trocar o template e personalizar o conteúdo depois.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {templates.map((template) => {
                  const selected = draft.site.templateKey === template.key;
                  return <button key={template.key} type="button" onClick={() => setDraft((current) => ({ ...current, site: { ...current.site, templateKey: template.key } }))} className={`overflow-hidden rounded-xl border text-left transition ${selected ? 'border-zinc-100 ring-2 ring-zinc-100/10' : 'border-zinc-800 hover:border-zinc-600'}`}><div className={`h-24 bg-gradient-to-br ${template.preview === 'dark' ? 'from-zinc-950 via-violet-950 to-zinc-900' : template.preview === 'fresh' ? 'from-emerald-50 via-lime-100 to-white' : template.preview === 'warm' ? 'from-orange-100 via-amber-50 to-white' : 'from-blue-50 via-white to-zinc-100'}`}><div className="p-4"><div className={`h-2 w-20 rounded-full ${template.preview === 'dark' ? 'bg-violet-300' : 'bg-zinc-900/70'}`} /><div className={`mt-3 h-1.5 w-32 rounded-full ${template.preview === 'dark' ? 'bg-white/30' : 'bg-zinc-900/20'}`} /><div className={`mt-2 h-1.5 w-24 rounded-full ${template.preview === 'dark' ? 'bg-white/20' : 'bg-zinc-900/10'}`} /></div></div><div className="bg-zinc-950 p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-zinc-100">{template.name}</span>{selected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}</div><span className="mt-1 block text-xs leading-5 text-zinc-500">{template.description}</span></div></button>;
                })}
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle>Endereço do painel</CardTitle><CardDescription>O endereço ficará disponível em <span className="font-mono text-zinc-300">/suaempresa</span>.</CardDescription></CardHeader>
                <CardContent><div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950/70 focus-within:border-zinc-400"><span className="pl-3 text-xs text-zinc-500">orbyshox.com/</span><Input value={draft.site.slug} onChange={(event) => setDraft((current) => ({ ...current, site: { ...current.site, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') } }))} placeholder="minhaempresa" className="border-0 bg-transparent pl-1 focus-visible:ring-0" /></div><p className="mt-2 text-[11px] text-zinc-500">Use letras minúsculas, números e hífens. Esse endereço identifica o cliente.</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Identidade visual</CardTitle><CardDescription>Troque as cores e o estilo sem precisar alterar código.</CardDescription></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs text-zinc-400">Cor principal<div className="mt-2 flex gap-2"><input type="color" value={draft.site.theme.primary} onChange={(event) => updateTheme('primary', event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent p-1" /><Input value={draft.site.theme.primary} onChange={(event) => updateTheme('primary', event.target.value)} /></div></label>
                  <label className="text-xs text-zinc-400">Cor de destaque<div className="mt-2 flex gap-2"><input type="color" value={draft.site.theme.accent} onChange={(event) => updateTheme('accent', event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent p-1" /><Input value={draft.site.theme.accent} onChange={(event) => updateTheme('accent', event.target.value)} /></div></label>
                  <label className="text-xs text-zinc-400">Fundo<div className="mt-2 flex gap-2"><input type="color" value={draft.site.theme.background} onChange={(event) => updateTheme('background', event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent p-1" /><Input value={draft.site.theme.background} onChange={(event) => updateTheme('background', event.target.value)} /></div></label>
                  <label className="text-xs text-zinc-400">Estilo dos cantos<select value={draft.site.theme.radius} onChange={(event) => updateTheme('radius', event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200"><option value="sharp">Precisos</option><option value="soft">Suaves</option><option value="round">Arredondados</option></select></label>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Conteúdo principal</CardTitle><CardDescription>Textos que aparecerão na primeira dobra do painel.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <label className="block text-xs text-zinc-400">Título principal<Input value={draft.site.content.heroTitle} onChange={(event) => updateContent('heroTitle', event.target.value)} className="mt-2" /></label>
                  <label className="block text-xs text-zinc-400">Descrição<textarea value={draft.site.content.heroSubtitle} onChange={(event) => updateContent('heroSubtitle', event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-400" /></label>
                  <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs text-zinc-400">Botão de ação<Input value={draft.site.content.ctaLabel} onChange={(event) => updateContent('ctaLabel', event.target.value)} className="mt-2" /></label><label className="block text-xs text-zinc-400">Telefone<Input value={draft.site.content.phone} onChange={(event) => updateContent('phone', event.target.value)} className="mt-2" /></label></div>
                  <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs text-zinc-400">Endereço<Input value={draft.site.content.address} onChange={(event) => updateContent('address', event.target.value)} className="mt-2" /></label><label className="block text-xs text-zinc-400">Horário<Input value={draft.site.content.openingHours} onChange={(event) => updateContent('openingHours', event.target.value)} className="mt-2" /></label></div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>Anterior</Button><Button size="sm" onClick={() => step < 2 ? setStep((current) => current + 1) : saveMutation.mutate()} disabled={saveMutation.isPending || (step === 2 && !draft.site.slug.trim())}>{step < 2 ? <>Continuar <ArrowRight className="h-3.5 w-3.5" /></> : <>{saveMutation.isPending ? 'Publicando...' : 'Publicar painel'} <CheckCircle2 className="h-3.5 w-3.5" /></>}</Button></div>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Pré-visualização ao vivo</p><p className="mt-1 text-xs text-zinc-400">O cliente verá esta experiência em tempo real.</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online</span></div><SitePreview data={draft} compact /></div>
      </div>
    </div>
  );
};
