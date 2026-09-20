import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ToolDefinition } from "./ai-tools.service";
import { formatToolsForGemini } from "./ai-tool-schema";

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
  thoughtSignature?: string;
}

export interface GeminiMessage {
  role: "user" | "model" | "function";
  text?: string;
  name?: string;
  response?: any;
  functionCalls?: GeminiFunctionCall[];
}

export interface GeminiResponse {
  text: string;
  thought?: string;
  functionCalls?: GeminiFunctionCall[];
  modelUsed: string;
  /** Motivo de bloqueio do filtro de segurança, quando houver. */
  blocked?: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string | null {
    return (
      this.configService.get<string>("GEMINI_API_KEY") ||
      process.env.GEMINI_API_KEY ||
      null
    );
  }

  private getDefaultModel(): string {
    return (
      this.configService.get<string>("GEMINI_MODEL") ||
      process.env.GEMINI_MODEL ||
      "gemini-3.1-flash-lite"
    );
  }

  /** Nome do modelo padrão configurado (para respostas de erro da camada superior). */
  defaultModelName(): string {
    return this.getDefaultModel();
  }

  /**
   * Converte ferramentas para o formato oficial do Gemini Function Calling.
   * A lógica vive em `ai-tool-schema.ts` (pura e testada) — ver o comentário
   * lá sobre por que um `array` sem `items` derruba o Copiloto inteiro.
   */
  private formatToolsForGemini(tools: ToolDefinition[]) {
    return formatToolsForGemini(tools);
  }

  /**
   * Converte as mensagens internas para o formato de contents do Gemini
   */
  private formatMessages(messages: GeminiMessage[]): any[] {
    return messages.map((m) => {
      if (m.role === "function") {
        return {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: m.name || "tool_response",
                response: m.response ?? {},
              },
            },
          ],
        };
      }

      if (m.role === "model" && m.functionCalls && m.functionCalls.length > 0) {
        return {
          role: "model",
          parts: m.functionCalls.map((fc) => ({
            functionCall: { name: fc.name, args: fc.args || {} },
            ...(fc.thoughtSignature
              ? { thoughtSignature: fc.thoughtSignature }
              : {}),
          })),
        };
      }

      return {
        role: m.role === "model" ? "model" : "user",
        parts: [{ text: m.text || "" }],
      };
    });
  }

  private static readonly RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

  /** Modelos alternativos acionados quando o primário está indisponível. */
  private getFallbackModels(): string[] {
    const configured = this.configService.get<string>("GEMINI_FALLBACK_MODELS");
    const list = configured
      ? configured
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean)
      : ["gemini-2.5-flash", "gemini-flash-latest"];
    const primary = this.getDefaultModel();
    return list.filter((m) => m !== primary);
  }

  private async callModel(
    model: string,
    apiKey: string,
    body: any,
  ): Promise<{ json: any; modelUsed: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const maxAttempts = 3;

    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          return { json: await res.json(), modelUsed: model };
        }

        const errText = await res.text();
        lastError = `Gemini API error (${res.status}) [${model}]: ${errText}`;
        this.logger.warn(lastError);

        if (
          !GeminiService.RETRYABLE_STATUS.has(res.status) ||
          attempt === maxAttempts
        ) {
          break;
        }
      } catch (err: any) {
        clearTimeout(timer);
        lastError = `Gemini network error [${model}]: ${err?.message || err}`;
        this.logger.warn(lastError);
        if (attempt === maxAttempts) break;
      }

      // Backoff exponencial com jitter: 300ms, 900ms...
      const delay = 300 * 3 ** (attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }

    throw new Error(lastError);
  }

  /**
   * Executa a chamada real para a API do Gemini, com retry em falhas
   * transitórias (503/429) e fallback para modelos alternativos.
   */
  async generateContent(params: {
    messages: GeminiMessage[];
    systemPrompt: string;
    tools?: ToolDefinition[];
    model?: string;
  }): Promise<GeminiResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    const body: any = {
      contents: this.formatMessages(params.messages),
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = this.formatToolsForGemini(params.tools);
    }

    const candidates = [
      params.model || this.getDefaultModel(),
      ...this.getFallbackModels(),
    ];

    let json: any = null;
    let modelUsed = candidates[0];
    let lastError: Error | null = null;

    for (const model of candidates) {
      try {
        const result = await this.callModel(model, apiKey, body);
        json = result.json;
        modelUsed = result.modelUsed;
        if (model !== candidates[0]) {
          this.logger.warn(`Gemini respondeu com modelo de fallback: ${model}`);
        }
        break;
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `Falha no modelo "${model}", tentando próximo: ${err.message}`,
        );
      }
    }

    if (!json) {
      throw lastError || new Error("Falha ao chamar a API do Gemini.");
    }

    const model = modelUsed;
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const blocked =
      json.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY"
        ? json.promptFeedback?.blockReason || "SAFETY"
        : undefined;

    let responseText = "";
    let thought: string | undefined;
    const functionCalls: GeminiFunctionCall[] = [];

    for (const part of parts) {
      if (part.text) {
        if (
          part.text.includes("<thought>") &&
          part.text.includes("</thought>")
        ) {
          const match = part.text.match(/<thought>([\s\S]*?)<\/thought>/);
          if (match) {
            thought = match[1].trim();
            responseText += part.text
              .replace(/<thought>[\s\S]*?<\/thought>/, "")
              .trim();
          } else {
            responseText += part.text;
          }
        } else {
          responseText += part.text;
        }
      }
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
          thoughtSignature: part.thoughtSignature,
        });
      }
    }

    return {
      text: responseText.trim(),
      thought,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      modelUsed: model,
      blocked,
    };
  }
}
