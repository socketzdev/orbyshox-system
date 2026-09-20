/**
 * Perfil vertical da tela de Tarefas / Ordens de Serviço.
 *
 * Cada vertical tem a SUA cara (título, descrição e modelos prontos) sobre a
 * mesma mecânica real de tarefas — refrigeração nunca vê rotina de salão.
 */

export interface TaskPreset {
  icon: string;
  title: string;
  description: string;
  assignedRole: string;
  frequency: 'DAILY' | 'WEEKLY' | 'ONCE';
  triggerType: 'BEFORE_OPENING' | 'AFTER_LUNCH' | 'TIME' | 'AFTER_CLOSING';
  dueTime: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requireConfirmation: boolean;
}

export interface TaskVerticalProfile {
  /** Título da página no modo gerência. */
  title: string;
  /** Subtítulo da página no modo gerência. */
  subtitle: string;
  /** Rótulo do botão de criar. */
  createLabel: string;
  /** Título da seção de hoje (modo gerência). */
  todaySection: string;
  presets: TaskPreset[];
}

const RESTAURANT_PRESETS: TaskPreset[] = [
  {
    icon: '🧼',
    title: 'Lavar o banheiro',
    description: 'Higienizar vasos, pias, espelhos, chão e repor papel toalha e sabonete.',
    assignedRole: 'Limpeza',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '22:30',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '🪑',
    title: 'Organizar as mesas e salão',
    description: 'Alinhar mesas e cadeiras, conferir galheteiros e repor porta-guardanapos.',
    assignedRole: 'Garçom',
    frequency: 'DAILY',
    triggerType: 'AFTER_LUNCH',
    dueTime: '15:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '❄️',
    title: 'Higienizar bancadas e freezers',
    description: 'Desinfetar superfícies de inox e checar temperaturas dos refrigeradores.',
    assignedRole: 'Cozinha',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '23:00',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '🥤',
    title: 'Repor bebidas no balcão',
    description: 'Abastecer refrigerantes em lata, cervejas e águas na geladeira expositora.',
    assignedRole: 'Garçom',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '11:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '💰',
    title: 'Fechar gaveta e conciliar Caixa',
    description: 'Bater fechamento físico com resumo do sistema e maquininhas de cartão.',
    assignedRole: 'Caixa',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '23:30',
    priority: 'URGENT',
    requireConfirmation: true,
  },
  {
    icon: '🧹',
    title: 'Varrer e passar pano no salão',
    description: 'Deixar o chão limpo, seco e perfumado para o próximo turno.',
    assignedRole: 'Limpeza',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '23:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
];

const BARBEARIA_PRESETS: TaskPreset[] = [
  {
    icon: '💈',
    title: 'Higienizar cadeiras e bancadas',
    description: 'Limpar cadeiras, bancadas e espelhos antes de abrir.',
    assignedRole: 'Barbeiro',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '08:30',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '✂️',
    title: 'Esterilizar navalhas e pentes',
    description: 'Esterilizar instrumentos e conferir kits de corte.',
    assignedRole: 'Barbeiro',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '08:45',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '📅',
    title: 'Confirmar agenda do dia',
    description: 'Chamar no WhatsApp os clientes agendados para hoje.',
    assignedRole: 'Recepção',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '09:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '🧴',
    title: 'Repor pomadas e descartáveis',
    description: 'Conferir estoque de pomadas, lâminas, toalhas e capas.',
    assignedRole: 'Barbeiro',
    frequency: 'WEEKLY',
    triggerType: 'TIME',
    dueTime: '10:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
];

const SALAO_PRESETS: TaskPreset[] = [
  {
    icon: '💇',
    title: 'Higienizar cadeiras e lavatórios',
    description: 'Limpar estações de trabalho e lavatórios antes de abrir.',
    assignedRole: 'Cabeleireiro',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '08:30',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '💅',
    title: 'Organizar mesa de manicure',
    description: 'Esterilizar alicates, separar esmaltes e descartáveis.',
    assignedRole: 'Manicure',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '08:45',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '📅',
    title: 'Confirmar agenda do dia',
    description: 'Confirmar horários com as clientes pelo WhatsApp.',
    assignedRole: 'Recepção',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '09:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '✨',
    title: 'Repor cosméticos e descartáveis',
    description: 'Conferir tinturas, cremes, lixas e toucas.',
    assignedRole: 'Esteticista',
    frequency: 'WEEKLY',
    triggerType: 'TIME',
    dueTime: '10:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
];

const REFRIGERACAO_PRESETS: TaskPreset[] = [
  {
    icon: '❄️',
    title: 'Instalação de split 9000 BTUs',
    description: 'Instalar evaporadora e condensadora, vácuo e teste de funcionamento.',
    assignedRole: 'Técnico',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '08:00',
    priority: 'HIGH',
    requireConfirmation: true,
  },
  {
    icon: '🧰',
    title: 'Limpeza de filtros',
    description: 'Lavar filtros e serpentinas, verificar dreno.',
    assignedRole: 'Técnico',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '09:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '🔧',
    title: 'Manutenção preventiva',
    description: 'Revisão geral: parte elétrica, gás e fixação.',
    assignedRole: 'Técnico',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '10:00',
    priority: 'NORMAL',
    requireConfirmation: true,
  },
  {
    icon: '🚐',
    title: 'Visita técnica',
    description: 'Orçamento ou diagnóstico no endereço do cliente.',
    assignedRole: 'Técnico',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '14:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
];

const GRAFICA_PRESETS: TaskPreset[] = [
  {
    icon: '🎨',
    title: 'Criar arte do pedido',
    description: 'Desenvolver layout conforme briefing do cliente.',
    assignedRole: 'Designer',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '09:00',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '🖨️',
    title: 'Impressão e acabamento',
    description: 'Imprimir, cortar e dar acabamento no material.',
    assignedRole: 'Produção',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '14:00',
    priority: 'NORMAL',
    requireConfirmation: true,
  },
  {
    icon: '📦',
    title: 'Entrega do pedido',
    description: 'Conferir material e entregar/retirar com o cliente.',
    assignedRole: 'Entrega',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '17:00',
    priority: 'NORMAL',
    requireConfirmation: true,
  },
  {
    icon: '👁️',
    title: 'Enviar prova para aprovação',
    description: 'Encaminhar prova digital e aguardar OK do cliente.',
    assignedRole: 'Designer',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '11:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
];

const INTERNET_PRESETS: TaskPreset[] = [
  {
    icon: '🌐',
    title: 'Instalação de fibra',
    description: 'Passar drop, instalar ONU e ativar o plano do cliente.',
    assignedRole: 'Técnico',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '08:00',
    priority: 'HIGH',
    requireConfirmation: true,
  },
  {
    icon: '📡',
    title: 'Troca de roteador',
    description: 'Substituir equipamento com defeito e reconfigurar Wi-Fi.',
    assignedRole: 'Técnico',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '10:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '🛠️',
    title: 'Visita de suporte',
    description: 'Atendimento a chamado de lentidão ou queda.',
    assignedRole: 'Suporte',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '14:00',
    priority: 'URGENT',
    requireConfirmation: false,
  },
  {
    icon: '💳',
    title: 'Cobrança de mensalidade',
    description: 'Cobrar faturas em atraso e negociar pagamento.',
    assignedRole: 'Financeiro',
    frequency: 'ONCE',
    triggerType: 'TIME',
    dueTime: '09:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
];

const LOJA_ROUPA_PRESETS: TaskPreset[] = [
  {
    icon: '👕',
    title: 'Repor araras e prateleiras',
    description: 'Repor peças em falta e alinhar cabides por tamanho.',
    assignedRole: 'Atendente',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '08:30',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '🪟',
    title: 'Montar vitrine da semana',
    description: 'Trocar looks da vitrine com as novidades e ofertas.',
    assignedRole: 'Atendente',
    frequency: 'WEEKLY',
    triggerType: 'TIME',
    dueTime: '09:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '🧾',
    title: 'Conferir provadores',
    description: 'Recolher peças, conferir numeração e organizar devoluções.',
    assignedRole: 'Atendente',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '19:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '💰',
    title: 'Fechar caixa do dia',
    description: 'Conferir vendas, trocas e valores com o resumo do sistema.',
    assignedRole: 'Caixa',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '19:30',
    priority: 'URGENT',
    requireConfirmation: true,
  },
];

const ACADEMIA_PRESETS: TaskPreset[] = [
  {
    icon: '🏋️',
    title: 'Higienizar aparelhos e halteres',
    description: 'Limpar aparelhos, bancos e halteres com álcool 70 antes da abertura.',
    assignedRole: 'Limpeza',
    frequency: 'DAILY',
    triggerType: 'BEFORE_OPENING',
    dueTime: '05:30',
    priority: 'HIGH',
    requireConfirmation: false,
  },
  {
    icon: '🧾',
    title: 'Cobrar mensalidades vencidas',
    description: 'Ligar/enviar mensagem para alunos com mensalidade em atraso.',
    assignedRole: 'Recepção',
    frequency: 'DAILY',
    triggerType: 'TIME',
    dueTime: '10:00',
    priority: 'URGENT',
    requireConfirmation: false,
  },
  {
    icon: '📋',
    title: 'Revisar fichas vencendo',
    description: 'Verificar treinos próximos do vencimento e renovar avaliações.',
    assignedRole: 'Professor',
    frequency: 'WEEKLY',
    triggerType: 'TIME',
    dueTime: '09:00',
    priority: 'NORMAL',
    requireConfirmation: false,
  },
  {
    icon: '🔒',
    title: 'Conferir catraca e fechamento',
    description: 'Conferir acessos do dia, travamentos e valores do caixa.',
    assignedRole: 'Recepção',
    frequency: 'DAILY',
    triggerType: 'AFTER_CLOSING',
    dueTime: '22:30',
    priority: 'HIGH',
    requireConfirmation: true,
  },
];

export const TASK_VERTICAL_PROFILES: Record<string, TaskVerticalProfile> = {
  DEFAULT: {
    title: 'Sistema de Tarefas & Rotinas',
    subtitle: 'Gerencie rotinas operacionais, tarefas recorrentes e prazos dos funcionários.',
    createLabel: 'Nova Tarefa',
    todaySection: 'Rotinas planejadas para hoje',
    roles: ['Garçom', 'Cozinha', 'Caixa', 'Estoquista', 'Limpeza', 'Todos'],
    presets: RESTAURANT_PRESETS,
  },
  BARBEARIA: {
    title: 'Tarefas da Barbearia',
    subtitle: 'Rotina da loja: higiene, instrumentos e confirmação da agenda.',
    createLabel: 'Nova Tarefa',
    todaySection: 'Rotina de hoje',
    roles: ['Barbeiro', 'Todos'],
    presets: BARBEARIA_PRESETS,
  },
  SALAO_FEMININO: {
    title: 'Tarefas do Salão',
    subtitle: 'Rotina do salão: estações, esterilização e agenda confirmada.',
    createLabel: 'Nova Tarefa',
    todaySection: 'Rotina de hoje',
    roles: ['Cabeleireiro', 'Manicure', 'Esteticista', 'Todos'],
    presets: SALAO_PRESETS,
  },
  REFRIGERACAO: {
    title: 'Ordens de Serviço',
    subtitle: 'Instalações, manutenções e visitas técnicas da equipe.',
    createLabel: 'Nova Ordem de Serviço',
    todaySection: 'Serviços de hoje',
    roles: ['Técnico', 'Todos'],
    presets: REFRIGERACAO_PRESETS,
  },
  GRAFICA: {
    title: 'Ordens de Serviço',
    subtitle: 'Projetos, produção, prazos e entregas.',
    createLabel: 'Nova Ordem de Serviço',
    todaySection: 'Produção de hoje',
    roles: ['Designer', 'Produção', 'Todos'],
    presets: GRAFICA_PRESETS,
  },
  INTERNET: {
    title: 'Ordens de Serviço',
    subtitle: 'Instalações, suporte, visitas e cobranças.',
    createLabel: 'Nova Ordem de Serviço',
    todaySection: 'Atendimentos de hoje',
    roles: ['Técnico', 'Suporte', 'Todos'],
    presets: INTERNET_PRESETS,
  },
  LOJA_ROUPA: {
    title: 'Tarefas da Loja',
    subtitle: 'Reposição, vitrine, provadores e conferência do caixa.',
    createLabel: 'Nova Tarefa',
    todaySection: 'Rotina de hoje',
    roles: ['Atendente', 'Todos'],
    presets: LOJA_ROUPA_PRESETS,
  },
  ACADEMIA: {
    title: 'Rotinas da Academia',
    subtitle: 'Limpeza de aparelhos, vistoria da sala e cobrança de inadimplentes.',
    createLabel: 'Nova Rotina',
    todaySection: 'Rotina de hoje',
    roles: ['Professor', 'Recepção', 'Limpeza', 'Todos'],
    presets: ACADEMIA_PRESETS,
  },
};

export interface TaskVerticalProfile {
  title: string;
  subtitle: string;
  createLabel: string;
  todaySection: string;
  presets: TaskPreset[];
  /** Cargos exibidos quando o backend não manda a lista (fallback honesto). */
  roles: string[];
}

/**
 * Perfil da empresa logada: barbearia usa o sub-template (categoria da
 * Company); demais nichos caem no padrão.
 */
export function taskVerticalProfile(niche?: string | null, category?: string | null): TaskVerticalProfile {
  if (String(niche || '').toUpperCase() === 'BARBERSHOP') {
    const key = String(category || '').toUpperCase();
    if (key === 'BARBEARIA') return TASK_VERTICAL_PROFILES.BARBEARIA;
    if (TASK_VERTICAL_PROFILES[key]) return TASK_VERTICAL_PROFILES[key];
    return TASK_VERTICAL_PROFILES.BARBEARIA;
  }
  return TASK_VERTICAL_PROFILES.DEFAULT;
}
