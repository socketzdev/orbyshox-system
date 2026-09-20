import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Check,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Store,
  Scissors,
  ShoppingCart,
  UtensilsCrossed,
  FileText,
  Globe,
  Phone,
  Mail,
  User,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Package,
  Pencil,
  Building2,
  MapPin,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Copy,
  QrCode,
  Tablet,
} from 'lucide-react';
import { apiPost, apiGet } from '@/lib/api';
import { useSlugCheck } from '@/lib/use-slug-check';
import { normalizeSlug } from '@/lib/slug';
import { toast } from 'sonner';

export const SEGMENT_TEMPLATES: Record<
  'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET' | 'UNIVERSAL',
  {
    name: string;
    badge: string;
    defaultDescription: string;
    defaultFeatures: string[];
    modules: {
      id: string;
      label: string;
      desc: string;
      icon: any;
    }[];
  }
> = {
  RESTAURANT: {
    name: 'Restaurante & Gastronomia',
    badge: 'Gastronomia & Salão',
    defaultDescription:
      'Operação gastronômica completa com gestão de salão, autoatendimento e cozinha integrada.',
    defaultFeatures: [
      'tables',
      'kds',
      'recipes',
      'reservations',
      'pos',
      'finance',
      'stock',
      'automations',
    ],
    modules: [
      {
        id: 'tables',
        label: 'Salão, Mesas & Comandas',
        desc: 'Comandas inteligentes e fechamento de conta em tempo real',
        icon: UtensilsCrossed,
      },
      {
        id: 'kds',
        label: 'Cozinha KDS & Expedição',
        desc: 'Painel digital para cozinheiros com cronômetro de preparo',
        icon: UtensilsCrossed,
      },
      {
        id: 'pos',
        label: 'Frente de Caixa (PDV)',
        desc: 'Emissão rápida de cupons, pagamentos divididos e sangrias',
        icon: ShoppingCart,
      },
      {
        id: 'recipes',
        label: 'Ficha Técnica & Receitas',
        desc: 'Custo por porção e baixa automática de insumos no estoque',
        icon: FileText,
      },
      {
        id: 'reservations',
        label: 'Reservas de Mesas',
        desc: 'Controle de ocupação e horários marcados',
        icon: Store,
      },
      {
        id: 'finance',
        label: 'Financeiro & Fluxo de Caixa',
        desc: 'Contas a pagar/receber, fechamento de turno e DRE',
        icon: FileText,
      },
      {
        id: 'stock',
        label: 'Estoque de Insumos',
        desc: 'Alertas de reposição e controle de desperdício',
        icon: Package,
      },
      {
        id: 'automations',
        label: 'Automações Inteligentes',
        desc: 'Avisos de fechamento e lembretes aos clientes',
        icon: Sparkles,
      },
    ],
  },
  BARBERSHOP: {
    name: 'Barbearia & Estética',
    badge: 'Agendamentos & Estética',
    defaultDescription:
      'Barbearia moderna com agendamento online, comissões de profissionais e frente de caixa.',
    defaultFeatures: [
      'appointments',
      'barbers',
      'services',
      'loyalty',
      'pos',
      'finance',
      'stock',
      'automations',
    ],
    modules: [
      {
        id: 'appointments',
        label: 'Agenda Inteligente & Link Online',
        desc: 'Visualização diária/semanal e página pública de agendamento',
        icon: Store,
      },
      {
        id: 'barbers',
        label: 'Equipe & Gestão de Comissões',
        desc: 'Comissões diferenciadas por serviço ou produto',
        icon: Scissors,
      },
      {
        id: 'services',
        label: 'Catálogo de Serviços',
        desc: 'Duração, precificação e profissionais habilitados',
        icon: Scissors,
      },
      {
        id: 'pos',
        label: 'Frente de Caixa (PDV)',
        desc: 'Cobrança rápida de serviços e produtos no balcão',
        icon: ShoppingCart,
      },
      {
        id: 'loyalty',
        label: 'Fidelidade & Retenção',
        desc: 'Cartão de fidelidade digital e lembretes de retorno',
        icon: Sparkles,
      },
      {
        id: 'finance',
        label: 'Caixa & Comissões Pagas',
        desc: 'Fechamento de caixa diário e extrato de profissionais',
        icon: FileText,
      },
      {
        id: 'stock',
        label: 'Estoque de Revenda',
        desc: 'Controle de pomadas, lâminas e produtos para barba',
        icon: Package,
      },
      {
        id: 'automations',
        label: 'Avisos por WhatsApp',
        desc: 'Confirmação automática de horário e lembretes',
        icon: Sparkles,
      },
    ],
  },
  SUPERMARKET: {
    name: 'Universal',
    badge: 'PDV, Estoque & Financeiro',
    defaultDescription:
      'Operação universal para qualquer negócio: frente de caixa, produtos, estoque, clientes e financeiro.',
    defaultFeatures: [
      'pos',
      'products',
      'stock',
      'stock_batches',
      'customers',
      'finance',
      'reports',
      'team',
      'settings',
      'automations',
      'promotions',
    ],
    modules: [
      {
        id: 'pos',
        label: 'Frente de Caixa (PDV)',
        desc: 'Vendas rápidas no balcão com múltiplas formas de pagamento',
        icon: ShoppingCart,
      },
      {
        id: 'products',
        label: 'Catálogo & Produtos',
        desc: 'Cadastro de produtos e serviços com preços',
        icon: Package,
      },
      {
        id: 'stock',
        label: 'Controle de Estoque',
        desc: 'Saldo, inventário, perdas e lotes com validade',
        icon: Package,
      },
      {
        id: 'customers',
        label: 'Clientes & CRM',
        desc: 'Cadastro e histórico de clientes',
        icon: User,
      },
      {
        id: 'finance',
        label: 'Financeiro & Caixa',
        desc: 'Controle de gaveta, faturamento e contas a pagar',
        icon: FileText,
      },
      {
        id: 'reports',
        label: 'Relatórios & Fechamento',
        desc: 'Faturamento por período e impressão do fechamento',
        icon: FileText,
      },
      {
        id: 'team',
        label: 'Equipe',
        desc: 'Funcionários e permissões de acesso',
        icon: User,
      },
      {
        id: 'automations',
        label: 'Automações & Alertas',
        desc: 'Avisos de estoque baixo e vencimentos',
        icon: Sparkles,
      },
    ],
  },
  // Alias legado: empresas antigas de mercado usam o mesmo template Universal.
  UNIVERSAL: {
    name: 'Universal',
    badge: 'PDV, Estoque & Financeiro',
    defaultDescription:
      'Operação universal para qualquer negócio: frente de caixa, produtos, estoque, clientes e financeiro.',
    defaultFeatures: [
      'pos',
      'products',
      'stock',
      'stock_batches',
      'customers',
      'finance',
      'reports',
      'team',
      'settings',
      'automations',
      'promotions',
    ],
    modules: [
      {
        id: 'pos',
        label: 'Frente de Caixa (PDV)',
        desc: 'Vendas rápidas no balcão com múltiplas formas de pagamento',
        icon: ShoppingCart,
      },
      {
        id: 'products',
        label: 'Catálogo & Produtos',
        desc: 'Cadastro de produtos e serviços com preços',
        icon: Package,
      },
      {
        id: 'stock',
        label: 'Controle de Estoque',
        desc: 'Saldo, inventário, perdas e lotes com validade',
        icon: Package,
      },
      {
        id: 'customers',
        label: 'Clientes & CRM',
        desc: 'Cadastro e histórico de clientes',
        icon: User,
      },
      {
        id: 'finance',
        label: 'Financeiro & Caixa',
        desc: 'Controle de gaveta, faturamento e contas a pagar',
        icon: FileText,
      },
      {
        id: 'reports',
        label: 'Relatórios & Fechamento',
        desc: 'Faturamento por período e impressão do fechamento',
        icon: FileText,
      },
      {
        id: 'team',
        label: 'Equipe',
        desc: 'Funcionários e permissões de acesso',
        icon: User,
      },
      {
        id: 'automations',
        label: 'Automações & Alertas',
        desc: 'Avisos de estoque baixo e vencimentos',
        icon: Sparkles,
      },
    ],
  },
};

const STEPS = [
  { id: 1, label: 'Identidade' },
  { id: 2, label: 'Conta' },
  { id: 3, label: 'Revisão' },
];

export interface CreateTenantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTenantCreated?: (tenant: any) => void;
}

export const CreateTenantModal: React.FC<CreateTenantModalProps> = ({
  open,
  onOpenChange,
  onTenantCreated,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);

  // Form states
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newTradeName, setNewTradeName] = useState('');
  const [tradeNameManuallyEdited, setTradeNameManuallyEdited] = useState(false);
  const slugCheck = useSlugCheck(newTradeName || newCompanyName);
  const [newCnpj, setNewCnpj] = useState('');
  const [newNiche, setNewNiche] = useState<'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET' | 'UNIVERSAL'>('RESTAURANT');
  const [restaurantCategory, setRestaurantCategory] = useState<
    'BURGER_HOUSE' | 'PIZZERIA' | 'RESTAURANT' | 'JAPANESE' | 'PASTRY'
  >('BURGER_HOUSE');
  const [barbershopCategory, setBarbershopCategory] = useState<
    'BARBEARIA' | 'SALAO_FEMININO' | 'REFRIGERACAO' | 'GRAFICA' | 'INTERNET' | 'LOJA_ROUPA' | 'ACADEMIA'
  >('BARBEARIA');
  const [tableCount, setTableCount] = useState<number>(10);
  const [enableQrCode, setEnableQrCode] = useState<boolean>(true);
  const [enableTablet, setEnableTablet] = useState<boolean>(true);
  const [enableWaiterCall, setEnableWaiterCall] = useState<boolean>(true);
  const [newDescription, setNewDescription] = useState(
    SEGMENT_TEMPLATES.RESTAURANT.defaultDescription
  );
  const [newLogo, setNewLogo] = useState('');
  const [newPrimaryColor, setNewPrimaryColor] = useState('#18181b');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // Features
  const [newFeatures, setNewFeatures] = useState<string[]>(
    SEGMENT_TEMPLATES.RESTAURANT.defaultFeatures
  );

  // Admin Master
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // CNPJ automatic search state
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [cnpjConfirmed, setCnpjConfirmed] = useState(false);

  // Provisioning loading state
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningState, setProvisioningState] = useState<{
    step: number;
    text: string;
    completed: boolean;
  }>({
    step: 1,
    text: 'Validando credenciais e domínio corporativo...',
    completed: false,
  });

  const [isSubmittingTenant, setIsSubmittingTenant] = useState(false);

  // Phone verification state
  const [phoneCheck, setPhoneCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'superadmin' | 'conflict';
    message?: string;
  }>({ status: 'idle' });

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setCreateStep(1);
      setIsProvisioning(false);
      setNewPhone('');
      setPhoneCheck({ status: 'idle' });
      setNewCompanyName('');
      setNewTradeName('');
      setTradeNameManuallyEdited(false);
      setNewCnpj('');
      setCnpjConfirmed(false);
      setNewContactEmail('');
      setNewAddress('');
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setTableCount(10);
      setEnableQrCode(true);
      setEnableTablet(true);
      setEnableWaiterCall(true);
      setProvisioningState({
        step: 1,
        text: 'Validando credenciais e domínio corporativo...',
        completed: false,
      });
    }
  }, [open]);

  // Mask helper for Phone
  const formatPhoneMask = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 11);
    if (!d.length) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  };

  // Debounced phone verification
  useEffect(() => {
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneCheck({ status: 'idle' });
      return;
    }

    setPhoneCheck({ status: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const res: any = await apiGet('/tenants/validate-phone', { phone: digits });
        if (res?.available) {
          if (res.isSuperAdmin) {
            setPhoneCheck({ status: 'superadmin', message: res.message });
          } else {
            setPhoneCheck({ status: 'available', message: res.message });
          }
        } else {
          setPhoneCheck({ status: 'conflict', message: res?.message || 'Número já cadastrado em outra empresa' });
        }
      } catch {
        setPhoneCheck({ status: 'idle' });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [newPhone]);

  // Mask helper for CNPJ
  const formatCnpjMask = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  };

  // CNPJ lookup (BrasilAPI)
  const handleLookupCnpj = async (cnpjString: string) => {
    const cleanDigits = cnpjString.replace(/\D/g, '');
    if (cleanDigits.length !== 14) return;

    try {
      setIsSearchingCnpj(true);
      setCnpjConfirmed(false);
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanDigits}`);
      if (!res.ok) {
        throw new Error('CNPJ não encontrado na Receita Federal');
      }
      const data = await res.json();

      const razaoSocial = data.razao_social || '';
      const nomeFantasia = data.nome_fantasia || razaoSocial.split(' ')[0] || '';
      const telefone = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}` : '';
      const email = data.email || '';
      const logradouro = data.logradouro ? `${data.logradouro}, ${data.numero || 'S/N'}` : '';
      const municipioUf = data.municipio ? `${data.municipio} - ${data.uf}` : '';
      const enderecoCompleto = [logradouro, data.bairro, municipioUf].filter(Boolean).join(' · ');

      if (razaoSocial) setNewCompanyName(razaoSocial);
      if (nomeFantasia && !tradeNameManuallyEdited) {
        setNewTradeName(nomeFantasia);
      }
      if (telefone) setNewPhone(telefone);
      if (email) setNewContactEmail(email);
      if (enderecoCompleto) setNewAddress(enderecoCompleto);

      // Detect niche
      const descCnae = (data.cnae_fiscal_descricao || '').toLowerCase();
      let detectedNiche: 'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET' | 'UNIVERSAL' = newNiche;

      if (descCnae.includes('cabelereiro') || descCnae.includes('estética') || descCnae.includes('barbearia')) {
        detectedNiche = 'BARBERSHOP';
      } else if (descCnae.includes('restaurante') || descCnae.includes('refeição') || descCnae.includes('bar') || descCnae.includes('lanchonete')) {
        detectedNiche = 'RESTAURANT';
      } else if (descCnae) {
        // Qualquer outro ramo (mercados, varejo, serviços) → template Universal.
        detectedNiche = 'UNIVERSAL';
      }

      applySegmentTemplate(detectedNiche);
      setCnpjConfirmed(true);
      toast.success(`CNPJ confirmado: ${razaoSocial}`);
    } catch {
      setCnpjConfirmed(false);
      toast.error('CNPJ não localizado automaticamente. Você pode preencher manualmente.');
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  // Segment template selection
  const applySegmentTemplate = (nicheKey: 'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET' | 'UNIVERSAL') => {
    setNewNiche(nicheKey);
    setNewDescription(SEGMENT_TEMPLATES[nicheKey].defaultDescription);
    setNewFeatures(SEGMENT_TEMPLATES[nicheKey].defaultFeatures);
  };

  // Generate strong password
  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewAdminPassword(pwd);
    setShowPassword(true);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(pwd).catch(() => {});
    }
    toast.success('Senha forte gerada e copiada para a área de transferência!');
  };

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!newAdminPassword) return { score: 0, label: 'Vazia' };
    let score = 0;
    if (newAdminPassword.length >= 8) score++;
    if (/[0-9]/.test(newAdminPassword) && /[a-zA-Z]/.test(newAdminPassword)) score++;
    if (/[^a-zA-Z0-9]/.test(newAdminPassword) || newAdminPassword.length >= 12) score++;
    if (score === 1) return { score: 1, label: 'Fraca' };
    if (score === 2) return { score: 2, label: 'Média' };
    return { score: 3, label: 'Forte' };
  }, [newAdminPassword]);

  // Step transitions
  const handleNextStep = () => {
    if (createStep === 1) {
      if (!newCompanyName.trim()) {
        toast.error('Informe o nome ou razão social da empresa.');
        return;
      }
      if (phoneCheck.status === 'conflict') {
        toast.error(phoneCheck.message || 'O número de WhatsApp informado já está em uso.');
        return;
      }
    }
    if (createStep === 2) {
      if (!newAdminName.trim()) {
        toast.error('Informe o nome do administrador master.');
        return;
      }
      if (phoneCheck.status === 'conflict') {
        toast.error(phoneCheck.message || 'O número de WhatsApp informado já está em uso.');
        return;
      }
      if (!newAdminPassword || newAdminPassword.length < 8) {
        toast.error('A senha deve conter no mínimo 8 caracteres.');
        return;
      }
    }
    setCreateStep((prev) => (Math.min(prev + 1, 3) as any));
  };

  const handlePrevStep = () => {
    if (createStep === 1) {
      onOpenChange(false);
      return;
    }
    setCreateStep((prev) => (Math.max(prev - 1, 1) as any));
  };

  // Provisioning
  const handleCreateTenantInModal = async () => {
    if (phoneCheck.status === 'conflict') {
      toast.error(phoneCheck.message || 'O número de WhatsApp informado já está em uso.');
      return;
    }
    setIsSubmittingTenant(true);
    setIsProvisioning(true);

    const generatedSlug = normalizeSlug(newTradeName || newCompanyName) || 'nova-empresa';
    const finalSlug = slugCheck.slug || generatedSlug;

    const contactEmail =
      newContactEmail.trim() ||
      newAdminEmail.trim() ||
      `contato@${finalSlug}.com`;
    const adminEmail =
      newAdminEmail.trim() ||
      `admin@${finalSlug}.com`;

    const payload = {
      companyName: newCompanyName.trim(),
      tradeName: newTradeName.trim() || newCompanyName.trim(),
      slug: finalSlug,
      niche: newNiche,
      restaurantCategory: newNiche === 'RESTAURANT' ? restaurantCategory : undefined,
      barbershopCategory: newNiche === 'BARBERSHOP' ? barbershopCategory : undefined,
      tableCount: newNiche === 'RESTAURANT' ? Number(tableCount) : 0,
      enableQrCode: newNiche === 'RESTAURANT' ? enableQrCode : false,
      enableTablet: newNiche === 'RESTAURANT' ? enableTablet : false,
      enableWaiterCall: newNiche === 'RESTAURANT' ? enableWaiterCall : false,
      cnpj: newCnpj.trim() || undefined,
      description: newDescription.trim() || undefined,
      features: newFeatures,
      logo: newLogo.trim() || undefined,
      primaryColor: newPrimaryColor,
      phone: newPhone.trim() || undefined,
      email: contactEmail,
      address: newAddress.trim() || undefined,
      adminName: newAdminName.trim() || 'Administrador Master',
      adminEmail: adminEmail,
      adminPassword: newAdminPassword.trim(),
    };

    setProvisioningState({ step: 1, text: 'Validando credenciais e domínio corporativo...', completed: false });

    try {
      setProvisioningState({ step: 2, text: 'Registrando empresa no banco de dados isolado...', completed: false });
      const apiRes = await apiPost('/tenants', payload);
      const finalTenantObj = apiRes;

      setProvisioningState({
        step: 3,
        text: 'Configurando ambiente e autenticação do aplicativo...',
        completed: false,
      });

      setProvisioningState({
        step: 4,
        text: `Inicializando catálogo com template ${SEGMENT_TEMPLATES[newNiche].name}...`,
        completed: false,
      });

      setProvisioningState({
        step: 5,
        text: 'Ativando regras de automação e painel operacional...',
        completed: true,
      });

      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-tenants-list'] });

      toast.success(`Empresa ${payload.tradeName} criada com sucesso!`);

      if (onTenantCreated) onTenantCreated(finalTenantObj);

      onOpenChange(false);

      // Permanece no painel: sem redirect para /login (era isso que
      // derrubava a sessão do Super Admin após cada criação).
      if (finalTenantObj?.id) {
        navigate(`/tenants/${finalTenantObj.id}`);
      }
    } catch (err: any) {
      let message = 'Falha ao provisionar empresa.';
      const resData = err?.response?.data;
      if (typeof resData?.message === 'string') {
        message = resData.message;
      } else if (resData?.fieldErrors) {
        const errors = Object.entries(resData.fieldErrors)
          .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
          .join('; ');
        message = `Dados inválidos: ${errors}`;
      } else if (typeof resData?.error === 'string') {
        message = resData.error;
      } else if (err?.message) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setIsProvisioning(false);
      setIsSubmittingTenant(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeClassName="right-5 top-5 text-zinc-400 hover:text-zinc-900 transition-colors"
        className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh] p-0 bg-white border border-zinc-200/80 rounded-2xl shadow-xl flex flex-col font-sans select-none overflow-hidden"
      >
        {isProvisioning ? (
          /* ══════ TELA DE PROVISIONAMENTO LIMPA ══════ */
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-xs">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-zinc-900 tracking-tight">
                Criando {newTradeName || newCompanyName}...
              </h3>
              <p className="text-xs text-zinc-500">
                {provisioningState.text}
              </p>
            </div>

            <div className="w-full max-w-sm bg-zinc-50 border border-zinc-200/70 rounded-xl p-4 text-left space-y-2">
              {[
                { step: 1, label: 'Validação de credenciais e domínio' },
                { step: 2, label: 'Criação no banco de dados isolado' },
                { step: 3, label: 'Configuração da conta master do cliente' },
                { step: 4, label: `Injeção do catálogo (${SEGMENT_TEMPLATES[newNiche].name})` },
                { step: 5, label: 'Finalização e liberação do acesso' },
              ].map((item) => {
                const isDone = provisioningState.step > item.step || (provisioningState.step === 5 && item.step === 5);
                const isCurrent = provisioningState.step === item.step && !provisioningState.completed;
                return (
                  <div
                    key={item.step}
                    className={`flex items-center gap-2.5 text-xs ${
                      isDone
                        ? 'text-zinc-900 font-medium'
                        : isCurrent
                        ? 'text-zinc-900 font-bold'
                        : 'text-zinc-400'
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />
                    ) : isCurrent ? (
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-900 animate-spin shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-zinc-300 shrink-0" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* ─── STEPPER SUPERIOR (Círculos numerados conectados por linha fina) ─── */}
            <div className="w-full px-6 pt-5 pb-4 border-b border-zinc-100 shrink-0 bg-white">
              <div className="flex items-center justify-between max-w-md mx-auto relative">
                {STEPS.map((s, idx) => {
                  const isCompleted = createStep > s.id;
                  const isCurrent = createStep === s.id;
                  const isLast = idx === STEPS.length - 1;

                  return (
                    <React.Fragment key={s.id}>
                      <div className="flex flex-col items-center relative z-10">
                        <button
                          type="button"
                          disabled={s.id > createStep}
                          onClick={() => isCompleted && setCreateStep(s.id as any)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all ${
                            isCompleted
                              ? 'bg-zinc-950 text-white cursor-pointer hover:bg-zinc-800'
                              : isCurrent
                              ? 'bg-zinc-950 text-white ring-4 ring-zinc-100 font-bold'
                              : 'bg-white border border-zinc-200 text-zinc-400 cursor-default'
                          }`}
                        >
                          {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : s.id}
                        </button>
                        <span
                          className={`text-[11px] mt-1.5 transition-colors ${
                            isCurrent
                              ? 'text-zinc-950 font-semibold'
                              : isCompleted
                              ? 'text-zinc-700 font-medium'
                              : 'text-zinc-400 font-normal'
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>

                      {!isLast && (
                        <div className="flex-1 h-[1.5px] mx-2 -mt-5 bg-zinc-200 relative">
                          <div
                            className="h-full bg-zinc-950 transition-all duration-300"
                            style={{ width: isCompleted ? '100%' : '0%' }}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* ─── CONTEÚDO SCROLLÁVEL DA ETAPA (Agrupado em Cards) ─── */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-5">
              {/* ══════════════════════════════════════════════════════════ */}
              {/* ETAPA 1: Identidade, Nicho & Dados                         */}
              {/* ══════════════════════════════════════════════════════════ */}
              {createStep === 1 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Card 1: Nicho do Negócio */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50/70 border border-zinc-200/80 space-y-3.5">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-zinc-700 stroke-[1.75]" />
                      <h3 className="text-xs font-semibold text-zinc-900 tracking-tight">
                        Nicho do Negócio
                      </h3>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { key: 'RESTAURANT', label: 'Restaurante', icon: UtensilsCrossed },
                        { key: 'BARBERSHOP', label: 'Barbearia', icon: Scissors },
                        { key: 'UNIVERSAL', label: 'Universal', icon: ShoppingCart },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = newNiche === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => applySegmentTemplate(item.key as any)}
                            className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-white border-zinc-950 ring-1 ring-zinc-950 text-zinc-950 shadow-xs font-semibold'
                                : 'bg-white/80 border-zinc-200 hover:border-zinc-300 text-zinc-600 hover:bg-white'
                            }`}
                          >
                            <Icon className="w-5 h-5 stroke-[1.75]" />
                            <span className="text-xs">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Subcategorias quando for Restaurante */}
                    {newNiche === 'RESTAURANT' && (
                      <div className="pt-2 border-t border-zinc-200/60 flex items-center gap-2 animate-in fade-in duration-200">
                        <span className="text-[11px] text-zinc-500 font-medium shrink-0">
                          Especialidade:
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[
                            { key: 'BURGER_HOUSE', label: 'Hamburgueria', emoji: '🍔' },
                            { key: 'PIZZERIA', label: 'Pizzaria', emoji: '🍕' },
                            { key: 'RESTAURANT', label: 'Tradicional', emoji: '🍽️' },
                            { key: 'JAPANESE', label: 'Japonesa', emoji: '🍣' },
                            { key: 'PASTRY', label: 'Pastelaria', emoji: '🥟' },
                          ].map((cat) => (
                            <button
                              key={cat.key}
                              type="button"
                              onClick={() => setRestaurantCategory(cat.key as any)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                                restaurantCategory === cat.key
                                  ? 'bg-zinc-950 text-white border-zinc-950 font-medium'
                                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                              }`}
                            >
                              <span className="text-xs">{cat.emoji}</span>
                              <span>{cat.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Subcategorias quando for Barbearia (igual ao Restaurante) */}
                    {newNiche === 'BARBERSHOP' && (
                      <div className="pt-2 border-t border-zinc-200/60 flex items-center gap-2 animate-in fade-in duration-200">
                        <span className="text-[11px] text-zinc-500 font-medium shrink-0">
                          Template:
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[
                            { key: 'BARBEARIA', label: 'Barbearia' },
                            { key: 'SALAO_FEMININO', label: 'Salão Feminino' },
                            { key: 'REFRIGERACAO', label: 'Refrigeração' },
                            { key: 'GRAFICA', label: 'Gráfica / Design' },
                            { key: 'INTERNET', label: 'Internet' },
                            { key: 'LOJA_ROUPA', label: 'Loja de Roupa' },
                            { key: 'ACADEMIA', label: 'Academia' },
                          ].map((cat) => (
                            <button
                              key={cat.key}
                              type="button"
                              onClick={() => setBarbershopCategory(cat.key as any)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                                barbershopCategory === cat.key
                                  ? 'bg-zinc-950 text-white border-zinc-950 font-medium'
                                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                              }`}
                            >
                              <span>{cat.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Salão, Mesas e Autoatendimento (Apenas Restaurantes) */}
                    {newNiche === 'RESTAURANT' && (
                      <div className="mt-3 pt-3 border-t border-zinc-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <UtensilsCrossed className="w-3.5 h-3.5 text-zinc-700" />
                            <label className="text-[11px] font-semibold text-zinc-800">
                              Salão, Mesas & Autoatendimento
                            </label>
                          </div>
                          <span className="text-[10px] text-zinc-400">Configuração automática</span>
                        </div>

                        {/* Quantidade de Mesas */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-zinc-600">Quantidade de Mesas Iniciais:</span>
                            <span className="text-xs font-bold font-mono text-zinc-900 bg-zinc-200/60 px-2 py-0.5 rounded">
                              {tableCount} mesas
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {[6, 10, 15, 20].map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setTableCount(count)}
                                className={`flex-1 py-1 text-xs rounded-lg border transition-all cursor-pointer font-medium ${
                                  tableCount === count
                                    ? 'bg-zinc-900 text-white border-zinc-900'
                                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                                }`}
                              >
                                {count}
                              </button>
                            ))}
                            <div className="w-20">
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                value={tableCount}
                                onChange={(e) => setTableCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                                className="h-7 text-xs text-center font-mono py-0 px-1"
                                placeholder="Outro"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Toggles Rápidos de Autoatendimento */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div
                            onClick={() => setEnableQrCode(!enableQrCode)}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                              enableQrCode
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <QrCode className={`w-4 h-4 shrink-0 mt-0.5 ${enableQrCode ? 'text-white' : 'text-zinc-500'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold">QR Code nas Mesas</div>
                              <div className={`text-[10px] leading-tight mt-0.5 ${enableQrCode ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                Clientes pedem pelo celular escaneando a mesa
                              </div>
                            </div>
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                              enableQrCode ? 'bg-white border-white text-zinc-900' : 'border-zinc-300'
                            }`}>
                              {enableQrCode && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>

                          <div
                            onClick={() => setEnableTablet(!enableTablet)}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                              enableTablet
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <Tablet className={`w-4 h-4 shrink-0 mt-0.5 ${enableTablet ? 'text-white' : 'text-zinc-500'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold">Tablet Fixo na Mesa</div>
                              <div className={`text-[10px] leading-tight mt-0.5 ${enableTablet ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                Provisiona dispositivos de autoatendimento
                              </div>
                            </div>
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                              enableTablet ? 'bg-white border-white text-zinc-900' : 'border-zinc-300'
                            }`}>
                              {enableTablet && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Dados da Empresa */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50/70 border border-zinc-200/80 space-y-3.5">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-zinc-700 stroke-[1.75]" />
                      <h3 className="text-xs font-semibold text-zinc-900 tracking-tight">
                        Dados da Empresa
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {/* CNPJ */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-zinc-600">
                            CNPJ (Opcional)
                          </label>
                          {cnpjConfirmed && (
                            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[2]" />
                              Confirmado na Receita
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="00.000.000/0000-00"
                            value={newCnpj}
                            onChange={(e) => {
                              const masked = formatCnpjMask(e.target.value);
                              setNewCnpj(masked);
                              if (masked.replace(/\D/g, '').length === 14) {
                                handleLookupCnpj(masked);
                              } else {
                                setCnpjConfirmed(false);
                              }
                            }}
                            className="h-10 text-xs rounded-xl bg-white border-zinc-200 pr-9 font-mono"
                          />
                          <div className="absolute right-3 top-3 text-zinc-400">
                            {isSearchingCnpj ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : cnpjConfirmed ? (
                              <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Razão Social */}
                        <div>
                          <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                            Razão Social / Nome Oficial *
                          </label>
                          <Input
                            type="text"
                            placeholder="Ex: Restaurante Alvorada Ltda"
                            value={newCompanyName}
                            onChange={(e) => {
                              setNewCompanyName(e.target.value);
                              if (!tradeNameManuallyEdited) {
                                setNewTradeName(e.target.value);
                              }
                            }}
                            className="h-10 text-xs rounded-xl bg-white border-zinc-200"
                            required
                          />
                        </div>

                        {/* Nome Fantasia */}
                        <div>
                          <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                            Nome Fantasia / Marca
                          </label>
                          <Input
                            type="text"
                            placeholder="Ex: Alvorada Grill"
                            value={newTradeName}
                            onChange={(e) => {
                              setTradeNameManuallyEdited(true);
                              setNewTradeName(e.target.value);
                            }}
                            className="h-10 text-xs rounded-xl bg-white border-zinc-200"
                          />
                        </div>
                      </div>

                      {/* Endereço */}
                      <div>
                        <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                          Endereço Completo
                        </label>
                        <Input
                          type="text"
                          placeholder="Ex: Av. Paulista, 1000, Bela Vista - São Paulo / SP"
                          value={newAddress}
                          onChange={(e) => setNewAddress(e.target.value)}
                          className="h-10 text-xs rounded-xl bg-white border-zinc-200"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Canais de Contato */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50/70 border border-zinc-200/80 space-y-3.5">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-zinc-700 stroke-[1.75]" />
                      <h3 className="text-xs font-semibold text-zinc-900 tracking-tight">
                        Canais de Contato
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* WhatsApp Comercial */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-zinc-600">
                            WhatsApp de Contato
                          </label>
                          {phoneCheck.status === 'checking' && (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Verificando...
                            </span>
                          )}
                          {phoneCheck.status === 'available' && (
                            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[2]" />
                              Livre
                            </span>
                          )}
                          {phoneCheck.status === 'superadmin' && (
                            <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 stroke-[2]" />
                              Seu WhatsApp
                            </span>
                          )}
                          {phoneCheck.status === 'conflict' && (
                            <span className="text-[10px] text-rose-500 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 stroke-[2]" />
                              Em uso
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="(11) 99999-8888"
                            value={newPhone}
                            onChange={(e) => setNewPhone(formatPhoneMask(e.target.value))}
                            className={`h-10 text-xs rounded-xl bg-white pr-9 font-mono transition-colors ${
                              phoneCheck.status === 'conflict'
                                ? 'border-rose-400 text-rose-900 focus-visible:ring-rose-200'
                                : phoneCheck.status === 'available'
                                ? 'border-emerald-300 focus-visible:ring-emerald-200'
                                : phoneCheck.status === 'superadmin'
                                ? 'border-blue-300 focus-visible:ring-blue-200'
                                : 'border-zinc-200'
                            }`}
                          />
                          <div className="absolute right-3 top-3 text-zinc-400">
                            {phoneCheck.status === 'checking' && (
                              <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
                            )}
                            {phoneCheck.status === 'available' && (
                              <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                            )}
                            {phoneCheck.status === 'superadmin' && (
                              <ShieldCheck className="w-4 h-4 text-blue-600 stroke-[2]" />
                            )}
                            {phoneCheck.status === 'conflict' && (
                              <AlertCircle className="w-4 h-4 text-rose-500 stroke-[2]" />
                            )}
                          </div>
                        </div>
                        {phoneCheck.message && phoneCheck.status !== 'idle' && (
                          <span
                            className={`text-[10px] mt-1 block font-medium ${
                              phoneCheck.status === 'conflict'
                                ? 'text-rose-600'
                                : phoneCheck.status === 'superadmin'
                                ? 'text-blue-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {phoneCheck.message}
                          </span>
                        )}
                      </div>

                      {/* E-mail de Contato */}
                      <div>
                        <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                          E-mail Corporativo
                        </label>
                        <Input
                          type="email"
                          placeholder="contato@empresa.com"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          className="h-10 text-xs rounded-xl bg-white border-zinc-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════ */}
              {/* ETAPA 2: Conta do Dono / Administrador Master              */}
              {/* ══════════════════════════════════════════════════════════ */}
              {createStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-zinc-900">
                      Conta do Proprietário
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Credenciais para o cliente gerenciar a empresa e cadastrar funcionários.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-50/70 border border-zinc-200/80 space-y-4 max-w-xl mx-auto">
                    {/* Nome do Dono */}
                    <div>
                      <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                        Nome do Administrador Master *
                      </label>
                      <Input
                        type="text"
                        placeholder="Ex: Carlos Ferreira"
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                        className="h-10 text-xs rounded-xl bg-white border-zinc-200"
                        required
                      />
                    </div>

                    {/* WhatsApp de Login */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-medium text-zinc-600">
                          WhatsApp de Acesso Direto
                        </label>
                        {phoneCheck.status === 'checking' && (
                          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Verificando...
                          </span>
                        )}
                        {phoneCheck.status === 'available' && (
                          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[2]" />
                            Livre
                          </span>
                        )}
                        {phoneCheck.status === 'superadmin' && (
                          <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 stroke-[2]" />
                            Seu WhatsApp
                          </span>
                        )}
                        {phoneCheck.status === 'conflict' && (
                          <span className="text-[10px] text-rose-500 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 stroke-[2]" />
                            Em uso
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="(11) 99999-9999"
                          value={newPhone}
                          onChange={(e) => setNewPhone(formatPhoneMask(e.target.value))}
                          className={`h-10 text-xs rounded-xl bg-white pr-9 font-mono transition-colors ${
                            phoneCheck.status === 'conflict'
                              ? 'border-rose-400 text-rose-900 focus-visible:ring-rose-200'
                              : phoneCheck.status === 'available'
                              ? 'border-emerald-300 focus-visible:ring-emerald-200'
                              : phoneCheck.status === 'superadmin'
                              ? 'border-blue-300 focus-visible:ring-blue-200'
                              : 'border-zinc-200'
                          }`}
                        />
                        <div className="absolute right-3 top-3 text-zinc-400">
                          {phoneCheck.status === 'checking' && (
                            <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
                          )}
                          {phoneCheck.status === 'available' && (
                            <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                          )}
                          {phoneCheck.status === 'superadmin' && (
                            <ShieldCheck className="w-4 h-4 text-blue-600 stroke-[2]" />
                          )}
                          {phoneCheck.status === 'conflict' && (
                            <AlertCircle className="w-4 h-4 text-rose-500 stroke-[2]" />
                          )}
                        </div>
                      </div>
                      {phoneCheck.message && phoneCheck.status !== 'idle' ? (
                        <span
                          className={`text-[10px] mt-1 block font-medium ${
                            phoneCheck.status === 'conflict'
                              ? 'text-rose-600'
                              : phoneCheck.status === 'superadmin'
                              ? 'text-blue-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {phoneCheck.message}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400 mt-1 block">
                          Permite autenticação rápida pelo número de telefone sem digitar e-mail.
                        </span>
                      )}
                    </div>

                    {/* E-mail do Administrador */}
                    <div>
                      <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                        E-mail de Login
                      </label>
                      <Input
                        type="email"
                        placeholder="admin@empresa.com"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="h-10 text-xs rounded-xl bg-white border-zinc-200"
                      />
                    </div>

                    {/* Senha com indicador de força segmentado */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-medium text-zinc-600">
                          Senha Inicial de Acesso *
                        </label>
                        <button
                          type="button"
                          onClick={generateStrongPassword}
                          className="text-[10px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
                        >
                          Gerar Senha Forte
                        </button>
                      </div>

                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Mínimo de 8 caracteres"
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          className="h-10 text-xs rounded-xl bg-white border-zinc-200 pr-16 font-mono"
                        />
                        <div className="absolute right-2.5 top-2.5 flex items-center gap-1 text-zinc-400">
                          {newAdminPassword && (
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator?.clipboard?.writeText) {
                                  navigator.clipboard.writeText(newAdminPassword);
                                  toast.success('Senha copiada!');
                                }
                              }}
                              className="p-1 hover:text-zinc-700 transition cursor-pointer"
                              title="Copiar senha"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-1 hover:text-zinc-700 transition cursor-pointer"
                            title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Barrinha segmentada de força (sutil e elegante) */}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 flex gap-1.5 h-1">
                          <div
                            className={`flex-1 rounded-full transition-all ${
                              passwordStrength.score >= 1 ? 'bg-zinc-700' : 'bg-zinc-200'
                            }`}
                          />
                          <div
                            className={`flex-1 rounded-full transition-all ${
                              passwordStrength.score >= 2 ? 'bg-zinc-700' : 'bg-zinc-200'
                            }`}
                          />
                          <div
                            className={`flex-1 rounded-full transition-all ${
                              passwordStrength.score >= 3 ? 'bg-zinc-950' : 'bg-zinc-200'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                          {passwordStrength.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════ */}
              {/* ETAPA 3: Revisão & Provisionamento                         */}
              {/* ══════════════════════════════════════════════════════════ */}
              {createStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1 mb-2">
                    <h3 className="text-sm font-bold text-zinc-900">
                      Revisão dos Dados
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Confira as informações antes de finalizar o cadastro da empresa.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Mini-card 1: Identidade da Empresa */}
                    <div className="p-4 rounded-xl border border-zinc-200/80 bg-zinc-50/50 space-y-2.5 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Store className="w-3.5 h-3.5 text-zinc-600" />
                          <h4 className="text-xs font-bold text-zinc-900">
                            Empresa & Identidade
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCreateStep(1)}
                          title="Editar dados da empresa"
                          className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-md transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 stroke-[1.75]" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Razão Social</span>
                          <span className="font-semibold text-zinc-900 truncate block">
                            {newCompanyName || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Nome Fantasia</span>
                          <span className="font-semibold text-zinc-900 truncate block">
                            {newTradeName || newCompanyName || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Nicho & Categoria</span>
                          <span className="font-semibold text-zinc-900 truncate block">
                            {SEGMENT_TEMPLATES[newNiche].name}
                            {newNiche === 'RESTAURANT' && (
                              <span className="text-zinc-500 font-normal">
                                {' · '}
                                {restaurantCategory === 'BURGER_HOUSE'
                                  ? '🍔 Hamburgueria'
                                  : restaurantCategory === 'PIZZERIA'
                                  ? '🍕 Pizzaria'
                                  : restaurantCategory === 'JAPANESE'
                                  ? '🍣 Japonesa'
                                  : restaurantCategory === 'PASTRY'
                                  ? '🥟 Pastelaria'
                                  : '🍽️ Tradicional'}
                              </span>
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">E-mail de Contato</span>
                          <span className="text-zinc-700 truncate block">
                            {newContactEmail || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">CNPJ</span>
                          <span className="font-mono text-zinc-700 truncate block text-[11px]">
                            {newCnpj || 'Não informado'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">WhatsApp</span>
                          <span className="text-zinc-700 truncate block">
                            {newPhone || '—'}
                          </span>
                        </div>
                        {newNiche === 'RESTAURANT' && (
                          <div className="col-span-2 sm:col-span-3 pt-2 border-t border-zinc-200/60 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-[10px] text-zinc-400 font-medium">Salão & Autoatendimento:</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">
                              🪑 {tableCount} Mesas
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
                              enableQrCode ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium' : 'bg-zinc-100 text-zinc-400 border-zinc-200'
                            }`}>
                              <QrCode className="w-3 h-3" />
                              {enableQrCode ? 'QR Code Ativo' : 'Sem QR Code'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
                              enableTablet ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium' : 'bg-zinc-100 text-zinc-400 border-zinc-200'
                            }`}>
                              <Tablet className="w-3 h-3" />
                              {enableTablet ? 'Tablets nas Mesas' : 'Sem Tablets'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mini-card 2: Conta do Dono */}
                    <div className="p-4 rounded-xl border border-zinc-200/80 bg-zinc-50/50 space-y-2.5 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-zinc-600" />
                          <h4 className="text-xs font-bold text-zinc-900">
                            Conta do Proprietário
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCreateStep(2)}
                          title="Editar conta do dono"
                          className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-md transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 stroke-[1.75]" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Nome do Dono</span>
                          <span className="font-semibold text-zinc-900 truncate block">
                            {newAdminName || 'Administrador Master'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Login por E-mail</span>
                          <span className="font-mono text-zinc-700 truncate block text-[11px]">
                            {newAdminEmail || (newContactEmail ? newContactEmail : 'Acesso via WhatsApp')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">WhatsApp de Login</span>
                          <span className="font-mono text-zinc-700 truncate block text-[11px]">
                            {newPhone || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Senha de Acesso</span>
                          <div className="flex items-center gap-1.5 font-mono text-zinc-800 text-[11px]">
                            <span className="truncate max-w-[85px]">{showPassword ? newAdminPassword : '••••••••'}</span>
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer"
                              title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                            >
                              {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator?.clipboard?.writeText) {
                                  navigator.clipboard.writeText(newAdminPassword);
                                  toast.success('Senha copiada!');
                                }
                              }}
                              className="text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer"
                              title="Copiar senha"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── RODAPÉ FIXO (Voltar à esquerda, Avançar/Criar à direita) ─── */}
            <div className="px-6 py-4 border-t border-zinc-100 bg-white flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handlePrevStep}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-2 rounded-xl hover:bg-zinc-100 cursor-pointer"
              >
                {createStep === 1 ? 'Cancelar' : 'Voltar'}
              </button>

              <div className="flex items-center gap-3">
                {createStep < 3 ? (
                  <Button
                    type="button"
                    onClick={handleNextStep}
                    className="h-10 px-5 text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Avançar</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={isSubmittingTenant}
                    onClick={handleCreateTenantInModal}
                    className="h-10 px-6 text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmittingTenant ? (
                      <span>Criando empresa...</span>
                    ) : (
                      <>
                        <span>Criar Empresa</span>
                        <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
