import React from 'react';
import {
  ChevronDown,
  Lock,
  PenSquare,
  Maximize2,
  Minimize2,
  Share2,
  MoreHorizontal,
  X,
  Trash2,
  Copy,
  Sparkles,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AiChatHeaderProps {
  chatTitle?: string;
  scopeBadge?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onNewChat: () => void;
  onClose: () => void;
}

export const AiChatHeader: React.FC<AiChatHeaderProps> = ({
  chatTitle = 'Novo chat de IA',
  scopeBadge = 'Privado',
  isExpanded,
  onToggleExpand,
  onNewChat,
  onClose,
}) => {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-white select-none shrink-0">
      {/* ─── Lado Esquerdo: Seletor de Chat & Badge de Privacidade ─── */}
      <div className="flex items-center gap-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900 hover:text-zinc-700 transition-colors cursor-pointer outline-none group"
            >
              <span>{chatTitle}</span>
              <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 transition-transform" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 rounded-2xl shadow-xl p-1.5">
            <DropdownMenuLabel className="text-xs text-zinc-400 font-medium px-2 py-1">
              Sessões do Copiloto
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={onNewChat}
              className="flex items-center gap-2 text-xs font-semibold cursor-pointer rounded-xl px-2.5 py-2"
            >
              <PenSquare className="w-3.5 h-3.5 text-zinc-500" />
              <span>Criar nova conversa</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[11px] text-zinc-400">
              Conectado ao Gemini & ERP (Tempo Real)
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Badge "🔒 Privado" idêntico à imagem de referência */}
        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200/60 text-[11px] font-medium text-zinc-600 shadow-2xs">
          <Lock className="w-3 h-3 text-zinc-400" />
          <span>{scopeBadge}</span>
        </div>
      </div>

      {/* ─── Lado Direito: Ações (Novo, Tela Cheia, Compartilhar, Opções, Fechar) ─── */}
      <div className="flex items-center gap-1.5">
        {/* Botão Novo Chat */}
        <button
          type="button"
          onClick={onNewChat}
          title="Nova conversa"
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
        >
          <PenSquare className="w-4 h-4" />
        </button>

        {/* Botão Maximizar / Reduzir */}
        <button
          type="button"
          onClick={onToggleExpand}
          title={isExpanded ? 'Reduzir painel' : 'Expandir painel'}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer hidden sm:flex"
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Pílula "Compartilhar" */}
        <button
          type="button"
          onClick={() => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(window.location.href);
              alert('Link do contexto copiado para a área de transferência!');
            }
          }}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition-colors cursor-pointer"
        >
          <span>Compartilhar</span>
        </button>

        {/* Menu de Mais Opções */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-2xl shadow-xl p-1.5">
            <DropdownMenuItem
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="flex items-center gap-2 text-xs font-medium cursor-pointer rounded-xl px-2 py-1.5"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>Copiar link</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onNewChat}
              className="flex items-center gap-2 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer rounded-xl px-2 py-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar conversa</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Botão Fechar Circular */}
        <button
          type="button"
          onClick={onClose}
          title="Fechar Copiloto"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-100/80 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer ml-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
