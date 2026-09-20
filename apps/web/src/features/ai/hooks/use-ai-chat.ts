import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import {
  AiChatMessage,
  AiClientAction,
  AiConversationSummary,
  GeminiModelId,
} from '../types/ai-chat.types';
import { applyAndStoreBrandTheme, type BrandTheme } from '@/lib/brand-theme';

interface UseAiChatOptions {
  tenantName?: string;
  userName?: string;
  niche?: string;
  scope?: 'TENANT' | 'GLOBAL';
}

export function useAiChat(options: UseAiChatOptions = {}) {
  const { tenantName = 'Restaurante do Gordo', userName = 'Carlos roberto', niche = 'RESTAURANT', scope = 'TENANT' } = options;

  const [messages, setMessages] = useState<AiChatMessage[]>([]);

  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>('gemini-3.1-flash-lite');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('Gerando resposta...');
  const [contextTag, setContextTag] = useState<string | null>(
    scope === 'GLOBAL' ? 'Plataforma Global' : `${userName} (${tenantName})`,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  /** Texto já confirmado pela fala (só resultados finais entram aqui). */
  const committedTextRef = useRef('');
  /** Prévia ainda não confirmada — nunca é somada ao confirmado. */
  const interimTextRef = useRef('');
  const queryClient = useQueryClient();

  // ─── Histórico de conversas ───
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  /** Recarrega a lista lateral. Falha silenciosa: não pode atrapalhar o chat. */
  const refreshConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const list = await apiGet<AiConversationSummary[]>('/ai/conversations');
      setConversations(Array.isArray(list) ? list : []);
    } catch {
      // Lista é acessório — se falhar, o chat continua funcionando.
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  /** Abre uma conversa salva e carrega as mensagens. */
  const openConversation = useCallback(async (id: string) => {
    try {
      const data = await apiGet<any>(`/ai/conversations/${id}`);
      setConversationId(data.id);
      setMessages(
        (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          thought: m.thought,
          toolsUsed: m.toolsUsed,
          resultsSummary: m.resultsSummary,
          modelUsed: m.modelUsed,
          usedFallback: m.usedFallback,
          timestamp: m.timestamp,
        })),
      );
    } catch {
      toast.error('Não foi possível abrir esta conversa.');
    }
  }, []);

  /** Começa uma conversa nova (a anterior fica salva no histórico). */
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setInput('');
  }, []);

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await apiPatch(`/ai/conversations/${id}`, { title });
        await refreshConversations();
      } catch {
        toast.error('Não foi possível renomear a conversa.');
      }
    },
    [refreshConversations],
  );

  const togglePinConversation = useCallback(
    async (id: string) => {
      try {
        await apiPatch(`/ai/conversations/${id}/pin`);
        await refreshConversations();
      } catch {
        toast.error('Não foi possível fixar a conversa.');
      }
    },
    [refreshConversations],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await apiDelete(`/ai/conversations/${id}`);
        // Se apagou a conversa aberta, começa uma nova.
        if (id === conversationId) {
          setConversationId(null);
          setMessages([]);
        }
        await refreshConversations();
        toast.success('Conversa excluída.');
      } catch {
        toast.error('Não foi possível excluir a conversa.');
      }
    },
    [conversationId, refreshConversations],
  );

  const clearAllConversations = useCallback(async () => {
    try {
      await apiDelete('/ai/conversations');
      setConversationId(null);
      setMessages([]);
      await refreshConversations();
      toast.success('Histórico apagado.');
    } catch {
      toast.error('Não foi possível apagar o histórico.');
    }
  }, [refreshConversations]);

  /**
   * Executa a ação que a IA pediu (ex.: trocar a cor do painel).
   *
   * Fica no hook, e não no backend, porque só o cliente pode mexer no DOM e
   * nas caches do React Query. Erros aqui são isolados: uma falha ao aplicar o
   * tema não pode derrubar a conversa.
   */
  const applyClientAction = useCallback(
    (action: AiClientAction) => {
      try {
        switch (action.type) {
          case 'CHANGE_THEME': {
            const theme = action.payload as BrandTheme;
            if (applyAndStoreBrandTheme(theme)) {
              toast.success(
                `Tema aplicado: ${theme.colorLabel || theme.primaryColor}`,
                { duration: 2500 },
              );
            }
            break;
          }

          case 'REFRESH_DATA': {
            const queries = (action.payload as { queries?: string[] })?.queries || [];
            for (const key of queries) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
            break;
          }

          case 'NAVIGATE': {
            const path = (action.payload as { path?: string })?.path;
            if (path) window.location.assign(path);
            break;
          }

          case 'TOAST': {
            const message = (action.payload as { message?: string })?.message;
            if (message) toast(message);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        // Nunca propagar: a resposta da IA já foi entregue ao usuário.
        console.error('Falha ao aplicar ação do Copiloto:', err);
      }
    },
    [queryClient],
  );

  // Inicializa reconhecimento de voz se suportado pelo navegador
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';

    /**
     * Com `interimResults = true` o navegador dispara `onresult` várias vezes
     * enquanto a pessoa fala, reenviando o MESMO trecho em versões parciais
     * ("mude" → "mude a" → "mude a cor"). Acumular tudo em `setInput(prev => ...)`
     * concatenava cada parcial e o texto saía duplicado.
     *
     * Agora só o resultado FINAL é confirmado em `committedTextRef`. O parcial
     * é apenas prévia visual — nunca é somado ao que já foi confirmado.
     */
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) final += chunk;
        else interim += chunk;
      }

      if (final.trim()) {
        const confirmed = final.trim();
        committedTextRef.current = committedTextRef.current
          ? `${committedTextRef.current} ${confirmed}`
          : confirmed;
        interimTextRef.current = '';
        setInput(committedTextRef.current);
        return;
      }

      if (interim) {
        // Prévia: confirmado + o que está sendo dito agora (sem acumular).
        interimTextRef.current = interim;
        const preview = committedTextRef.current
          ? `${committedTextRef.current} ${interim}`
          : interim;
        setInput(preview);
      }
    };

    recognition.onerror = (event: any) => {
      // "aborted" acontece quando nós mesmos paramos — não é erro para o usuário.
      if (event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
        setRecordingError('Não foi possível capturar o áudio.');
      }
      interimTextRef.current = '';
      setIsRecording(false);
    };

    recognition.onend = () => {
      // Descarta prévia não confirmada para não deixar texto "fantasma".
      if (interimTextRef.current) {
        interimTextRef.current = '';
        setInput(committedTextRef.current);
      }
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    // StrictMode monta/desmonta duas vezes: sem o abort, a instância descartada
    // continuaria viva e poderia emitir resultados em duplicidade.
    return () => {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      } catch {
        // Instância já encerrada — nada a fazer.
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggleVoiceRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setRecordingError('Seu navegador não possui suporte ao microfone Web Speech.');
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
      return;
    }

    try {
      setRecordingError(null);
      // Preserva o que já estava no campo: a fala é anexada ao texto existente.
      committedTextRef.current = input.trim();
      interimTextRef.current = '';
      recognition.start();
      setIsRecording(true);
    } catch (err: any) {
      // `start()` lança se já estiver ativo — não é falha real.
      if (err?.name === 'InvalidStateError') return;
      console.error('Error starting speech recognition:', err);
      setRecordingError('Não foi possível iniciar a gravação.');
    }
  }, [isRecording, input]);

  const sendMessage = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend || input).trim();
      if (!text || isGenerating) return;

      const userMsgId = `msg-user-${Date.now()}`;
      const userMessage: AiChatMessage = {
        id: userMsgId,
        role: 'user',
        text,
        categoryTag: contextTag ? `≡ ${contextTag}` : undefined,
        timestamp: new Date().toISOString(),
      };

      // Adiciona mensagem do usuário e limpa o campo
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsGenerating(true);
      setGeneratingStatus('Consultando dados do ERP...');

      try {
        // Histórico recente para contexto
        const history = messages.slice(-6).map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const response: any = await apiPost('/ai/chat', {
          message: text,
          history,
          model: selectedModel,
          contextTag,
          conversationId: conversationId || undefined,
        });

        // O backend devolve a conversa usada (nova ou continuada) — guardamos
        // para que a próxima mensagem entre na mesma.
        if (response.conversationId && response.conversationId !== conversationId) {
          setConversationId(response.conversationId);
        }

        const aiMsgId = `msg-ai-${Date.now()}`;
        const aiMessage: AiChatMessage = {
          id: aiMsgId,
          role: 'model',
          text: response.text,
          thought: response.thought,
          toolsUsed: response.toolsUsed,
          resultsSummary: response.resultsSummary,
          modelUsed: response.modelUsed || selectedModel,
          usedFallback: response.usedFallback === true,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, aiMessage]);

        // A ação pedida pela IA é aplicada DEPOIS de a mensagem entrar na tela,
        // para que o operador veja a confirmação junto com a mudança visual.
        if (response.clientAction) {
          applyClientAction(response.clientAction);
        }

        // A lista lateral reflete o título novo (gerado na 1ª mensagem).
        void refreshConversations();
      } catch (err: any) {
        console.error('Error communicating with AI Copilot:', err);
        const serverMessage =
          err?.response?.data?.message || err?.response?.data?.error;
        const detail = Array.isArray(serverMessage)
          ? serverMessage.join(' ')
          : serverMessage;
        const errorMsgId = `msg-error-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: errorMsgId,
            role: 'model',
            text: detail
              ? `Não foi possível concluir a consulta ao Copiloto. Detalhe: ${detail}`
              : 'Desculpe, ocorreu um erro ao consultar o Copiloto de IA. Verifique sua conexão e tente novamente.',
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsGenerating(false);
      }
    },
    [input, isGenerating, messages, selectedModel, contextTag, applyClientAction, conversationId, refreshConversations],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    input,
    setInput,
    selectedModel,
    setSelectedModel,
    isGenerating,
    generatingStatus,
    contextTag,
    setContextTag,
    isRecording,
    recordingError,
    toggleVoiceRecording,
    sendMessage,
    clearChat,
    applyClientAction,
    // Histórico de conversas
    conversationId,
    conversations,
    isLoadingConversations,
    openConversation,
    startNewConversation,
    renameConversation,
    togglePinConversation,
    deleteConversation,
    clearAllConversations,
    refreshConversations,
  };
}
