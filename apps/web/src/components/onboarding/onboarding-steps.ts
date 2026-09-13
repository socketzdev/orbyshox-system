export interface OnboardingStep {
  /** Seletor CSS do elemento destacado. `body` = passo sem destaque. */
  target: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * IMPORTANTE: os seletores abaixo apontam para atributos `data-tour` realmente
 * presentes em `components/layout/sidebar.tsx`. Se você renomear/remover uma
 * âncora lá, atualize aqui — caso contrário o passo fica com `targetRect` nulo
 * e o destaque simplesmente não aparece.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    target: 'body',
    title: 'Bem-vindo ao Painel Administrativo!',
    description: 'Vamos fazer um tour rápido para você conhecer as principais funcionalidades.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard"]',
    title: 'Dashboard',
    description: 'Aqui você vê a saúde do negócio em tempo real — MRR, churn, clientes ativos.',
    placement: 'right',
  },
  {
    target: '[data-tour="clientes"]',
    title: 'Clientes',
    description: 'Gerencie todas as empresas clientes: filtre por nicho, plano ou status.',
    placement: 'right',
  },
  {
    target: '[data-tour="financeiro"]',
    title: 'Financeiro',
    description: 'Acompanhe faturamento, inadimplência e projeções de receita.',
    placement: 'right',
  },
  {
    target: '[data-tour="suporte"]',
    title: 'Suporte',
    description: 'Central de tickets com SLA automático por prioridade.',
    placement: 'right',
  },
  {
    target: '[data-tour="equipe"]',
    title: 'Equipe',
    description: 'Cadastre e gerencie os usuários internos que acessam o painel.',
    placement: 'right',
  },
  {
    target: '[data-tour="configuracoes"]',
    title: 'Configurações',
    description: 'Integrações, e-mails transacionais e regras de cobrança ficam aqui.',
    placement: 'right',
  },
];
