export interface AiToolUsed {
  name: string;
  summary: string;
  success: boolean;
}

export interface AiResultsSummary {
  total: number;
  title: string;
  items: Array<{
    title: string;
    subtitle?: string;
    icon?: string;
  }>;
}

/**
 * Ação que o Copiloto pede ao frontend executar imediatamente após responder.
 * `CHANGE_THEME` é o caso principal: aplica a nova cor sem recarregar a página.
 */
export type AiClientActionType = 'CHANGE_THEME' | 'REFRESH_DATA' | 'NAVIGATE' | 'TOAST';

export interface AiThemePayload {
  primaryColor?: string;
  colorLabel?: string;
  darkMode?: boolean;
  logoUrl?: string;
  font?: string;
}

export interface AiClientAction {
  type: AiClientActionType;
  payload: AiThemePayload | { queries?: string[] } | { path?: string } | { message?: string } | any;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  categoryTag?: string;
  thought?: string;
  toolsUsed?: AiToolUsed[];
  resultsSummary?: AiResultsSummary;
  modelUsed?: string;
  /** Presente quando a resposta veio do orquestrador heurístico, sem o Gemini. */
  usedFallback?: boolean;
  timestamp: string;
}

/** Item da lista de conversas salvas. */
export interface AiConversationSummary {
  id: string;
  title: string;
  model?: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export type GeminiModelId = 'gemini-3.1-flash-lite' | 'gemini-3-pro' | 'gemini-2.0-flash' | 'gemini-1.5-pro';

export interface GeminiModelInfo {
  id: GeminiModelId;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
}

export const GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    shortLabel: 'Gemini 3.1 Flash Lite',
    badge: 'Fast',
    description: 'Modelo leve e de baixa latência, ideal para operações diárias e comandos de voz.',
  },
  {
    id: 'gemini-3-pro',
    label: 'Gemini 3 Pro',
    shortLabel: 'Gemini 3 Pro',
    badge: 'Beta',
    description: 'Nova geração Gemini de raciocínio profundo e controle autônomo total do restaurante.',
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    shortLabel: 'Gemini 2.0 Flash',
    badge: 'Fast',
    description: 'Respostas ultra-rápidas e baixa latência. Ideal para operações diárias e comandos de voz.',
  },
  {
    id: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    shortLabel: 'Gemini 1.5 Pro',
    badge: 'Pro',
    description: 'Raciocínio analítico para auditorias financeiras e projeções de faturamento.',
  },
];
