import React, { useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Wand2,
  MoreHorizontal,
  Mic,
  MicOff,
  ArrowUp,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GEMINI_MODELS, GeminiModelId } from '../types/ai-chat.types';
import { GeminiLogo } from './gemini-logo';

interface AiInputCardProps {
  input: string;
  setInput: (val: string) => void;
  selectedModel: GeminiModelId;
  setSelectedModel: (model: GeminiModelId) => void;
  isGenerating: boolean;
  contextTag: string | null;
  onClearContextTag: () => void;
  isRecording: boolean;
  onToggleVoiceRecording: () => void;
  onSend: () => void;
  onSelectPromptSuggestion?: (prompt: string) => void;
}

export const AiInputCard: React.FC<AiInputCardProps> = ({
  input,
  setInput,
  selectedModel,
  setSelectedModel,
  isGenerating,
  contextTag,
  onClearContextTag,
  isRecording,
  onToggleVoiceRecording,
  onSend,
  onSelectPromptSuggestion,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize do textarea conforme o usuário digita
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isGenerating) {
        onSend();
      }
    }
  };

  const currentModelInfo = GEMINI_MODELS.find((m) => m.id === selectedModel) || GEMINI_MODELS[0];

  return (
    <div className="px-6 pb-4 pt-1 bg-white shrink-0">
      {/* ─── Card Flutuante de Entrada idêntico à imagem de referência ─── */}
      <div className="rounded-[24px] border border-zinc-200/90 bg-white p-3 shadow-sm focus-within:border-zinc-300 focus-within:shadow-md transition-all">
        {/* Tag Superior Interna com Borda Pontilhada/Tracejada: 👤 Carlos roberto (Restaurante do Gordo) ✕ */}
        {contextTag && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-50/90 border border-dashed border-zinc-300 text-xs font-medium text-zinc-700 w-fit mb-2 shadow-2xs">
            <span className="text-zinc-500 text-xs">👤</span>
            <span>{contextTag}</span>
            <button
              type="button"
              onClick={onClearContextTag}
              className="w-4 h-4 rounded-full hover:bg-zinc-200 flex items-center justify-center text-zinc-400 hover:text-zinc-700 cursor-pointer ml-0.5"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        {/* Campo de Texto Principal */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte qualquer coisa para a IA..."
          rows={1}
          className="w-full text-[14px] text-zinc-900 placeholder:text-zinc-400 bg-transparent outline-none resize-none px-1 leading-relaxed max-h-[120px]"
        />

        {/* ─── Barra de Ferramentas Inferior ─── */}
        <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-100/60">
          {/* Lado Esquerdo da Barra: +, Seletor de Modelo Gemini Oficial, Busca, Varinha, Opções */}
          <div className="flex items-center gap-1">
            {/* Botão + (Adicionar anexo/contexto) */}
            <button
              type="button"
              onClick={() => {
                alert('Anexos de arquivos e fotos de pratos suportados.');
              }}
              title="Adicionar arquivo ou contexto"
              className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Pílula Seletora de Modelo Gemini com Logo Oficial Colorido */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200/90 bg-zinc-50/80 hover:bg-zinc-100 text-xs font-semibold text-zinc-800 transition-colors cursor-pointer outline-none group"
                >
                  <GeminiLogo className="w-3.5 h-3.5" />
                  <span>{currentModelInfo.shortLabel}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-50 text-purple-600 font-bold border border-purple-100/80">
                    {currentModelInfo.badge}
                  </span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 rounded-2xl shadow-xl p-1.5">
                <DropdownMenuLabel className="text-xs text-zinc-400 font-medium px-2 py-1">
                  Selecione o Modelo Gemini
                </DropdownMenuLabel>
                {GEMINI_MODELS.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className="flex flex-col items-start gap-1 p-2.5 rounded-xl cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-zinc-900">
                        <GeminiLogo className="w-3.5 h-3.5" />
                        <span>{model.label}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-purple-50 text-purple-600 font-bold">
                          {model.badge}
                        </span>
                      </div>
                      {selectedModel === model.id && (
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-normal leading-tight">
                      {model.description}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Ícone de Busca */}
            <button
              type="button"
              title="Pesquisar nos dados do ERP"
              onClick={() => {
                setInput('Consultar estoque e produtos: ');
                textareaRef.current?.focus();
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* Varinha Mágica (Prompts Rápidos) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Ações Rápidas & Prompts"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 rounded-2xl shadow-xl p-1.5">
                <DropdownMenuLabel className="text-xs text-zinc-400 font-medium px-2 py-1">
                  Perguntas Frequentes
                </DropdownMenuLabel>
                {[
                  'Como está o salão e as mesas agora?',
                  'Qual o resumo de vendas de hoje?',
                  'Quais pratos temos no cardápio?',
                  'Tem algum produto com estoque crítico?',
                ].map((promptText, idx) => (
                  <DropdownMenuItem
                    key={idx}
                    onClick={() => {
                      if (onSelectPromptSuggestion) {
                        onSelectPromptSuggestion(promptText);
                      } else {
                        setInput(promptText);
                        textareaRef.current?.focus();
                      }
                    }}
                    className="text-xs font-medium cursor-pointer rounded-xl px-2.5 py-1.5"
                  >
                    {promptText}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Botão Mais Opções */}
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Lado Direito da Barra: Microfone de Voz / Ondas Sonoras e Botão Circular de Envio ↑ */}
          <div className="flex items-center gap-2">
            {/* Botão de Áudio / Ondas Sonoras de Voz */}
            <button
              type="button"
              onClick={onToggleVoiceRecording}
              title={isRecording ? 'Parar gravação' : 'Falar por voz'}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse shadow-md'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              {isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <div className="flex items-center gap-[2px] h-3.5 px-0.5">
                  <span className="w-[2px] h-2 rounded-full bg-zinc-500" />
                  <span className="w-[2px] h-3.5 rounded-full bg-zinc-600" />
                  <span className="w-[2px] h-2.5 rounded-full bg-zinc-500" />
                  <span className="w-[2px] h-1.5 rounded-full bg-zinc-400" />
                </div>
              )}
            </button>

            {/* Botão Circular de Enviar com Seta para Cima (Azul Oficial) idêntico à imagem */}
            <button
              type="button"
              disabled={!input.trim() || isGenerating}
              onClick={onSend}
              title="Enviar mensagem"
              className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Legenda / Disclaimer no Rodapé idêntico à referência ─── */}
      <div className="text-center text-[11px] text-zinc-400 mt-2 font-normal">
        A IA pode cometer erros. Considere verificar informações importantes.
      </div>
    </div>
  );
};
