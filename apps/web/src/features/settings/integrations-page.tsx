import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { CossBadge } from '@/components/coss-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CreditCard, Mail, ExternalLink, Loader2, Check, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Integration {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'PENDING' | 'DISABLED';
  isTest?: boolean;
}

const INTEGRATION_INFO: Record<string, { name: string; description: string; icon: any; envKey: string; setupGuide: string }> = {
  stripe: {
    name: 'Stripe',
    description: 'Gateway de pagamentos, webhooks e assinaturas para cobranças recorrentes.',
    icon: CreditCard,
    envKey: 'STRIPE_SECRET_KEY',
    setupGuide: 'Configure as chaves do Stripe no painel administrativo do provedor. Você precisará de: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET e STRIPE_PUBLISHABLE_KEY.',
  },
  resend: {
    name: 'E-mail Transacional (Resend)',
    description: 'Envio de e-mails transacionais de onboarding, faturas e recuperação da plataforma.',
    icon: Mail,
    envKey: 'RESEND_API_KEY',
    setupGuide: 'Acesse resend.com, crie uma conta, gere uma API Key e adicione o domínio de envio. Configure RESEND_API_KEY e RESEND_FROM_EMAIL no .env.',
  },
};

export function IntegrationsPage() {
  const { data, isLoading } = useQuery<Integration[]>({
    queryKey: ['integrations'],
    queryFn: () => apiGet<Integration[]>('/settings/integrations'),
  });

  const [configModal, setConfigModal] = useState<Integration | null>(null);

  const integrations: Integration[] = (data && Array.isArray(data) ? data : []).map((i: any) => ({
    id: i.id || i.name?.toLowerCase(),
    name: i.name || i.id,
    description: INTEGRATION_INFO[i.name?.toLowerCase()]?.description || i.description || '',
    status: i.status || 'PENDING',
    isTest: i.isTest,
  }));

  // Add known integrations that might not be in the backend yet
  for (const key of Object.keys(INTEGRATION_INFO)) {
    if (!integrations.find((i) => i.name.toLowerCase().includes(key))) {
      integrations.push({
        id: key,
        name: INTEGRATION_INFO[key].name,
        description: INTEGRATION_INFO[key].description,
        status: 'PENDING',
      });
    }
  }

  const isConnected = (status: string) => status === 'ACTIVE' || status === 'CONNECTED';

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Conectores externos consumidos pelo painel administrativo e pelos tenants.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {integrations.map((integration) => {
          const Icon = INTEGRATION_INFO[integration.id]?.icon || CreditCard;
          const connected = isConnected(integration.status);
          return (
            <div
              key={integration.id}
              className="group flex flex-col justify-between rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs transition-all hover:border-zinc-300 hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-50 border border-zinc-200/80 text-zinc-700 shadow-2xs group-hover:scale-105 transition-transform">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">{integration.name}</h3>
                      <p className="text-[11px] text-zinc-500 line-clamp-1">{integration.id}</p>
                    </div>
                  </div>
                  {integration.isTest ? (
                    <CossBadge variant="warning">Test Mode</CossBadge>
                  ) : connected ? (
                    <CossBadge variant="success">Conectado</CossBadge>
                  ) : (
                    <CossBadge variant="neutral">Pendente</CossBadge>
                  )}
                </div>
                <p className="mt-4 text-xs text-zinc-600 leading-relaxed min-h-[36px]">
                  {integration.description}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300',
                    )}
                  />
                  <span className="text-[11px] font-medium text-zinc-600">
                    {connected ? 'Operacional' : 'Aguardando configuração'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-zinc-500 hover:text-zinc-900 rounded-xl"
                    asChild
                  >
                    <a
                      href={integration.id === 'resend' ? 'https://resend.com' : 'https://dashboard.stripe.com/'}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Provedor
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-xl border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs"
                    onClick={() => setConfigModal(integration)}
                  >
                    {connected ? 'Gerenciar' : 'Configurar'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="col-span-2 rounded-3xl border border-zinc-200/80 bg-white p-12 text-center text-xs text-zinc-500 shadow-2xs">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
            Carregando integrações...
          </div>
        )}
      </div>

      {/* Configuration Dialog */}
      <Dialog open={Boolean(configModal)} onOpenChange={(o) => !o && setConfigModal(null)}>
        <DialogContent className="max-w-lg bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl text-zinc-900">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-800">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-bold text-zinc-900">
                Configurar {configModal?.name}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-500 mt-2">
              {INTEGRATION_INFO[configModal?.id || '']?.setupGuide ||
                'Configure a integração utilizando as variáveis de ambiente no servidor.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="rounded-2xl bg-zinc-50 border border-zinc-200/80 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Variável de ambiente</span>
                <code className="font-mono font-semibold text-zinc-900 bg-zinc-200/70 px-2 py-0.5 rounded-lg text-[11px]">
                  {INTEGRATION_INFO[configModal?.id || '']?.envKey || '—'}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Status no sistema</span>
                <span className="font-mono text-zinc-700 text-[11px] font-medium">
                  {configModal?.status || 'PENDING'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-700">API Key (visualização segura)</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••••••"
                defaultValue={isConnected(configModal?.status || '') ? 'sk_live_••••••••••••••••••••' : ''}
                className="h-10 text-xs font-mono bg-zinc-50 border-zinc-200 rounded-xl"
                disabled
              />
              <p className="text-[11px] text-zinc-400">
                Por segurança, chaves secretas de produção são injetadas exclusivamente via arquivo <code className="text-zinc-600 font-mono">.env</code> do backend.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfigModal(null)}
              className="rounded-xl border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-50 shadow-2xs"
            >
              Fechar
            </Button>
            <Button
              className="rounded-xl bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-800 shadow-2xs"
              onClick={() => {
                // A validação real de credenciais ainda não é feita pelo backend.
                // Não afirmamos sucesso para não induzir o admin a erro.
                toast.info(
                  'Validação de conexão ainda não disponível: as credenciais são verificadas no primeiro uso da integração.',
                );
                setConfigModal(null);
              }}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Validar Conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
