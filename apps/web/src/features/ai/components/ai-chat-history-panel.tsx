import React, { useMemo, useState } from 'react';
import { MessageSquarePlus, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import type { AiConversationSummary } from '../types/ai-chat.types';

/**
 * Lista lateral do histórico do Copiloto.
 *
 * Mostra as conversas salvas, permite reabrir, fixar, renomear e excluir.
 * A busca é feita no cliente: a lista já vem limitada a 60 itens, então
 * filtrar aqui evita uma ida ao servidor a cada tecla.
 */
interface AiChatHistoryPanelProps {
  conversations: AiConversationSummary[];
  isLoading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onTogglePin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Agrupa por Hoje / Ontem / Mais antigas. */
function groupByDate(items: AiConversationSummary[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const groups: Array<{ label: string; items: AiConversationSummary[] }> = [
    { label: 'Hoje', items: [] },
    { label: 'Ontem', items: [] },
    { label: 'Mais antigas', items: [] },
  ];

  for (const item of items) {
    const when = new Date(item.updatedAt);
    if (when >= today) groups[0].items.push(item);
    else if (when >= yesterday) groups[1].items.push(item);
    else groups[2].items.push(item);
  }

  return groups.filter((g) => g.items.length > 0);
}

export const AiChatHistoryPanel: React.FC<AiChatHistoryPanelProps> = ({
  conversations,
  isLoading,
  activeId,
  onOpen,
  onNew,
  onTogglePin,
  onRename,
  onDelete,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3">
        <button
          type="button"
          onClick={() => {
            onNew();
            onClose();
          }}
          className="w-full h-11 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Nova conversa
        </button>

        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {isLoading && conversations.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-6">Carregando histórico...</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-6">
            {query ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa salva ainda.'}
          </p>
        )}

        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 px-2">
              {group.label}
            </p>

            {group.items.map((item) => {
              const isActive = item.id === activeId;

              if (renamingId === item.id) {
                return (
                  <form
                    key={item.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      onRename(item.id, renameValue);
                      setRenamingId(null);
                    }}
                    className="px-2 py-1.5"
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => setRenamingId(null)}
                      className="w-full h-9 px-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs outline-none"
                    />
                  </form>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`group flex items-center gap-1 rounded-xl px-2 py-2 transition ${
                    isActive
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(item.id);
                      onClose();
                    }}
                    onDoubleClick={() => {
                      setRenamingId(item.id);
                      setRenameValue(item.title);
                    }}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                    title={item.title}
                  >
                    <span className="block text-xs font-bold text-zinc-900 dark:text-white truncate">
                      {item.pinned && <Pin className="w-3 h-3 inline mr-1 text-amber-600" />}
                      {item.title}
                    </span>
                    <span className="block text-[10px] text-zinc-400 mt-0.5">
                      {item.messageCount} mensagem(ns)
                    </span>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => onTogglePin(item.id)}
                      aria-label={item.pinned ? 'Desafixar' : 'Fixar'}
                      className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      {item.pinned ? (
                        <PinOff className="w-3.5 h-3.5 text-zinc-500" />
                      ) : (
                        <Pin className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      aria-label="Excluir conversa"
                      className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Confirmação de exclusão — apagar histórico não pode ser um toque só */}
      {confirmDeleteId && (
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-rose-50 dark:bg-rose-500/10 space-y-2">
          <p className="text-xs font-bold text-rose-900 dark:text-rose-300">
            Excluir esta conversa? Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="flex-1 h-10 rounded-xl border border-zinc-300 dark:border-zinc-600 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
            >
              Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiChatHistoryPanel;
