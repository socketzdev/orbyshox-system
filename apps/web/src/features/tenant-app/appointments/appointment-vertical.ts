/**
 * Perfil vertical da Agenda & Horários (admin) e do link online (público).
 *
 * Cada segmento vê os SEUS rótulos (barbeiro, técnico, designer...) sobre o
 * mesmo agendamento real — refrigeração nunca lê "corte" ou "barbeiro".
 */

export interface ApptVertical {
  /** Quem atende: Barbeiro | Profissional | Técnico | Designer */
  pro: string;
  /** Plural p/ filtros e listas. */
  proPlural: string;
  /** O que é agendado: Corte | Serviço | Projeto */
  serviceNoun: string;
  /** Emoji do segmento (toasts e WhatsApp). */
  emoji: string;
  /** Nome genérico da empresa (quando não há nome real). */
  companyFallback: string;
  /** Rótulo do bloco ocupado na grade ("Na Cadeira" / "Em atendimento"). */
  inChair: string;
  /** Botão de iniciar ("Iniciar Corte" / "Iniciar Atendimento"...). */
  startLabel: string;
  /** Linha de valor ("Valor do Corte" / "Valor do Serviço"...). */
  valueLabel: string;
}

const DEFAULT: ApptVertical = {
  pro: 'Profissional',
  proPlural: 'Profissionais',
  serviceNoun: 'Serviço',
  emoji: '📅',
  companyFallback: 'Empresa',
  inChair: 'Em atendimento',
  startLabel: 'Iniciar Atendimento',
  valueLabel: 'Valor do Serviço',
};

const PROFILES: Record<string, ApptVertical> = {
  BARBEARIA: {
    pro: 'Barbeiro',
    proPlural: 'Barbeiros',
    serviceNoun: 'Corte',
    emoji: '💈',
    companyFallback: 'Barbearia',
    inChair: 'Na Cadeira',
    startLabel: 'Iniciar Corte',
    valueLabel: 'Valor do Corte',
  },
  SALAO_FEMININO: {
    pro: 'Profissional',
    proPlural: 'Profissionais',
    serviceNoun: 'Serviço',
    emoji: '💇',
    companyFallback: 'Salão',
    inChair: 'Em atendimento',
    startLabel: 'Iniciar Atendimento',
    valueLabel: 'Valor do Serviço',
  },
  REFRIGERACAO: {
    pro: 'Técnico',
    proPlural: 'Técnicos',
    serviceNoun: 'Serviço',
    emoji: '❄️',
    companyFallback: 'Empresa',
    inChair: 'Em atendimento',
    startLabel: 'Iniciar Serviço',
    valueLabel: 'Valor do Serviço',
  },
  GRAFICA: {
    pro: 'Designer',
    proPlural: 'Designers',
    serviceNoun: 'Projeto',
    emoji: '🎨',
    companyFallback: 'Estúdio',
    inChair: 'Em produção',
    startLabel: 'Iniciar Projeto',
    valueLabel: 'Valor do Projeto',
  },
  INTERNET: {
    pro: 'Técnico',
    proPlural: 'Técnicos',
    serviceNoun: 'Serviço',
    emoji: '🌐',
    companyFallback: 'Provedor',
    inChair: 'Em atendimento',
    startLabel: 'Iniciar Atendimento',
    valueLabel: 'Valor do Serviço',
  },
  LOJA_ROUPA: {
    pro: 'Atendente',
    proPlural: 'Atendentes',
    serviceNoun: 'Serviço',
    emoji: '👕',
    companyFallback: 'Loja',
    inChair: 'Em atendimento',
    startLabel: 'Iniciar Atendimento',
    valueLabel: 'Valor do Serviço',
  },
  ACADEMIA: {
    pro: 'Professor',
    proPlural: 'Professores',
    serviceNoun: 'Aula',
    emoji: '🏋️',
    companyFallback: 'Academia',
    inChair: 'Em aula',
    startLabel: 'Iniciar Aula',
    valueLabel: 'Valor da Aula',
  },
};

/**
 * Barbershop usa o sub-template (categoria da Company); demais nichos usam o
 * perfil neutro — nunca rótulo de outro segmento.
 */
export function apptVertical(niche?: string | null, category?: string | null): ApptVertical {
  if (String(niche || '').toUpperCase() === 'BARBERSHOP') {
    const key = String(category || '').toUpperCase();
    if (PROFILES[key]) return PROFILES[key];
    return PROFILES.BARBEARIA;
  }
  return DEFAULT;
}
