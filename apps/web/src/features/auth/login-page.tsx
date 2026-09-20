import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import {
  saveTenantToken,
  saveAdminToken,
  saveAdminSession,
  clearAdminSession,
  clearAdminToken,
  clearTenantToken,
} from '@/lib/auth';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolvePortalDestination } from '@/lib/role-routing';

// Esquemas de validação
const formSchema = z.object({
  phone: z.string().min(3, 'Informe seu WhatsApp / telefone ou e-mail'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  rememberMe: z.boolean().optional(),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Informe seu nome completo'),
  phone: z.string().min(8, 'Informe seu WhatsApp / telefone'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string().min(8, 'Confirme sua senha'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

const forgotSchema = z.object({
  phone: z.string().min(3, 'Informe seu telefone ou WhatsApp cadastrado'),
});

type FormValues = z.infer<typeof formSchema>;
type RegisterValues = z.infer<typeof registerSchema>;
type ForgotValues = z.infer<typeof forgotSchema>;
type ScreenMode = 'login' | 'mfa' | 'forgot' | 'forgot-success' | 'register';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

const RIGHT_PANEL_MESSAGES = [
  {
    title: 'Bem-vindo ao seu novo painel',
    description: 'Acesse para explorar todas as novidades e métricas da sua empresa em tempo real.',
    badge: 'Plataforma SaaS',
  },
  {
    title: 'Controle Total da Operação',
    description: 'Monitore pedidos, comandas e mesas instantaneamente com sincronização em tempo real.',
    badge: 'Tempo Real',
  },
  {
    title: 'Cardápio Digital & QR Code',
    description: 'Experiência fluida para tablets e celulares, acelerando o atendimento e as vendas.',
    badge: 'Autoatendimento',
  },
  {
    title: 'Gestão Inteligente & Métricas',
    description: 'Relatórios claros de faturamento, controle de estoque e desempenho do seu negócio.',
    badge: 'Business Intelligence',
  },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const initialIdentifier = searchParams.get('identifier') || searchParams.get('phone') || '';
  const isNewlyCreated = searchParams.get('created') === 'true';
  const createdCompanyName = searchParams.get('company') || '';

  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<ScreenMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Desativa rolagem na tela de login
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Animação cíclica das mensagens no painel da direita
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % RIGHT_PANEL_MESSAGES.length);
        setIsFading(false);
      }, 350);
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  // 2FA / OTP State
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Lockout State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isLocked = lockedUntil !== null && lockedUntil > now;
  const lockRemaining = isLocked && lockedUntil ? Math.ceil((lockedUntil - now) / 1000) : 0;

  // Forms
  const loginForm = useForm<FormValues>({
    resolver: zodResolver(formSchema as any),
    defaultValues: { phone: initialIdentifier || '', password: '', rememberMe: false },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema as any),
    defaultValues: { name: '', phone: '', password: '', confirmPassword: '' },
  });

  const forgotForm = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema as any),
    defaultValues: { phone: '' },
  });

  // Limpa sessão antiga se for redirecionamento de empresa recém-criada
  useEffect(() => {
    if (isNewlyCreated) {
      clearAdminSession();
      clearAdminToken();
      clearTenantToken();
    }
    if (initialIdentifier) {
      loginForm.setValue('phone', initialIdentifier);
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 350);
    }
  }, [isNewlyCreated, initialIdentifier, loginForm]);

  useEffect(() => {
    if (isLocked) {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }
    if (lockedUntil && lockedUntil <= Date.now()) {
      setLockedUntil(null);
      setFailedAttempts(0);
    }
  }, [isLocked, lockedUntil]);

  // Login Submit
  const onLoginSubmit = async (data: FormValues) => {
    if (isLocked) {
      setError(`Muitas tentativas. Aguarde ${lockRemaining}s antes de tentar novamente.`);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);

      const trimmedIdentifier = data.phone.trim();
      const trimmedPassword = data.password.trim();

      const response: any = await apiPost('/auth/login', {
        email: trimmedIdentifier, // Backend validateUser aceita telefone/WhatsApp ou e-mail
        password: trimmedPassword,
        // Sem marcar: sessão curta; marcado: refresh de 30 dias.
        rememberMe: data.rememberMe !== false,
      });

      if (response?.mfaRequired) {
        setTempToken(response.tempToken);
        setMode('mfa');
        setIsLoading(false);
        setFailedAttempts(0);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
        return;
      }

      const accessToken = response?.accessToken;
      const userData = response?.user;

      if (!accessToken || !userData) {
        throw new Error('Resposta inválida do servidor');
      }

      login(accessToken, userData);
      saveAdminToken(accessToken);
      saveAdminSession({ user: userData });
      saveTenantToken(userData.tenant?.slug || '', accessToken);
      setFailedAttempts(0);

      const isSuperAdmin = userData.role === 'SUPER_ADMIN';
      const destination = resolvePortalDestination(userData, redirectTo);

      toast.success(isSuperAdmin ? 'Login de Super Admin autorizado com sucesso!' : `Bem-vindo, ${userData.name || 'usuário'}!`);
      window.location.href = destination;
    } catch (err: any) {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setError('Várias tentativas incorretas. Bloqueado por 30 segundos.');
      } else {
        setError(err.response?.data?.message || 'Telefone ou senha incorretos. Verifique seus dados.');
      }
      toast.error(err.response?.data?.message || 'Erro na autenticação');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Handle Change
  const handleOtpChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '');
    if (!sanitized) {
      const updated = [...otpValues];
      updated[index] = '';
      setOtpValues(updated);
      return;
    }

    if (sanitized.length > 1) {
      const chars = sanitized.slice(0, 6).split('');
      const updated = [...otpValues];
      chars.forEach((c, i) => {
        if (i < 6) updated[i] = c;
      });
      setOtpValues(updated);
      const nextIdx = Math.min(chars.length, 5);
      otpRefs.current[nextIdx]?.focus();
      return;
    }

    const updated = [...otpValues];
    updated[index] = sanitized;
    setOtpValues(updated);

    if (index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // MFA Submit
  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpValues.join('');
    if (code.length !== 6) {
      setError('Informe o código de 6 dígitos.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response: any = await apiPost('/auth/2fa/verify', { code, tempToken });
      const accessToken = response?.accessToken;
      const userData = response?.user;

      if (!accessToken || !userData) {
        throw new Error('Resposta inválida do servidor');
      }

      login(accessToken, userData);
      saveAdminToken(accessToken);
      saveAdminSession({ user: userData });
      saveTenantToken(userData.tenant?.slug || '', accessToken);
      setFailedAttempts(0);

      const isSuperAdmin = userData.role === 'SUPER_ADMIN';
      const destination = resolvePortalDestination(userData, redirectTo);

      toast.success(isSuperAdmin ? 'Duplo fator confirmado! Acesso de Super Admin liberado.' : `Bem-vindo, ${userData.name || 'usuário'}!`);
      window.location.href = destination;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Código TOTP incorreto ou expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password Submit
  const onForgotSubmit = async (data: ForgotValues) => {
    try {
      setIsLoading(true);
      setError(null);
      await new Promise((resolve) => setTimeout(resolve, 800));
      setMode('forgot-success');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Não foi possível enviar as instruções.');
    } finally {
      setIsLoading(false);
    }
  };

  // Register Submit
  const onRegisterSubmit = async (data: RegisterValues) => {
    try {
      setIsLoading(true);
      setError(null);
      toast.info('Para cadastrar uma nova empresa na plataforma, fale com nosso suporte.');
      setMode('login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#0E54F8] flex flex-col justify-center items-center p-3 sm:p-4 lg:p-6 font-sans antialiased selection:bg-blue-200 selection:text-blue-900 overflow-hidden">
      {/* ─── Cartão Principal com layout dividido exatamente como na imagem ─── */}
      <div className="w-full max-w-[1100px] h-full max-h-[640px] sm:max-h-[660px] lg:max-h-[680px] bg-white rounded-[28px] md:rounded-[36px] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-blue-400/20">

        {/* ─── LADO ESQUERDO: Formulário Branco ─── */}
        <div className="lg:col-span-6 p-6 sm:p-10 md:p-12 flex flex-col justify-between bg-white overflow-y-auto no-scrollbar">
          <div>
            {/* LOGO ORBYSHOX */}
            <div className="mb-6 flex items-center gap-3">
              <img
                src="/orbyshox-logo.png"
                alt="Orbyshox"
                className="h-11 w-11 rounded-2xl object-contain bg-white shadow-sm border border-slate-100"
              />
              <div>
                <span className="font-bold text-base text-slate-900 tracking-tight block leading-tight">
                  Orbyshox
                </span>
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase block">
                  Gestão Empresarial
                </span>
              </div>
            </div>
            {/* BOTÃO VOLTAR QUANDO ESTIVER EM OUTROS MODOS */}
            {mode !== 'login' && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('login');
                }}
                className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar para o login
              </button>
            )}

            {/* TELA DE LOGIN */}
            {mode === 'login' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-3xl sm:text-[34px] font-bold text-slate-900 tracking-tight leading-tight">
                    Entrar
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    Bem-vindo de volta! Por favor, insira seus dados.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 rounded-xl bg-rose-50 border border-rose-200/90 p-3.5 text-xs font-medium text-rose-700">
                    {error}
                  </div>
                )}

                {isNewlyCreated && (
                  <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200/90 text-xs text-emerald-800 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-950">
                        {createdCompanyName ? `Empresa "${createdCompanyName}" criada!` : 'Empresa criada com sucesso!'}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                        Faça login com a senha cadastrada para acessar o painel de gerenciamento.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5 mt-6 sm:mt-8">
                  {/* Campo 1: Telefone ou E-mail */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      WhatsApp / Telefone ou E-mail
                    </label>
                    <input
                      type="text"
                      autoComplete="username"
                      placeholder="(11) 99999-9999 ou seu@email.com"
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0E54F8] focus:ring-4 focus:ring-blue-600/10 transition shadow-2xs"
                      {...loginForm.register('phone')}
                    />
                    {loginForm.formState.errors.phone && (
                      <p className="mt-1.5 text-[11px] font-medium text-rose-600">
                        {loginForm.formState.errors.phone.message}
                      </p>
                    )}
                  </div>

                  {/* Campo 2: Senha */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Senha
                    </label>
                    <div className="relative flex items-center">
                      {(() => {
                        const { ref: pwRef, ...pwRest } = loginForm.register('password');
                        return (
                          <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="w-full h-12 px-4 pr-11 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0E54F8] focus:ring-4 focus:ring-blue-600/10 transition shadow-2xs"
                            {...pwRest}
                            ref={(el) => {
                              pwRef(el);
                              passwordInputRef.current = el;
                            }}
                          />
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 text-slate-400 hover:text-slate-600 transition p-1"
                        aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {loginForm.formState.errors.password && (
                      <p className="mt-1.5 text-[11px] font-medium text-rose-600">
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* Linha "Lembrar por 30 dias" & "Esqueceu a senha?" */}
                  <div className="flex items-center justify-between pt-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-[#0E54F8] focus:ring-[#0E54F8] cursor-pointer"
                        {...loginForm.register('rememberMe')}
                      />
                      <span className="text-xs text-slate-600 font-medium">Lembrar por 30 dias</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode('forgot');
                      }}
                      className="text-xs font-semibold text-[#0E54F8] hover:underline transition"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>

                  {/* Botão Entrar */}
                  <button
                    type="submit"
                    disabled={isLoading || isLocked}
                    className="w-full h-12 rounded-xl bg-[#0E54F8] hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 mt-7 disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isLocked ? (
                      `Bloqueado (${lockRemaining}s)`
                    ) : (
                      'Entrar'
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* TELA DE VERIFICAÇÃO OTP / MFA */}
            {mode === 'mfa' && (
              <div>
                <div className="mb-7">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                    Verificação OTP
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    Insira o código de 6 dígitos gerado pelo seu aplicativo autenticador.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 rounded-xl bg-rose-50 border border-rose-200/90 p-3.5 text-xs font-medium text-rose-700">
                    {error}
                  </div>
                )}

                <form onSubmit={onMfaSubmit} className="space-y-6">
                  <div className="flex items-center justify-between gap-2">
                    {otpValues.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpRefs.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-11 h-12 rounded-xl border border-slate-300 bg-white text-center font-bold text-lg text-slate-900 focus:border-[#0E54F8] focus:ring-4 focus:ring-blue-600/10 focus:outline-none transition shadow-2xs"
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-xl bg-[#0E54F8] hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verificar'}
                  </button>
                </form>
              </div>
            )}

            {/* TELA DE ESQUECEU A SENHA */}
            {mode === 'forgot' && (
              <div>
                <div className="mb-7">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                    Esqueceu a Senha?
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    Informe seu telefone cadastrado para receber as instruções de recuperação.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 rounded-xl bg-rose-50 border border-rose-200/90 p-3.5 text-xs font-medium text-rose-700">
                    {error}
                  </div>
                )}

                <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Telefone
                    </label>
                    <input
                      type="text"
                      placeholder="Digite seu telefone cadastrado"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0E54F8] focus:ring-4 focus:ring-blue-600/10 transition"
                      {...forgotForm.register('phone')}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-xl bg-[#0E54F8] hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 mt-4"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar Código'}
                  </button>
                </form>
              </div>
            )}

            {/* TELA DE INSTRUÇÕES ENVIADAS */}
            {mode === 'forgot-success' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-5">
                  <Sparkles className="w-8 h-8 text-[#0E54F8]" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Instruções Enviadas!
                </h1>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Se o telefone informado estiver cadastrado, você receberá a mensagem de recuperação em instantes.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full h-11 rounded-xl bg-[#0E54F8] hover:bg-blue-700 text-white font-semibold text-sm transition mt-6"
                >
                  Voltar ao Login
                </button>
              </div>
            )}

            {/* TELA DE CADASTRO */}
            {mode === 'register' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                    Criar Conta
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    Cadastre sua empresa e comece a operar hoje mesmo.
                  </p>
                </div>

                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nome Completo</label>
                    <input
                      type="text"
                      placeholder="Seu nome"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm"
                      {...registerForm.register('name')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="(11) 99999-9999"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm"
                      {...registerForm.register('phone')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm"
                      {...registerForm.register('password')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirmar Senha</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm"
                      {...registerForm.register('confirmPassword')}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-xl bg-[#0E54F8] hover:bg-blue-700 text-white font-semibold text-sm transition mt-3"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cadastrar'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* RODAPÉ DO FORMULÁRIO */}
          <div className="mt-8 pt-4 text-center">
            {mode === 'login' && (
              <p className="text-xs text-slate-500">
                Não tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('register');
                  }}
                  className="font-bold text-[#0E54F8] hover:underline"
                >
                  Cadastre-se
                </button>
              </p>
            )}

            {mode === 'register' && (
              <p className="text-xs text-slate-500">
                Já tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className="font-bold text-[#0E54F8] hover:underline"
                >
                  Entrar
                </button>
              </p>
            )}
          </div>
        </div>

        {/* ─── LADO DIREITO: Painel Azul com Ilustração SVG e Mensagens Animadas ─── */}
        <div className="hidden lg:flex lg:col-span-6 bg-gradient-to-br from-[#0E54F8] via-[#0D4FEA] to-[#0A3EC4] p-8 xl:p-10 flex-col justify-between items-center text-white relative overflow-hidden">
          {/* Efeito sutil de brilho/gradiente decorativo */}
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />

          {/* Espaçador superior com Badge animado */}
          <div className="w-full flex justify-end relative z-10">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-100 bg-white/15 px-3 py-1 rounded-full backdrop-blur-xs transition-all duration-300">
              {RIGHT_PANEL_MESSAGES[currentMessageIndex].badge}
            </span>
          </div>

          {/* Área Central com a Ilustração SVG undraw_analytics */}
          <div className="w-full max-w-md my-auto flex flex-col items-center justify-center relative z-10 px-2 sm:px-4">
            <div className="w-full p-4 sm:p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center">
              <img
                src="/undraw_analytics_6mru.svg"
                alt="Business Analytics Ilustração"
                className="w-full h-auto max-h-[250px] xl:max-h-[280px] object-contain drop-shadow-md"
              />
            </div>
          </div>

          {/* Textos Inferiores com Animação Fluida & Indicadores */}
          <div className="text-center relative z-10 max-w-sm w-full">
            <div
              className={`min-h-[84px] flex flex-col justify-center transition-all duration-350 ease-out transform ${
                isFading ? 'opacity-0 translate-y-2.5 scale-[0.98]' : 'opacity-100 translate-y-0 scale-100'
              }`}
            >
              <h2 className="text-xl xl:text-2xl font-bold text-white tracking-tight leading-snug">
                {RIGHT_PANEL_MESSAGES[currentMessageIndex].title}
              </h2>
              <p className="mt-2 text-xs xl:text-sm text-blue-100/85 leading-relaxed font-normal">
                {RIGHT_PANEL_MESSAGES[currentMessageIndex].description}
              </p>
            </div>

            {/* Indicadores / Dots interativos */}
            <div className="flex items-center gap-1.5 mt-3.5 justify-center">
              {RIGHT_PANEL_MESSAGES.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setIsFading(true);
                    setTimeout(() => {
                      setCurrentMessageIndex(idx);
                      setIsFading(false);
                    }, 200);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentMessageIndex
                      ? 'w-6 bg-white shadow-xs'
                      : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
