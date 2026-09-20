import React, { useState } from 'react';
import { Sparkles, X, MessageSquare, Bot, History } from 'lucide-react';
import { useAiChat } from '../hooks/use-ai-chat';
import { AiChatHeader } from './ai-chat-header';
import { AiMessageList } from './ai-message-list';
import { AiInputCard } from './ai-input-card';
import { GeminiLogo } from './gemini-logo';
import { AiChatHistoryPanel } from './ai-chat-history-panel';

interface AiCopilotDrawerProps {
  tenantName?: string;
  niche?: string;
  scope?: 'TENANT' | 'GLOBAL';
  userName?: string;
  userAvatar?: string;
}

export const AiCopilotDrawer: React.FC<AiCopilotDrawerProps> = ({
  tenantName = 'Restaurante do Gordo',
  niche = 'RESTAURANT',
  scope = 'TENANT',
  userName = 'Carlos roberto',
  userAvatar,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const {
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
    toggleVoiceRecording,
    sendMessage,
    clearChat,
    // Histórico de conversas
    conversationId,
    conversations,
    isLoadingConversations,
    openConversation,
    startNewConversation,
    renameConversation,
    togglePinConversation,
    deleteConversation,
  } = useAiChat({ tenantName, userName, niche, scope });

  const [showHistory, setShowHistory] = useState(false);

  return (
    <>
      {/* ─── 1. Botão Flutuante (FAB) no Canto Inferior Direito ─── */}
      {!isOpen && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2.5 px-4 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white shadow-xl hover:shadow-2xl transition-all cursor-pointer group border border-zinc-700/60"
          >
            <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <GeminiLogo className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
            </div>
            <span className="text-xs font-bold tracking-tight">Copiloto IA</span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>
        </div>
      )}

      {/* ─── 2. Painel Flutuante (Drawer) idêntico à imagem de referência ─── */}
      {isOpen && (
        <div
          className={`fixed z-50 flex flex-col bg-white border border-zinc-200/90 rounded-[28px] sm:rounded-[32px] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.22)] overflow-hidden transition-all duration-300 ease-out ${
            isExpanded
              ? 'inset-3 sm:inset-6 md:inset-10 w-auto h-auto max-w-[960px] mx-auto'
              : 'bottom-2 sm:bottom-6 right-2 sm:right-6 left-2 sm:left-auto w-auto sm:w-[500px] md:w-[540px] h-[94vh] sm:h-[720px] max-h-[94vh]'
          }`}
        >
          {/* Header */}
          <AiChatHeader
            chatTitle="Novo chat de IA"
            scopeBadge={scope === 'GLOBAL' ? 'SuperAdmin' : tenantName}
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded(!isExpanded)}
            onNewChat={clearChat}
            onClose={() => setIsOpen(false)}
          />

          {/* Botão do histórico — fica acima das mensagens para não competir
              com o campo de digitação, que é o foco principal. */}
          <div className="px-4 pt-3 flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                showHistory
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? 'Voltar ao chat' : `Histórico${conversations.length ? ` (${conversations.length})` : ''}`}
            </button>

            {conversationId && !showHistory && (
              <span className="text-[10px] text-zinc-400 font-bold truncate">
                Conversa salva
              </span>
            )}
          </div>

          {showHistory ? (
            <div className="flex-1 min-h-0">
              <AiChatHistoryPanel
                conversations={conversations}
                isLoading={isLoadingConversations}
                activeId={conversationId}
                onOpen={openConversation}
                onNew={startNewConversation}
                onTogglePin={togglePinConversation}
                onRename={renameConversation}
                onDelete={deleteConversation}
                onClose={() => setShowHistory(false)}
              />
            </div>
          ) : (
            <>
              {/* Área de Mensagens */}
              <AiMessageList
                messages={messages}
                isGenerating={isGenerating}
                generatingStatus={generatingStatus}
                userName={userName}
                userAvatar={userAvatar}
              />

              {/* Barra de Entrada Flutuante (Input Card) */}
              <AiInputCard
                input={input}
                setInput={setInput}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                isGenerating={isGenerating}
                contextTag={contextTag}
                onClearContextTag={() => setContextTag(null)}
                isRecording={isRecording}
                onToggleVoiceRecording={toggleVoiceRecording}
                onSend={() => sendMessage()}
                onSelectPromptSuggestion={(prompt) => sendMessage(prompt)}
              />
            </>
          )}
        </div>
      )}
    </>
  );
};
