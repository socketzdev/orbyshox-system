import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { saveTenantToken, clearViewingSlug } from '@/lib/auth';
import { resolvePortalDestination } from '@/lib/role-routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  identifier: z.string().min(3, 'Insira seu e-mail ou telefone'),
  password: z.string().min(1, 'Insira sua senha'),
});

type LoginValues = z.infer<typeof loginSchema>;

export const TenantLoginPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    data: tenant,
    isLoading: isLoadingInfo,
    isError,
  } = useQuery({
    queryKey: ['tenant-public-info', slug],
    queryFn: () => (slug ? apiGet(`/tenant-app/${slug}/public-info`) : Promise.resolve(null)),
    enabled: Boolean(slug),
    retry: 1,
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema as any),
    defaultValues: { identifier: '', password: '' },
  });

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      apiGet('/tenant-app/auth/me')
        .then((res) => {
          if (!cancelled) {
            navigate(resolvePortalDestination(res?.user, null, '/app'));
          }
        })
        .catch(() => {});
      return;
    }

    apiGet(`/tenant-app/${slug}/me`)
      .then((res) => {
        if (!cancelled) {
          navigate(resolvePortalDestination(res?.user, null, '/app'));
        }
      })
      .catch(() => {
        if (cancelled) return;
        apiPost(`/tenant-app/${slug}/refresh`, {})
          .then((res) => {
            if (res?.accessToken) {
              saveTenantToken(slug, res.accessToken);
            }
            if (!cancelled) {
              navigate(resolvePortalDestination(res?.user, null, '/app'));
            }
          })
          .catch(() => {});
      });
    return () => {
      cancelled = true;
    };
  }, [slug, navigate]);

  const onSubmit = async (values: LoginValues) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const loginEndpoint = slug ? `/tenant-app/${slug}/login` : '/tenant-app/auth/login';
      const response = await apiPost(loginEndpoint, {
        email: values.identifier,
        password: values.password,
      });

      if (response?.user) {
        if (response.accessToken) {
          saveTenantToken(slug || '', response.accessToken);
        }
        // Login real na loja: derruba qualquer "empresa visualizada" de
        // suporte que tenha ficado gravada — senão o catálogo abriria com
        // produtos de outra empresa.
        clearViewingSlug();
        toast.success(`Bem-vindo ao painel, ${response.user.name}!`);
        navigate(resolvePortalDestination(response.user, null, '/app'));
        return;
      }
      throw new Error('Credenciais inválidas.');
    } catch (err: any) {
      const msg =
        err.response?.data?.message || err.message || 'Falha ao autenticar. Verifique seu e-mail/telefone e senha.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const companyName = tenant?.tradeName || tenant?.companyName || (slug ? slug : 'App do Estabelecimento');
  const initials = useMemo(() => {
    return (
      companyName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p: string) => p.charAt(0).toUpperCase())
        .join('') || 'AP'
    );
  }, [companyName]);

  if (slug && isLoadingInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-sans text-white/70 text-sm">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
          <span className="text-xs font-medium">Carregando informações...</span>
        </div>
      </div>
    );
  }

  if (slug && (isError || !tenant)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 font-sans">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-2xl text-white">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-rose-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-white">Empresa não encontrada</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
            O endereço informado não está ativo ou foi desativado.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full rounded-xl text-sm font-semibold border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
            onClick={() => navigate('/app/login')}
          >
            Acessar o Aplicativo Geral
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-red-600 px-4 font-sans">
      <div className="absolute inset-0 bg-gradient-to-br from-red-700 via-red-600 to-red-500" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-lg font-bold text-red-600 shadow-lg">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {companyName}
            </h1>
            <p className="mt-1 text-xs text-white/60">Acesse o painel de gestão</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8">
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-700">E-mail ou Telefone</Label>
              <div className="relative flex items-center">
                <Input
                  type="text"
                  autoComplete="username"
                  placeholder="admin@empresa.com ou (11) 99999-9999"
                  className="h-11 rounded-xl px-3 text-sm"
                  {...register('identifier')}
                />
              </div>
              {errors.identifier && (
                <span className="text-[11px] font-medium text-red-600">
                  {errors.identifier.message}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-700">Senha</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 rounded-xl pl-9 pr-10 text-sm"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-zinc-400 hover:text-zinc-900"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && (
                <span className="text-[11px] font-medium text-red-600">
                  {errors.password.message}
                </span>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="group h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-sm font-semibold text-white shadow-sm hover:from-orange-600 hover:to-red-600 transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Acessando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Painel</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-[10px] text-zinc-400">
            Precisa de acesso? Fale com o administrador da sua empresa.
          </p>
        </div>
      </div>
    </div>
  );
};
