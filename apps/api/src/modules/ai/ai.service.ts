import { Injectable, Inject, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AiToolsService, ToolExecutionResult } from "./ai-tools.service";
import { parseIntent } from "./ai-heuristic.service";
import { AiConversationsService } from "./ai-conversations.service";
import { GeminiService, GeminiMessage } from "./gemini.service";

export interface ChatRequestDto {
  message: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  model?: string;
  contextTag?: string;
  /** Conversa a continuar. Ausente = cria uma nova automaticamente. */
  conversationId?: string;
}

export interface ChatResponseDto {
  text: string;
  thought?: string;
  toolsUsed: Array<{
    name: string;
    summary: string;
    success: boolean;
  }>;
  resultsSummary?: {
    total: number;
    title: string;
    items: Array<{ title: string; subtitle?: string; icon?: string }>;
  };
  modelUsed: string;
  /**
   * Ação que o frontend deve aplicar imediatamente após a resposta — hoje usada
   * para trocar o tema sem recarregar a página. Devolvida quando alguma
   * ferramenta executada a emitiu (ex.: `alterar_tema_painel`).
   */
  clientAction?: {
    type: "CHANGE_THEME" | "REFRESH_DATA" | "NAVIGATE" | "TOAST";
    payload: any;
  };
  /** true quando a resposta veio do orquestrador heurístico, sem o Gemini. */
  usedFallback?: boolean;
  /** Conversa em que esta troca foi gravada (nova ou continuada). */
  conversationId?: string;
}

/**
 * Modelos que o cliente pode pedir. Fora da lista = ignora e usa o padrão.
 * Sem isto, qualquer string virava `candidates[0]` e derrubava a chamada.
 */
export const AI_ALLOWED_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

/** Teto do loop agente: rodadas e chamadas de ferramenta por turno. */
const AGENT_MAX_ROUNDS = 4;
const AGENT_MAX_TOOL_CALLS = 12;
/** Histórico server-side por turno (mensagens) e teto por mensagem (chars). */
const HISTORY_MESSAGE_LIMIT = 14;
const HISTORY_TEXT_LIMIT = 2000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly aiToolsService: AiToolsService,
    private readonly geminiService: GeminiService,
    private readonly conversations: AiConversationsService,
  ) {}

  /**
   * Processa a mensagem do usuário, decide ferramentas, executa no ERP e responde
   */
  async processChat(user: any, dto: ChatRequestDto): Promise<ChatResponseDto> {
    const isSuperAdmin = user?.role === "SUPER_ADMIN";
    const companyId = user?.companyId || user?.tenantId;

    // 0. Resolve a conversa antes de responder, para que o histórico seja
    // gravado mesmo se o provedor de IA falhar (a mensagem do usuário não
    // pode se perder só porque o Gemini caiu).
    let conversationId = dto.conversationId;
    if (companyId) {
      try {
        if (conversationId) {
          // Valida que a conversa é desta empresa; id de outro tenant é ignorado.
          await this.conversations.get(companyId, conversationId);
        } else {
          const created = await this.conversations.create(companyId, {
            tenantId: user?.tenantId,
            userId: user?.sub || user?.id,
            model: dto.model,
          });
          conversationId = created.id;
        }
      } catch {
        // Conversa inexistente ou de outra empresa: segue com uma nova.
        conversationId = undefined;
      }
    }

    // Grava a fala do usuário imediatamente. Se o provedor de IA falhar, a
    // pergunta continua no histórico — o operador não perde o que escreveu.
    await this.persistMessage(companyId, conversationId, {
      role: "user",
      text: dto.message,
    });

    // 1. Carrega dados do tenant para contextualizar o prompt do sistema
    let tenantInfo: any = null;
    if (companyId) {
      tenantInfo = await this.prisma.tenant.findUnique({
        where: { id: companyId },
        select: { id: true, companyName: true, niche: true, slug: true },
      });
    }

    const scope: "TENANT" | "GLOBAL" =
      isSuperAdmin && !companyId ? "GLOBAL" : "TENANT";
    const availableTools = this.aiToolsService.getToolDefinitions(scope);

    const systemPrompt = `Você é o Copiloto de Inteligência Artificial integrado ao SaaS ERP.
Contexto atual:
- Empresa: ${tenantInfo?.companyName || "Plataforma Geral"} (${tenantInfo?.niche || "Geral"})
- Usuário: ${user?.name || "Operador"} (Cargo: ${user?.role || "Usuário"})
- Modo: ${scope === "GLOBAL" ? "Copiloto SuperAdmin / Plataforma" : "Copiloto do Cliente / Empresa"}

Diretrizes:
1. Responda em Português do Brasil de forma prestativa, concisa, elegante e profissional.
2. Utilize as ferramentas disponíveis para consultar e executar ações reais no sistema em vez de inventar números ou suposições.
3. Após executar uma ferramenta, responda ao usuário com base nos dados reais retornados.
4. Formate a resposta utilizando Markdown limpo, com tópicos claros, listas e destaques em negrito.
5. Explique brevemente o raciocínio utilizado.
6. Você é um agente DENTRO desta empresa: consulte e opere apenas os dados dela. Nunca invente IDs — use os retornados pelas ferramentas.
7. Ações sensíveis (fechar conta, desconto, preço, baixa financeira, concluir OS, excluir) exigem confirm:true: mostre o resumo ao operador, peça confirmação e só então re-chame confirmado.
8. Não existe ferramenta de excluir empresa e nunca afirme o contrário: empresas só são gerenciadas pelo suporte da plataforma.`;

    const messages: GeminiMessage[] = await this.buildMessages(
      companyId,
      conversationId,
      dto,
    );

    const model =
      dto.model && AI_ALLOWED_MODELS.includes(dto.model)
        ? dto.model
        : undefined;

    // 2. Primeira chamada: análise e function calling
    let initialResponse;
    try {
      initialResponse = await this.geminiService.generateContent({
        messages,
        systemPrompt,
        tools: availableTools,
        model,
      });
      if (
        initialResponse.blocked ||
        (!initialResponse.text && !initialResponse.functionCalls?.length)
      ) {
        throw new Error(
          initialResponse.blocked
            ? `Resposta bloqueada pelo filtro (${initialResponse.blocked})`
            : "Resposta vazia do provedor",
        );
      }
    } catch (err: any) {
      // O Gemini falhou (cota, latência, rede). Em vez de devolver um erro ao
      // operador, tentamos interpretar a intenção localmente — os comandos mais
      // usados do dia a dia continuam funcionando sem o provedor externo.
      this.logger.warn(
        `Gemini indisponível (${err.message}) — acionando orquestrador heurístico.`,
      );
      return this.runHeuristicFallback(
        user,
        dto,
        companyId,
        isSuperAdmin,
        model,
        conversationId,
      );
    }

    const toolsUsed: Array<{
      name: string;
      summary: string;
      success: boolean;
    }> = [];
    let resultsSummary: ChatResponseDto["resultsSummary"] = undefined;
    let clientAction: ChatResponseDto["clientAction"] = undefined;

    // 3. Loop agente (ReAct): executa as chamadas, devolve os resultados e deixa
    // o modelo encadear novas chamadas (consultar → decidir → agir), com teto
    // de rodadas e de chamadas por turno para não estourar custo/latência.
    const toolResults: ToolExecutionResult[] = [];
    let transcript: GeminiMessage[] = [...messages];
    let pendingCalls = initialResponse.functionCalls || [];
    let currentModel = initialResponse;
    let finalText = "";
    let finalThought = initialResponse.thought;
    let rounds = 0;
    let calls = 0;

    if (pendingCalls.length === 0) {
      finalText = initialResponse.text;
    } else {
      let settled = false;
      while (
        !settled &&
        rounds < AGENT_MAX_ROUNDS &&
        calls < AGENT_MAX_TOOL_CALLS
      ) {
        rounds += 1;
        const batch = pendingCalls.slice(0, AGENT_MAX_TOOL_CALLS - calls);
        calls += batch.length;

        const functionResultMessages: GeminiMessage[] = [];
        for (const call of batch) {
          const result = await this.aiToolsService.executeTool(
            call.name,
            call.args,
            { tenantId: companyId, companyId, isSuperAdmin, user },
          );
          toolResults.push(result);
          toolsUsed.push({
            name: call.name,
            summary: result.summary,
            success: result.success,
          });

          functionResultMessages.push({
            role: "function",
            name: call.name,
            response: result.success
              ? { success: true, summary: result.summary, data: result.data }
              : { success: false, error: result.data?.error || result.summary },
          });

          resultsSummary =
            this.buildResultsSummary(call.name, result) || resultsSummary;

          // A última ação emitida vence. Na prática só uma ferramenta por turno
          // produz `clientAction` (ex.: troca de tema), então não há conflito.
          if (result.clientAction) {
            clientAction = result.clientAction;
          }
        }

        transcript = [
          ...transcript,
          { role: "model", functionCalls: batch },
          ...functionResultMessages,
        ];

        try {
          const followUp = await this.geminiService.generateContent({
            messages: transcript,
            systemPrompt,
            tools: availableTools,
            model: currentModel.modelUsed,
          });
          currentModel = followUp;
          if (followUp.functionCalls && followUp.functionCalls.length > 0) {
            pendingCalls = followUp.functionCalls;
            continue;
          }
          finalText = followUp.text;
          finalThought = followUp.thought || finalThought;
          settled = true;
        } catch (err: any) {
          this.logger.error(`Follow-up Gemini call failed: ${err.message}`);
          break;
        }
      }

      // Se o modelo não retornou texto, usa o resumo da ferramenta como fallback mínimo
      if (!finalText) {
        finalText = toolResults
          .map((r) => r.summary)
          .filter(Boolean)
          .join("\n\n");
      }
    }

    if (toolResults.length > 0) {
      // Log de Auditoria LGPD
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: `AI_TOOL_EXECUTION`,
            targetType: "AiCopilot",
            targetId: toolsUsed.map((t) => t.name).join(","),
            metadata: JSON.stringify({
              message: dto.message,
              tools: toolsUsed.map((t) => t.name),
              companyId,
            }),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Audit log could not be saved: ${err.message}`);
      }
    }

    await this.persistMessage(companyId, conversationId, {
      role: "model",
      text: finalText,
      thought: finalThought,
      toolsUsed,
      resultsSummary,
      modelUsed: currentModel.modelUsed,
    });

    return {
      text: finalText,
      thought: finalThought,
      toolsUsed,
      resultsSummary,
      modelUsed: currentModel.modelUsed,
      clientAction,
      conversationId,
    };
  }

  /**
   * Histórico server-side: carrega da conversa persistida (isolada por empresa)
   * em vez de confiar no que o cliente envia. Teto de mensagens e de chars por
   * mensagem para não estourar tokens/custo. Fallback: histórico do cliente.
   */
  private async buildMessages(
    companyId: string | undefined,
    conversationId: string | undefined,
    dto: ChatRequestDto,
  ): Promise<GeminiMessage[]> {
    const current = { role: "user" as const, text: dto.message };
    if (companyId && conversationId) {
      try {
        const conv = await this.conversations.get(companyId, conversationId);
        const stored = (conv.messages || [])
          .filter((m: any) => m.role === "user" || m.role === "model")
          .map((m: any) => ({
            role: m.role as "user" | "model",
            text: String(m.text || "").slice(0, HISTORY_TEXT_LIMIT),
          }))
          .filter((m: any) => m.text.trim() !== "");
        // A fala atual já foi persistida acima: remove a duplicata do fim.
        if (stored.length > 0 && stored[stored.length - 1].role === "user") {
          stored.pop();
        }
        return [...stored.slice(-HISTORY_MESSAGE_LIMIT), current];
      } catch {
        // Conversa sumiu no meio do caminho: segue com o histórico do cliente.
      }
    }
    return [
      ...(dto.history || []).slice(-6).map((h) => ({
        role: h.role,
        text: String(h.text || "").slice(0, HISTORY_TEXT_LIMIT),
      })),
      current,
    ];
  }

  /**
   * Monta os cards de resumo para a interface a partir dos dados reais das ferramentas
   */
  /**
   * Grava uma mensagem no histórico, sem nunca quebrar a conversa.
   *
   * Persistência é acessório: se o banco falhar, o Copiloto ainda precisa
   * responder. Por isso o erro é registrado e engolido.
   */
  private async persistMessage(
    companyId: string | undefined,
    conversationId: string | undefined,
    message: Parameters<AiConversationsService["appendMessage"]>[2],
  ): Promise<void> {
    if (!companyId || !conversationId) return;
    try {
      await this.conversations.appendMessage(
        companyId,
        conversationId,
        message,
      );
    } catch (err: any) {
      this.logger.warn(
        `Falha ao gravar mensagem no histórico: ${err?.message}`,
      );
    }
  }

  /**
   * Executa a intenção interpretada localmente, sem o Gemini.
   *
   * Cobre os comandos operacionais mais frequentes (tema, tarefas, mesas,
   * compras, equipe e cardápio). Quando não reconhece a intenção com segurança,
   * devolve uma mensagem útil listando o que consegue fazer offline — nunca um
   * erro genérico, e nunca executa uma ação adivinhada.
   */
  private async runHeuristicFallback(
    user: any,
    dto: ChatRequestDto,
    companyId: string | undefined,
    isSuperAdmin: boolean,
    requestedModel?: string,
    conversationId?: string,
  ): Promise<ChatResponseDto> {
    const modelUsed = requestedModel || this.geminiService.defaultModelName();
    const intent = parseIntent(dto.message || "");

    /** Grava a resposta do modo de contingência antes de devolver. */
    const withHistory = async (
      response: ChatResponseDto,
    ): Promise<ChatResponseDto> => {
      await this.persistMessage(companyId, conversationId, {
        role: "model",
        text: response.text,
        thought: response.thought,
        toolsUsed: response.toolsUsed,
        resultsSummary: response.resultsSummary,
        modelUsed: response.modelUsed,
        usedFallback: true,
      });
      return { ...response, conversationId };
    };

    if (!intent) {
      return withHistory({
        text:
          "⚠️ **Estou operando em modo de contingência.**\n\n" +
          "O provedor de IA está indisponível no momento, então só consigo executar " +
          "comandos diretos. Posso ajudar com:\n\n" +
          '- 🎨 **Tema**: _"mude a cor do painel para verde esmeralda"_ ou _"qual a cor atual?"_\n' +
          '- ✅ **Tarefas**: _"crie uma tarefa urgente para o garçom repor guardanapos às 19:00"_\n' +
          '- 🪑 **Mesas**: _"adicione a mesa 16 com capacidade para 6 pessoas"_\n' +
          '- 📋 **Compras**: _"precisamos comprar arroz e caranguejo"_\n' +
          '- 👥 **Equipe**: _"quem está na equipe hoje?"_\n' +
          '- 🍽️ **Cardápio**: _"quais pratos temos?"_\n' +
          '- 📅 **Calendário**: _"o que tenho hoje?"_ ou _"marca reunião amanhã às 14h"_\n' +
          '- 🏋️ **Academia**: _"quais alunos estão vencidos?"_\n' +
          '- ❄️ **Serviços**: _"quais ordens de serviço estão abertas?"_\n' +
          '- 💳 **Financeiro**: _"quais contas a receber estão pendentes?"_\n\n' +
          "Tente reformular nesse formato, ou aguarde alguns instantes para o modo completo voltar.",
        toolsUsed: [],
        modelUsed,
        usedFallback: true,
      });
    }

    // Confiança baixa = não executa. Melhor perguntar do que agir errado.
    if (intent.confidence < 0.5) {
      return withHistory({
        text:
          `⚠️ **Modo de contingência ativo.** Entendi que você quer algo relacionado a ` +
          `_${intent.tool.replace(/_/g, " ")}_, mas faltam detalhes para executar com segurança.\n\n` +
          `Pode reformular com as informações completas? (${intent.reason})`,
        toolsUsed: [],
        modelUsed,
        usedFallback: true,
      });
    }

    const result = await this.aiToolsService.executeTool(
      intent.tool,
      intent.args,
      {
        tenantId: companyId,
        companyId,
        isSuperAdmin,
        user,
      },
    );

    this.logger.log(
      `Fallback heurístico executou "${intent.tool}" (confiança ${intent.confidence}): ${intent.reason}`,
    );

    return withHistory({
      text: `${result.success ? "✅" : "⚠️"} ${result.summary}\n\n_Executado em modo de contingência, sem o provedor de IA._`,
      thought: `Intenção reconhecida localmente: ${intent.reason}`,
      toolsUsed: [
        { name: intent.tool, summary: result.summary, success: result.success },
      ],
      resultsSummary:
        this.buildResultsSummary(intent.tool, result) || undefined,
      modelUsed,
      clientAction: result.clientAction,
      usedFallback: true,
    });
  }

  private buildResultsSummary(
    toolName: string,
    result: ToolExecutionResult,
  ): ChatResponseDto["resultsSummary"] | undefined {
    if (!result.success || !result.data) return undefined;
    const d = result.data;

    switch (toolName) {
      case "consultar_mesas":
        if (!d.mesas) return undefined;
        return {
          total: d.total,
          title: `${d.total} mesas no salão`,
          items: d.mesas.slice(0, 4).map((m: any) => ({
            title: `${m.nome} (${m.capacidade} lugares)`,
            subtitle: `Status: ${m.status === "FREE" ? "Livre" : m.status === "OCCUPIED" ? "Ocupada" : "Conta pedida"}`,
            icon: "table",
          })),
        };
      case "consultar_cardapio": {
        const allItens = (d.categorias || []).flatMap((c: any) => c.itens);
        return {
          total: allItens.length,
          title: `${allItens.length} itens no cardápio`,
          items: allItens.slice(0, 4).map((i: any) => ({
            title: i.nome,
            subtitle: `R$ ${Number(i.preco).toFixed(2)}`,
            icon: "utensils",
          })),
        };
      }
      case "consultar_estoque":
        if (!d.produtos) return undefined;
        return {
          total: d.totalProdutos,
          title: `${d.totalProdutos} produtos no estoque`,
          items: d.produtos.slice(0, 4).map((p: any) => ({
            title: p.nome,
            subtitle: `Saldo: ${p.saldoAtual} un (Mín: ${p.minimo})`,
            icon: "package",
          })),
        };
      case "resumo_vendas_hoje":
        return {
          total: d.totalPedidos,
          title: `Resumo financeiro do dia`,
          items: [
            {
              title: `Faturamento Total`,
              subtitle: `R$ ${d.faturamentoTotal.toFixed(2)}`,
              icon: "receipt",
            },
            {
              title: `Pedidos Concluídos`,
              subtitle: `${d.totalPedidos} vendas`,
              icon: "receipt",
            },
            {
              title: `Ticket Médio`,
              subtitle: `R$ ${d.ticketMedio.toFixed(2)}`,
              icon: "receipt",
            },
          ],
        };
      case "lancar_pedido_mesa":
        return {
          total: 1,
          title: `Pedido enviado à Cozinha`,
          items: [
            {
              title: `${d.quantidade}x ${d.item}`,
              subtitle: `Mesa ${d.mesa} • R$ ${Number(d.total).toFixed(2)} (Pedido #${d.numeroPedido})`,
              icon: "utensils",
            },
          ],
        };
      case "fechar_conta_mesa":
        return {
          total: 1,
          title: `Mesa ${d.mesa} Fechada`,
          items: [
            {
              title: `Total: R$ ${Number(d.totalPago).toFixed(2)}`,
              subtitle: `Forma: ${d.formaPagamento} • Mesa Livre`,
              icon: "receipt",
            },
          ],
        };
      case "alterar_preco_prato":
        return {
          total: 1,
          title: `Preço Atualizado`,
          items: [
            {
              title: d.prato,
              subtitle: `De R$ ${Number(d.precoAnterior).toFixed(2)} para R$ ${Number(d.novoPreco).toFixed(2)}`,
              icon: "utensils",
            },
          ],
        };
      case "pausar_prato_cardapio":
        return {
          total: 1,
          title: `Status do Cardápio`,
          items: [
            {
              title: d.prato,
              subtitle: d.disponivel
                ? "Disponível no cardápio"
                : "Esgotado / Pausado",
              icon: "utensils",
            },
          ],
        };
      case "ajustar_estoque":
        return {
          total: 1,
          title: `Estoque Atualizado`,
          items: [
            {
              title: d.produto,
              subtitle: `Novo saldo: ${d.novoSaldo} un (Antes: ${d.saldoAnterior})`,
              icon: "package",
            },
          ],
        };
      case "aplicar_desconto_mesa":
        return {
          total: 1,
          title: `Desconto na Mesa ${d.mesa}`,
          items: [
            {
              title: `Desconto: R$ ${Number(d.descontoReais).toFixed(2)}`,
              subtitle: `Novo total a pagar: R$ ${Number(d.novoTotal).toFixed(2)}`,
              icon: "receipt",
            },
          ],
        };
      case "consultar_pedidos_mesa":
        return {
          total: d.itens?.length || 0,
          title: `Comanda da Mesa ${d.mesa}`,
          items: (d.itens || []).slice(0, 4).map((it: any) => ({
            title: `${it.quantidade}x ${it.prato}`,
            subtitle: `R$ ${Number(it.subtotal).toFixed(2)} (${it.statusPedido})`,
            icon: "utensils",
          })),
        };
      case "consultar_pedidos_cozinha":
        return {
          total: d.total,
          title: `${d.total} pedidos na Cozinha`,
          items: (d.pedidos || []).slice(0, 4).map((p: any) => ({
            title: `Pedido #${p.numero} (Mesa ${p.mesa})`,
            subtitle: `${p.itens.slice(0, 2).join(", ")} • ${p.status}`,
            icon: "utensils",
          })),
        };
      case "consultar_alunos":
      case "resumo_academia": {
        const alunos = d.alunos || [];
        return {
          total: d.total ?? alunos.length,
          title:
            d.total !== undefined
              ? `${d.total} aluno(s)`
              : "Resumo da academia",
          items: alunos.slice(0, 4).map((a: any) => ({
            title: a.name,
            subtitle: `${a.planName || "Sem plano"} • ${a.status}`,
            icon: "users",
          })),
        };
      }
      case "consultar_os": {
        const ordens = d.ordens || [];
        return {
          total: d.total ?? ordens.length,
          title: `${d.total ?? ordens.length} ordem(ns) de serviço`,
          items: ordens.slice(0, 4).map((o: any) => ({
            title: `OS #${o.number} — ${o.clientName}`,
            subtitle: `${o.status}${o.technicianName ? ` • ${o.technicianName}` : ""}`,
            icon: "wrench",
          })),
        };
      }
      case "consultar_contas_receber":
      case "consultar_contas_pagar": {
        const contas = d.contas || [];
        const receber = toolName === "consultar_contas_receber";
        return {
          total: d.total ?? contas.length,
          title: receber ? "Contas a receber" : "Contas a pagar",
          items: contas.slice(0, 4).map((c: any) => ({
            title: c.description,
            subtitle: `R$ ${(Number(receber ? c.amountCents - c.paidCents : c.amountCents) / 100).toFixed(2)} • ${c.status}`,
            icon: receber ? "wallet" : "receipt",
          })),
        };
      }
      case "consultar_produtos": {
        const produtos = d.produtos || [];
        return {
          total: d.total ?? produtos.length,
          title: `${d.total ?? produtos.length} produto(s)`,
          items: produtos.slice(0, 4).map((p: any) => ({
            title: p.name,
            subtitle: `R$ ${(Number(p.salePriceCents) / 100).toFixed(2)} • est. ${p.stockQuantity}`,
            icon: "package",
          })),
        };
      }
      case "consultar_calendario":
        if (!d.eventos) return undefined;
        return {
          total: d.total,
          title:
            d.total === 0
              ? "Nenhum compromisso no período"
              : `${d.total} compromisso(s) na agenda`,
          items: (d.eventos || []).slice(0, 4).map((e: any) => {
            const dt = new Date(e.startsAt);
            const dd = String(dt.getDate()).padStart(2, "0");
            const mm = String(dt.getMonth() + 1).padStart(2, "0");
            const hh = String(dt.getHours()).padStart(2, "0");
            const mi = String(dt.getMinutes()).padStart(2, "0");
            return {
              title: e.title,
              subtitle: `${dd}/${mm} ${hh}:${mi}${e.location ? ` • ${e.location}` : ""}`,
              icon: "calendar",
            };
          }),
        };
      default:
        return undefined;
    }
  }

  /**
   * Sugestões contextuais de prompts baseados no nicho e página
   */
  getSuggestions(niche?: string): string[] {
    const isRestaurant = !niche || niche === "RESTAURANT";
    if (isRestaurant) {
      return [
        "Como está o salão e quais mesas estão ocupadas agora?",
        "Qual o resumo de vendas e pedidos de hoje?",
        "Quais itens do cardápio estão cadastrados?",
        "Tem algum produto com estoque crítico ou abaixo do mínimo?",
        "Quais pedidos estão na fila da cozinha?",
      ];
    }
    return [
      "Qual o faturamento acumulado da empresa hoje?",
      "Quais produtos precisam de reposição de estoque?",
      "Resumo geral dos pedidos e comandas ativas",
      "Como cadastrar novos itens no catálogo?",
    ];
  }
}
