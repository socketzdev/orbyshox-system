import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CossBadge } from '@/components/coss-ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Mail, FileCode2, Save, Loader2, Sparkles, Check, Send } from 'lucide-react';

export function EmailTemplatesPage() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const { data: rawTemplates, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => apiGet('/settings/email-templates'),
  });

  const templates = Array.isArray(rawTemplates)
    ? rawTemplates
    : (rawTemplates as any)?.data || [];

  useEffect(() => {
    if (templates && templates.length > 0 && !selectedTemplate) {
      setSelectedTemplate(templates[0]);
    }
  }, [templates, selectedTemplate]);

  const mutation = useMutation({
    mutationFn: (data: any) => apiPatch(`/settings/email-templates/${data.id}`, data),
    onSuccess: () => {
      toast.success('Template de e-mail atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: () => toast.error('Falha ao salvar o template.'),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-xs text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mb-2" />
        Carregando templates...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Personalize as mensagens e notificações transacionais disparadas pelo sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Template Selector */}
        <div className="lg:col-span-4 rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-2xs space-y-2">
          <div className="px-3 py-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Modelos Disponíveis ({templates.length})
            </h2>
          </div>

          <div className="space-y-1.5">
            {templates.map((t: any) => {
              const isSelected = selectedTemplate?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  type="button"
                  className={cn(
                    'w-full text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3',
                    isSelected
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
                      : 'border-transparent bg-zinc-50/70 hover:bg-zinc-100/80 text-zinc-900',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                      isSelected ? 'bg-zinc-800 text-zinc-200' : 'bg-white text-zinc-600 shadow-2xs border border-zinc-200/60',
                    )}
                  >
                    <FileCode2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs font-semibold truncate', isSelected ? 'text-white' : 'text-zinc-900')}>
                      {t.name}
                    </p>
                    <p className={cn('text-[11px] font-mono truncate mt-0.5', isSelected ? 'text-zinc-300' : 'text-zinc-400')}>
                      {t.slug}
                    </p>
                  </div>
                </button>
              );
            })}
            {templates.length === 0 && (
              <p className="p-4 text-center text-xs text-zinc-400">Nenhum template cadastrado.</p>
            )}
          </div>
        </div>

        {/* Right column: Editor & Preview */}
        <div className="lg:col-span-8 space-y-6">
          {selectedTemplate ? (
            <>
              {/* Editor Card */}
              <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-900">{selectedTemplate.name}</h2>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{selectedTemplate.slug}</p>
                  </div>
                  <Button
                    onClick={() => mutation.mutate(selectedTemplate)}
                    disabled={mutation.isPending}
                    className="h-9 rounded-xl bg-zinc-900 text-xs font-semibold text-white hover:bg-zinc-800 shadow-2xs"
                  >
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        Salvar Template
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-700">Nome do Template</Label>
                    <Input
                      value={selectedTemplate.name || ''}
                      onChange={(e) => setSelectedTemplate({ ...selectedTemplate, name: e.target.value })}
                      className="h-10 text-xs rounded-xl border-zinc-200 bg-zinc-50/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-700">Assunto do E-mail</Label>
                    <Input
                      value={selectedTemplate.subject || ''}
                      onChange={(e) => setSelectedTemplate({ ...selectedTemplate, subject: e.target.value })}
                      className="h-10 text-xs rounded-xl border-zinc-200 bg-zinc-50/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-zinc-700">Corpo do E-mail (HTML)</Label>
                    <span className="text-[10px] text-zinc-400 font-mono">Suporta tags Mustache e HTML</span>
                  </div>
                  <Textarea
                    className="min-h-[260px] font-mono text-xs rounded-2xl border-zinc-200 bg-zinc-950 text-zinc-100 p-4 focus-visible:ring-zinc-800"
                    value={selectedTemplate.bodyHtml || ''}
                    onChange={(e) => setSelectedTemplate({ ...selectedTemplate, bodyHtml: e.target.value })}
                  />
                </div>
              </div>

              {/* Preview Card */}
              <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-zinc-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                      Pré-visualização do Cliente
                    </h3>
                  </div>
                  <CossBadge variant="neutral">Sandbox</CossBadge>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs border-b border-zinc-200/60 pb-3">
                    <span className="text-zinc-400 font-medium">Assunto:</span>
                    <span className="font-semibold text-zinc-900">{selectedTemplate.subject || '—'}</span>
                  </div>
                  <div
                    className="rounded-xl border border-zinc-200 bg-white p-6 text-xs text-zinc-800 shadow-2xs min-h-[220px] overflow-auto prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedTemplate.bodyHtml || '<p class="text-zinc-400">Corpo vazio</p>' }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-12 text-center text-xs text-zinc-400 shadow-2xs">
              Selecione um template na barra lateral para começar a editar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
