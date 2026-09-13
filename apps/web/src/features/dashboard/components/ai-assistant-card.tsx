import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, BrainCircuit, Maximize2, Mic, MicOff, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SUGGESTIONS = ['Lucro', 'Retenção', 'Produto líder'];

function getAnswer(prompt: string) {
  const query = prompt.toLowerCase();
  if (query.includes('lucro') || query.includes('faturamento') || query.includes('dinheiro')) {
    return 'O lucro total acumulado é de R$ 446.700 (+24,4%), com forte tração no segmento de varejistas.';
  }
  if (query.includes('dia') || query.includes('moviment') || query.includes('pico')) {
    return 'Terça-feira é o dia mais ativo, com 8.162 acessos e pico de conversão às 14h.';
  }
  if (query.includes('retenção') || query.includes('recorren') || query.includes('meta')) {
    return 'A retenção atual é de 68%. Faltam 12 pontos percentuais para a meta anual de 80%.';
  }
  if (query.includes('produto') || query.includes('mais vendido')) {
    return 'O produto líder é o Hybrid Active Noise Cancelling Headphones, com 2.310 unidades e R$ 124.839 em receita.';
  }
  return `A análise de “${prompt}” indica crescimento contínuo de 15,5% em visualizações e saúde financeira robusta.`;
}

export const AiAssistantCard: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const ask = (value: string) => {
    const trimmedPrompt = value.trim();
    if (!trimmedPrompt || isThinking) return;

    setIsThinking(true);
    window.setTimeout(() => {
      setLastResponse(getAnswer(trimmedPrompt));
      setPrompt('');
      setIsThinking(false);
    }, 550);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    ask(prompt);
  };

  const toggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Seu navegador não suporta reconhecimento de voz');
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt((current) => (current ? `${current} ${transcript}` : transcript));
      setIsRecording(false);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      toast.error('Não foi possível capturar o áudio');
    };
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  return (
    <>
      <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-elevated">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-2">
            <p className="dashboard-kicker">Copilot de métricas</p>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Assistente de IA</h3>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Pergunte sobre os sinais mais importantes do seu negócio.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(true)}
            aria-label="Expandir assistente"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col justify-between pt-0">
          <div className="relative flex min-h-[132px] items-center justify-center overflow-hidden rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)/0.07),transparent_60%)]" />
            <div className="absolute h-28 w-28 rounded-full bg-sky-300/40 blur-3xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 shadow-[0_12px_36px_-12px_rgba(14,165,233,0.6)] transition-transform duration-300 hover:scale-105">
              <BrainCircuit className="h-7 w-7 text-white" strokeWidth={1.5} />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] font-medium text-sky-700">
              <Sparkles className="h-3 w-3" />
              Insights prontos para explorar
            </div>
          </div>

          {lastResponse && (
            <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-relaxed text-sky-900 animate-in fade-in-0 slide-in-from-bottom-1">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-sky-700">
                <Sparkles className="h-3 w-3" />
                Leitura rápida
              </div>
              {lastResponse}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                disabled={isThinking}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:pointer-events-none disabled:opacity-50"
              >
                <Sparkles className="h-2.5 w-2.5" />
                {suggestion}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="relative mt-3">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={isThinking}
              placeholder={isThinking ? 'Analisando métricas...' : 'Pergunte qualquer coisa...'}
              className="h-10 w-full rounded-lg border border-input bg-white pl-9 pr-20 text-xs text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 disabled:opacity-70"
              aria-label="Perguntar ao assistente de IA"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              <button
                type="button"
                onClick={toggleVoice}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  isRecording
                    ? 'text-rose-500 bg-rose-50 hover:bg-rose-100'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
                title={isRecording ? 'Parar gravação' : 'Entrada de voz'}
                aria-label={isRecording ? 'Parar gravação de voz' : 'Iniciar gravação de voz'}
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button
                type="submit"
                disabled={isThinking || !prompt.trim()}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-white shadow-sm shadow-sky-600/30 transition-colors hover:bg-sky-500 disabled:pointer-events-none disabled:opacity-40',
                )}
                aria-label="Enviar pergunta"
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isExpanded && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 animate-in fade-in-0"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              className="absolute right-3 top-3 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 flex items-center justify-center shadow-sm">
                <BrainCircuit className="h-5 w-5 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Assistente de IA · Modo Expandido</h3>
                <p className="text-[11px] text-muted-foreground">
                  Converse em detalhes com o copilot de métricas.
                </p>
              </div>
            </div>
            <div className="min-h-[200px] max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-secondary/30 p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {lastResponse || 'Olá! Faça uma pergunta sobre suas métricas, vendas, retenção ou produtos para começar.'}
            </div>
            <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={isThinking}
                placeholder={isThinking ? 'Analisando métricas...' : 'Pergunte qualquer coisa...'}
                className="flex-1 h-11 rounded-xl border border-input bg-white px-4 text-sm shadow-sm focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 disabled:opacity-70"
              />
              <Button type="submit" disabled={isThinking || !prompt.trim()}>
                {isThinking ? 'Analisando...' : 'Enviar'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
