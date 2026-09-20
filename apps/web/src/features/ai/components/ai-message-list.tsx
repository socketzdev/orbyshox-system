import React, { useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Eye,
  FileText,
  UtensilsCrossed,
  Package,
  Receipt,
  LayoutGrid,
  CalendarDays,
  Users,
  Wrench,
  Wallet,
  ArrowDown,
  Sparkles,
  Loader2,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  RotateCcw,
} from "lucide-react";
import { AiChatMessage } from "../types/ai-chat.types";

interface AiMessageListProps {
  messages: AiChatMessage[];
  isGenerating: boolean;
  generatingStatus?: string;
  userName?: string;
  userAvatar?: string;
}

export const AiMessageList: React.FC<AiMessageListProps> = ({
  messages,
  isGenerating,
  generatingStatus = "Gerando resposta...",
  userName = "Carlos",
  userAvatar,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [openThoughts, setOpenThoughts] = useState<Record<string, boolean>>({});
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [likedMsgs, setLikedMsgs] = useState<Record<string, boolean>>({});
  const [dislikedMsgs, setDislikedMsgs] = useState<Record<string, boolean>>({});
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Cancela síntese de voz se desmontar
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Auto-scroll ao receber nova mensagem
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  // Monitora scroll para exibir botão flutuante de descer
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const toggleThought = (msgId: string) => {
    setOpenThoughts((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleCopy = (msgId: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  const toggleLike = (msgId: string) => {
    setLikedMsgs((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
    setDislikedMsgs((prev) => ({ ...prev, [msgId]: false }));
  };

  const toggleDislike = (msgId: string) => {
    setDislikedMsgs((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
    setLikedMsgs((prev) => ({ ...prev, [msgId]: false }));
  };

  const toggleSpeech = (msgId: string, text: string) => {
    if (!("speechSynthesis" in window)) {
      alert("Seu navegador não possui sintetizador de áudio.");
      return;
    }

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    } else {
      window.speechSynthesis.cancel();
      const cleanText = text
        .replace(/[#*`_~]/g, "")
        .replace(/\[\d+\]\s*🔗/g, "")
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "pt-BR";
      utterance.rate = 1.05;
      utterance.onend = () => setSpeakingMsgId(null);
      utterance.onerror = () => setSpeakingMsgId(null);

      setSpeakingMsgId(msgId);
      window.speechSynthesis.speak(utterance);
    }
  };

  const renderResultIcon = (icon?: string) => {
    switch (icon) {
      case "utensils":
        return <UtensilsCrossed className="w-4 h-4 text-amber-500" />;
      case "package":
        return <Package className="w-4 h-4 text-emerald-500" />;
      case "receipt":
        return <Receipt className="w-4 h-4 text-indigo-500" />;
      case "table":
        return <LayoutGrid className="w-4 h-4 text-sky-500" />;
      case "calendar":
        return <CalendarDays className="w-4 h-4 text-blue-500" />;
      case "users":
        return <Users className="w-4 h-4 text-orange-500" />;
      case "wrench":
        return <Wrench className="w-4 h-4 text-sky-600" />;
      case "wallet":
        return <Wallet className="w-4 h-4 text-emerald-600" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scroll-smooth relative"
    >
      {messages.length === 0 && !isGenerating && (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-sm font-bold text-zinc-900">
            Como posso ajudar você agora?
          </h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-[260px]">
            Peça ações ou consultas sobre o seu negócio por texto ou voz.
          </p>
        </div>
      )}

      {messages.map((msg) => {
        const isUser = msg.role === "user";

        if (isUser) {
          return (
            <div key={msg.id} className="flex flex-col items-end w-full group">
              {/* Tag de contexto lilás superior idêntica à referência: "≡ Onboarding Demos" */}
              {msg.categoryTag && (
                <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-50 border border-purple-100/80 text-[11px] font-semibold text-purple-700 shadow-2xs mb-1.5 mr-9">
                  <span>{msg.categoryTag}</span>
                </div>
              )}

              {/* Linha da mensagem do usuário com avatar à direita */}
              <div className="flex items-end gap-2 max-w-[88%]">
                <div className="px-4 py-2.5 rounded-[22px] rounded-br-[6px] bg-zinc-100 text-zinc-900 text-[14px] font-medium leading-relaxed tracking-tight shadow-2xs">
                  {msg.text}
                </div>

                {/* Avatar circular do usuário */}
                <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ring-2 ring-white">
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    userName.charAt(0).toUpperCase()
                  )}
                </div>
              </div>
            </div>
          );
        }

        // Mensagem da IA
        const isThoughtOpen = !!openThoughts[msg.id];

        return (
          <div
            key={msg.id}
            className="flex flex-col items-start w-full space-y-2.5 animate-in fade-in duration-200"
          >
            {/* ─── 1. Bloco de Raciocínio (Thought >) idêntico à imagem ─── */}
            {msg.thought && (
              <div className="w-full max-w-[95%]">
                <button
                  type="button"
                  onClick={() => toggleThought(msg.id)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer py-1 group select-none"
                >
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Thought</span>
                  </span>
                  {isThoughtOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-transform" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-transform" />
                  )}
                </button>

                {isThoughtOpen && (
                  <div className="mt-1.5 p-3 rounded-2xl bg-zinc-50/80 border border-zinc-200/70 text-xs text-zinc-600 leading-relaxed font-mono whitespace-pre-wrap animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                    {msg.thought}
                  </div>
                )}
              </div>
            )}

            {/* ─── 2. Badges de Ferramentas / Contexto Visualizado (Viewed ...) ─── */}
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {msg.toolsUsed.map((tool, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100/90 border border-zinc-200/80 text-[11px] font-medium text-zinc-700 shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-zinc-500">Viewed</span>
                    <span className="font-semibold text-zinc-800">
                      {tool.name.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ─── 3. Corpo Principal da Resposta da IA (Markdown Estruturado) ─── */}
            <div className="w-full text-zinc-800 text-[14px] leading-relaxed tracking-tight space-y-3">
              {/* Renderização limpa de tópicos */}
              {msg.text.split("\n\n").map((paragraph, pIdx) => {
                if (paragraph.startsWith("### ")) {
                  return (
                    <h3
                      key={pIdx}
                      className="text-[15px] font-bold text-zinc-900 mt-2"
                    >
                      {paragraph.replace("### ", "")}
                    </h3>
                  );
                }
                if (paragraph.startsWith("## ")) {
                  return (
                    <h2
                      key={pIdx}
                      className="text-[16px] font-bold text-zinc-950 mt-3"
                    >
                      {paragraph.replace("## ", "")}
                    </h2>
                  );
                }
                if (paragraph.startsWith("- ") || paragraph.startsWith("* ")) {
                  const items = paragraph.split("\n");
                  return (
                    <ul key={pIdx} className="space-y-1.5 my-2">
                      {items.map((item, iIdx) => {
                        const cleanText = item.replace(/^[-*]\s+/, "");
                        return (
                          <li
                            key={iIdx}
                            className="flex items-start gap-2 text-[13.5px] text-zinc-700"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 mt-2 shrink-0" />
                            <span>
                              {cleanText
                                .split(/(\*\*.*?\*\*)/)
                                .map((chunk, cIdx) => {
                                  if (
                                    chunk.startsWith("**") &&
                                    chunk.endsWith("**")
                                  ) {
                                    return (
                                      <strong
                                        key={cIdx}
                                        className="font-bold text-zinc-900"
                                      >
                                        {chunk.slice(2, -2)}
                                      </strong>
                                    );
                                  }
                                  return chunk;
                                })}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                }
                return (
                  <p key={pIdx} className="text-zinc-800">
                    {paragraph.split(/(\*\*.*?\*\*)/).map((chunk, cIdx) => {
                      if (chunk.startsWith("**") && chunk.endsWith("**")) {
                        return (
                          <strong
                            key={cIdx}
                            className="font-bold text-zinc-900"
                          >
                            {chunk.slice(2, -2)}
                          </strong>
                        );
                      }
                      return chunk;
                    })}
                  </p>
                );
              })}
            </div>

            {/* ─── 4. Cartão de Resultados Agregados (ex: "12 results") idêntico à imagem ─── */}
            {msg.resultsSummary && (
              <div className="w-full mt-2 pt-2 border-t border-zinc-100">
                <div className="text-[11px] font-semibold text-zinc-400 mb-2">
                  {msg.resultsSummary.total}{" "}
                  {msg.resultsSummary.total === 1 ? "resultado" : "resultados"}
                </div>

                <div className="space-y-1.5">
                  {msg.resultsSummary.items.map((item, rIdx) => (
                    <div
                      key={rIdx}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-zinc-200/80 bg-white hover:bg-zinc-50/80 transition-colors shadow-2xs"
                    >
                      <div className="w-7 h-7 rounded-lg bg-zinc-50 border border-zinc-200/60 flex items-center justify-center shrink-0">
                        {renderResultIcon(item.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 truncate">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-[11px] text-zinc-500 truncate">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── 5. Barra de Ações da Mensagem da IA idêntica à imagem de referência ─── */}
            <div className="flex items-center gap-1 mt-3 pt-2 text-zinc-400 w-full">
              {/* Copiar */}
              <button
                type="button"
                onClick={() => handleCopy(msg.id, msg.text)}
                title="Copiar resposta"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-zinc-100 hover:text-zinc-700 text-xs font-medium transition-colors cursor-pointer"
              >
                {copiedMsgId === msg.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">
                      Copiado
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>

              {/* Gostei */}
              <button
                type="button"
                onClick={() => toggleLike(msg.id)}
                title="Gostei da resposta"
                className={`p-1.5 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer ${
                  likedMsgs[msg.id]
                    ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                    : "hover:text-zinc-700"
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>

              {/* Não gostei */}
              <button
                type="button"
                onClick={() => toggleDislike(msg.id)}
                title="Não gostei"
                className={`p-1.5 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer ${
                  dislikedMsgs[msg.id]
                    ? "text-red-600 bg-red-50 hover:bg-red-100"
                    : "hover:text-zinc-700"
                }`}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>

              {/* Ouvir via Síntese de Voz (TTS) em Português */}
              <button
                type="button"
                onClick={() => toggleSpeech(msg.id, msg.text)}
                title={
                  speakingMsgId === msg.id ? "Parar leitura" : "Ouvir resposta"
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-zinc-100 text-xs font-medium transition-colors cursor-pointer ${
                  speakingMsgId === msg.id
                    ? "text-blue-600 bg-blue-50 hover:bg-blue-100 animate-pulse"
                    : "hover:text-zinc-700"
                }`}
              >
                {speakingMsgId === msg.id ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>Parar</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Ouvir</span>
                  </>
                )}
              </button>

              {/* Desfazer */}
              <button
                type="button"
                onClick={() => {
                  alert("Ação desfeita com sucesso no sistema.");
                }}
                title="Desfazer alteração"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-zinc-100 hover:text-zinc-700 text-xs font-medium transition-colors cursor-pointer ml-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Desfazer</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>
            </div>
          </div>
        );
      })}

      {/* ─── Estado de Carregamento / Gerando Resposta com Pulso ─── */}
      {isGenerating && (
        <div className="flex flex-col items-start w-full space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            <span>{generatingStatus}</span>
          </div>
        </div>
      )}

      {/* ─── Botão Flutuante de Scroll para o Fim ─── */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="sticky bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow-md flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-all cursor-pointer z-10"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
