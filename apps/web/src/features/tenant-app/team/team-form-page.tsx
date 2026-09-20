import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Save,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CARGOS, parseTags } from './team-roles';

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  position: string | null;
  tags?: string | string[] | null;
  isActive: boolean;
};

type FormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  cargoId: string;
  phone: string;
  position: string;
  accumulateCleaning: boolean;
  isActive: boolean;
};

const EMPTY: FormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  cargoId: 'waiter',
  phone: '',
  position: 'Garçom',
  accumulateCleaning: false,
  isActive: true,
};

export const TeamFormPage: React.FC = () => {
  const { slug, base, currentUser } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const focusReset = searchParams.get('reset') === '1';

  const isEdit = Boolean(id);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isSelf = isEdit && currentUser?.id === id;

  const { data: employee, isLoading: loadingEmployee } = useQuery<Employee>({
    queryKey: ['tenant-employee', slug, id],
    queryFn: () => apiGet(`/tenant-app/${slug}/employees/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (employee && isEdit) {
      const tags = parseTags((employee as any).tags);
      const role = (employee.role || '').toUpperCase();
      const pos = (employee.position || '').toLowerCase();
      const cargo =
        CARGOS.find((c) => c.role === role && pos.includes(c.position.toLowerCase())) ||
        CARGOS.find((c) => c.role === role) ||
        CARGOS[2];
      setForm({
        name: employee.name,
        email: employee.email,
        password: '',
        confirmPassword: '',
        cargoId: cargo.id,
        phone: employee.phone || '',
        position: employee.position || cargo.position,
        accumulateCleaning: tags.includes('CLEANING') && cargo.id !== 'cleaning',
        isActive: employee.isActive,
      });
    }
  }, [employee, isEdit]);

  useEffect(() => {
    if (focusReset && isEdit) {
      const el = document.getElementById('field-password');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
    }
  }, [focusReset, isEdit]);

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/employees`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-employees', slug] });
      toast.success('Funcionário cadastrado com sucesso!');
      navigate(`${base}/team`);
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message || 'Não foi possível criar o funcionário';
      toast.error(message);
      if (err.response?.data?.cause?.issues) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.response.data.cause.issues) {
          const path = issue.path?.[0];
          if (path) fieldErrors[path] = issue.message;
        }
        setErrors(fieldErrors);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) =>
      apiPatch(`/tenant-app/${slug}/employees/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-employees', slug] });
      queryClient.invalidateQueries({ queryKey: ['tenant-employee', slug, id] });
      toast.success('Funcionário atualizado!');
      navigate(`${base}/team`);
    },
    onError: (err: any) =>
      toast.error(
        err.response?.data?.message || 'Não foi possível atualizar o funcionário',
      ),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) {
      next.name = 'Informe o nome completo';
    }
    if (!form.email.trim()) {
      next.email = 'E-mail é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'E-mail inválido';
    }
    if (!isEdit) {
      if (form.password.length < 8) {
        next.password = 'A senha deve ter no mínimo 8 caracteres';
      } else if (form.password !== form.confirmPassword) {
        next.confirmPassword = 'As senhas não conferem';
      }
    } else if (form.password) {
      if (form.password.length < 8) {
        next.password = 'A senha deve ter no mínimo 8 caracteres';
      } else if (form.password !== form.confirmPassword) {
        next.confirmPassword = 'As senhas não conferem';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const cargo = CARGOS.find((c) => c.id === form.cargoId) || CARGOS[2];
    const payload: any = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: cargo.role,
      phone: form.phone.trim() || null,
      position: form.position.trim() || cargo.position,
      // Limpeza acumulável: garçom/cozinheiro que também faz serviços gerais.
      tags: form.accumulateCleaning && cargo.id !== 'cleaning' ? ['CLEANING'] : [],
      isActive: form.isActive,
    };
    if (form.password) payload.password = form.password;

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate({ ...payload, password: form.password });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const titlePage = useMemo(() => {
    if (loadingEmployee && isEdit) return 'Carregando...';
    if (isEdit) return `Editar ${employee?.name || 'funcionário'}`;
    return 'Novo Funcionário';
  }, [loadingEmployee, isEdit, employee]);

  if (isEdit && loadingEmployee) {
    return (
      <div className="bg-white p-10 rounded-2xl border border-zinc-200/80 text-center text-zinc-500 text-sm">
        Carregando dados do funcionário...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-soft">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${base}/team`)}
            className="h-9 w-9 p-0 hover:bg-zinc-100 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-700" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-zinc-700" />
                {titlePage}
              </h1>
              {isEdit && isSelf && (
                <Badge
                  variant="emerald"
                  className="text-[9px] font-bold uppercase tracking-wider"
                >
                  Você mesmo
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {isEdit
                ? 'Atualize dados, perfil de acesso e credenciais deste usuário.'
                : 'Defina os dados de acesso do novo funcionário deste painel.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(`${base}/team`)}
            className="h-10 px-4 rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving}
            className="h-10 px-4 text-xs font-bold text-white bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4 text-amber-400" />
            {isSaving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar'}
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identidade */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                Identidade
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Dados e credenciais de acesso do colaborador.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="field-name" className="text-xs font-semibold text-zinc-700">
                  Nome completo *
                </Label>
                <Input
                  id="field-name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className={errors.name ? 'border-rose-400' : ''}
                />
                {errors.name && (
                  <span className="text-[11px] text-rose-600">{errors.name}</span>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="field-email" className="text-xs font-semibold text-zinc-700">
                  E-mail de acesso *
                </Label>
                <Input
                  id="field-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="maria@empresa.com"
                  className={errors.email ? 'border-rose-400' : ''}
                />
                {errors.email && (
                  <span className="text-[11px] text-rose-600">{errors.email}</span>
                )}
              </div>
            </div>
          </div>

          {/* Credenciais */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                  Credenciais
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isEdit
                    ? 'Preencha apenas se quiser redefinir a senha.'
                    : 'Defina a senha temporária. O usuário poderá trocá-la depois.'}
                </p>
              </div>
              {isEdit && (
                <Badge variant="zinc" className="text-[10px] font-bold uppercase">
                  <KeyRound className="w-3 h-3 mr-1" />
                  Opcional
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="field-password" className="text-xs font-semibold text-zinc-700">
                  {isEdit ? 'Nova senha' : 'Senha temporária *'}
                </Label>
                <div className="relative">
                  <Input
                    id="field-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className={`pr-10 ${errors.password ? 'border-rose-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800 p-1.5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <span className="text-[11px] text-rose-600">{errors.password}</span>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="field-password-confirm" className="text-xs font-semibold text-zinc-700">
                  Confirmar senha
                </Label>
                <Input
                  id="field-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                  placeholder="Repita a senha"
                  className={errors.confirmPassword ? 'border-rose-400' : ''}
                />
                {errors.confirmPassword && (
                  <span className="text-[11px] text-rose-600">
                    {errors.confirmPassword}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Cargo & Contato */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                Cargo & Contato
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Informações internas (opcional) para identificação na equipe.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="field-position" className="text-xs font-semibold text-zinc-700">
                  Cargo / Função
                </Label>
                <Input
                  id="field-position"
                  value={form.position}
                  onChange={(e) => set('position', e.target.value)}
                  placeholder="Ex: Atendente, Garçom, Barbeiro"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: '🍽️ Garçom', pos: 'Garçom', cargoId: 'waiter' },
                    { label: '👨‍🍳 Cozinheiro', pos: 'Cozinheiro', cargoId: 'cook' },
                    { label: '🔥 Chapista', pos: 'Chapista', cargoId: 'grill' },
                    { label: '💳 Caixa', pos: 'Operador de Caixa', cargoId: 'cashier' },
                    { label: '🧹 Limpeza', pos: 'Limpeza', cargoId: 'cleaning' },
                    { label: '👑 Gerente', pos: 'Gerente', cargoId: 'manager' },
                  ].map((preset) => (
                    <button
                      key={preset.pos}
                      type="button"
                      onClick={() => {
                        set('position', preset.pos);
                        set('cargoId', preset.cargoId);
                      }}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        form.position.toLowerCase() === preset.pos.toLowerCase()
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                          : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border-zinc-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="field-phone" className="text-xs font-semibold text-zinc-700">
                  Telefone / WhatsApp (Acesso)
                </Label>
                <Input
                  id="field-phone"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="(11) 99999-0000"
                />
                <p className="text-[11px] text-zinc-400">
                  O colaborador poderá usar este WhatsApp para entrar no sistema.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Direita */}
        <div className="space-y-6">
          {/* Perfil de Acesso */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                Cargo & permissões
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                O cargo libera só as telas da função. O menu e as rotas obedecem sozinhos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {CARGOS.map((cargo) => {
                const selected = form.cargoId === cargo.id;
                const isAdminOpt = cargo.id === 'admin';
                return (
                  <button
                    key={cargo.id}
                    type="button"
                    onClick={() => {
                      set('cargoId', cargo.id);
                      if (!form.position.trim() || CARGOS.some((c) => c.position === form.position.trim())) {
                        set('position', cargo.position);
                      }
                    }}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      selected
                        ? isAdminOpt
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-zinc-900 bg-zinc-50/60'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-black ${
                          isAdminOpt ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {cargo.label.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                          {cargo.label}
                          {selected && (
                            <Badge
                              variant="emerald"
                              className="text-[9px] font-bold uppercase px-1.5 py-0"
                            >
                              Selecionado
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                          {cargo.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Prévia do que o cargo enxerga */}
            {(() => {
              const cargo = CARGOS.find((c) => c.id === form.cargoId);
              if (!cargo) return null;
              return (
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">
                    Telas liberadas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cargo.modules.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-700"
                      >
                        {m}
                      </span>
                    ))}
                    {form.accumulateCleaning && cargo.id !== 'cleaning' && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-800">
                        + Rotinas de limpeza
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Limpeza acumulável (garçom/cozinheiro que também limpa) */}
            {form.cargoId !== 'cleaning' && (
              <label className="flex items-start gap-2.5 rounded-xl border border-zinc-200 p-3 cursor-pointer hover:border-zinc-300 transition">
                <input
                  type="checkbox"
                  checked={form.accumulateCleaning}
                  onChange={(e) => set('accumulateCleaning', e.target.checked)}
                  className="w-4 h-4 rounded mt-0.5"
                />
                <span>
                  <span className="text-xs font-bold text-zinc-900 block">
                    🧹 Acumula limpeza / serviços gerais
                  </span>
                  <span className="text-[11px] text-zinc-500 block mt-0.5">
                    Soma as rotinas de limpeza sem trocar o cargo (p/ quem não tem equipe exclusiva).
                  </span>
                </span>
              </label>
            )}

            {isSelf && form.cargoId !== 'admin' && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
                <strong>Atenção:</strong> você está abrindo mão do acesso total. Isso pode
                bloquear o seu acesso se não houver outro administrador.
              </div>
            )}
          </div>

          {/* Status */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-soft p-6 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                Status
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Usuários inativos não conseguem fazer login.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3.5">
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  {form.isActive ? 'Usuário ativo' : 'Usuário inativo'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {form.isActive
                    ? 'Pode acessar o painel agora.'
                    : 'Login bloqueado temporariamente.'}
                </div>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => set('isActive', v)}
                disabled={isSelf && form.isActive && form.cargoId === 'admin'}
              />
            </div>

            {isSelf && form.isActive && form.cargoId === 'admin' && (
              <p className="text-[11px] text-zinc-500">
                Você não pode desativar o seu próprio perfil de administrador.
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default TeamFormPage;
