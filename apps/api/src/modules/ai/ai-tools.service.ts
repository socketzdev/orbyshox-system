import { Injectable, Inject, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { CaslAbilityFactory } from "../../common/casl/casl-ability.factory";
import { GymService } from "../gym/gym.service";
import { ServiceOrdersService } from "../service-orders/service-orders.service";

/**
 * Paletas nomeadas para o controle de tema por linguagem natural.
 *
 * O usuário pede "mude a cor para azul safira" e a IA precisa traduzir isso
 * para um hex. Manter o mapa aqui (e não no prompt do modelo) garante que a
 * mesma frase produza sempre a mesma cor — e que o fallback heurístico,
 * que roda sem Gemini, use exatamente a mesma tabela.
 */
export const THEME_PALETTES: Record<string, { hex: string; label: string }> = {
  vinho: { hex: "#9b111e", label: "Vinho Bali Jack" },
  bordo: { hex: "#9b111e", label: "Bordô Bali Jack" },
  bordô: { hex: "#9b111e", label: "Bordô Bali Jack" },
  "azul safira": { hex: "#0f52ba", label: "Azul Safira" },
  "azul royal": { hex: "#1e3a8a", label: "Azul Royal" },
  azul: { hex: "#2563eb", label: "Azul" },
  "verde esmeralda": { hex: "#059669", label: "Verde Esmeralda" },
  esmeralda: { hex: "#059669", label: "Verde Esmeralda" },
  verde: { hex: "#16a34a", label: "Verde" },
  "laranja brasa": { hex: "#ea580c", label: "Laranja Brasa" },
  laranja: { hex: "#f97316", label: "Laranja" },
  "roxo nobre": { hex: "#6d28d9", label: "Roxo Nobre" },
  roxo: { hex: "#7c3aed", label: "Roxo" },
  dourado: { hex: "#b45309", label: "Dourado" },
  amarelo: { hex: "#ca8a04", label: "Amarelo" },
  vermelho: { hex: "#dc2626", label: "Vermelho" },
  rosa: { hex: "#db2777", label: "Rosa" },
  turquesa: { hex: "#0d9488", label: "Turquesa" },
  grafite: { hex: "#334155", label: "Grafite" },
  preto: { hex: "#18181b", label: "Preto" },
};

/** Normaliza o nome da cor: minúsculas, sem acento, espaços colapsados. */
export function normalizeColorName(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Resolve um nome de cor para hex, tolerando acento e variação de caixa. */
export function resolveColor(
  raw: string,
): { hex: string; label: string } | null {
  const key = normalizeColorName(raw);
  if (!key) return null;

  for (const [name, value] of Object.entries(THEME_PALETTES)) {
    if (normalizeColorName(name) === key) return value;
  }
  // Casamento parcial: "quero um azul mais escuro" ainda acha "azul".
  for (const [name, value] of Object.entries(THEME_PALETTES)) {
    if (key.includes(normalizeColorName(name))) return value;
  }
  return null;
}

/** Aceita #rgb e #rrggbb. */
export function isValidHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim());
}

/**
 * Interpreta um dia em português para o calendário da IA.
 * Aceita "hoje", "amanhã", DD/MM, DD/MM/AAAA e ISO. Devolve Date local à 00:00.
 */
export function parseAiCalendarDay(raw: unknown): Date | null {
  if (raw === undefined || raw === null || String(raw).trim() === "")
    return null;
  const s = normalizeColorName(String(raw));
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (s === "hoje" || s === "hj") return midnight;
  if (s === "amanha")
    return new Date(
      midnight.getFullYear(),
      midnight.getMonth(),
      midnight.getDate() + 1,
    );
  if (s === "depois de amanha")
    return new Date(
      midnight.getFullYear(),
      midnight.getMonth(),
      midnight.getDate() + 2,
    );
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]) - 1;
    let year = dm[3] ? Number(dm[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (d.getMonth() !== month || d.getDate() !== day) return null;
    if (!dm[3] && d < midnight) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const iso = new Date(String(raw));
  if (Number.isNaN(iso.getTime())) return null;
  return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
}

/** Interpreta HH:MM (e "14h"/"9h30") para o calendário da IA. */
export function parseAiCalendarTime(
  raw: unknown,
): { h: number; m: number } | null {
  if (raw === undefined || raw === null || String(raw).trim() === "")
    return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return { h, m: min };
  }
  m = s.match(/^(\d{1,2})h(?:(\d{2}))?$/);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) return null;
    return { h, m: min };
  }
  return null;
}

function advanceAiCalendarDate(d: Date, freq: string, interval: number): Date {
  const next = new Date(d);
  const step = Math.max(1, Math.min(365, Math.round(interval) || 1));
  if (freq === "DAILY") next.setDate(next.getDate() + step);
  else if (freq === "WEEKLY") next.setDate(next.getDate() + 7 * step);
  else if (freq === "MONTHLY") next.setMonth(next.getMonth() + step);
  else next.setFullYear(next.getFullYear() + step);
  return next;
}

function expandAiCalendarRecurrence(
  head: any,
  freq: string,
  from: Date,
  to: Date,
): any[] {
  const out: any[] = [];
  let exceptions: string[] = [];
  try {
    const arr =
      typeof head.recurrenceExceptions === "string"
        ? JSON.parse(head.recurrenceExceptions)
        : head.recurrenceExceptions;
    if (Array.isArray(arr)) exceptions = arr.map((x) => String(x));
  } catch {
    exceptions = [];
  }
  const blocked = new Set(exceptions);
  const duration =
    new Date(head.endsAt).getTime() - new Date(head.startsAt).getTime();
  let cursor = new Date(head.startsAt);
  for (let guard = 0; guard < 2000; guard++) {
    if (cursor > to || out.length >= 60) break;
    if (cursor >= from && !blocked.has(cursor.toISOString())) {
      out.push({
        id: `${head.id}@${cursor.toISOString()}`,
        eventId: head.id,
        title: head.title,
        location: head.location,
        category: head.category || "Compromisso",
        startsAt: new Date(cursor),
        endsAt: new Date(cursor.getTime() + duration),
        recurrence: freq,
      });
    }
    cursor = advanceAiCalendarDate(cursor, freq, 1);
  }
  return out;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  rolesAllowed?: string[];
  scope: "TENANT" | "GLOBAL" | "BOTH";
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data: any;
  summary: string;
  clientAction?: {
    type: "CHANGE_THEME" | "REFRESH_DATA" | "NAVIGATE" | "TOAST";
    payload: any;
  };
}

/**
 * Chaves que nunca podem aparecer em log (LGPD/segredo). A IA cadastra
 * funcionário com senha inicial — ela trafega nos args da tool e seria
 * gravada em plaintext no log do servidor sem esta máscara.
 */
const SECRET_ARG_KEYS =
  /(passw|passwd|secret|token|api[_-]?key|cpf|card|cvv|pin)/i;

export function redactToolArgs(args: Record<string, any>): Record<string, any> {
  if (!args || typeof args !== "object") return args;
  const out: Record<string, any> = Array.isArray(args) ? [] : {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = SECRET_ARG_KEYS.test(k) ? "***" : v;
  }
  return out;
}

type ToolAction = "read" | "create" | "update" | "delete";

interface ToolPermission {
  action: ToolAction;
  subject: string;
  /** Checagem por campo (ex.: preço de venda) — mesma regra das rotas. */
  field?: string | string[];
  /** Exige `confirm: true` sempre (efeito sensível, mesmo com permissão). */
  confirmAlways?: boolean;
  /** Exige `confirm: true` só quando o predicado bate (ex.: excluir tudo). */
  confirmWhen?: (args: Record<string, any>) => boolean;
}

const toCaslAction = (a: ToolAction): string => {
  switch (a) {
    case "read":
      return "read";
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
  }
};

/**
 * Permissão de cada ferramenta no RBAC da casa (mesma matriz das rotas REST).
 *
 * Sem isto, qualquer funcionário autenticado executava pelo chat o que a rota
 * negaria (fechar conta, desconto, preço, estoque, excluir). A checagem usa a
 * `CaslAbilityFactory` — garçom continua garçom também para a IA.
 */
const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  // ─── Mesas & salão ───
  consultar_mesas: { action: "read", subject: "Table" },
  abrir_comanda_mesa: { action: "create", subject: "TableSession" },
  fechar_conta_mesa: {
    action: "update",
    subject: "TableSession",
    confirmAlways: true,
  },
  liberar_mesa: { action: "update", subject: "Table" },
  transferir_mesa: { action: "update", subject: "TableSession" },
  lancar_pedido_mesa: { action: "create", subject: "Order" },
  consultar_pedidos_mesa: { action: "read", subject: "Order" },
  consultar_cardapio: { action: "read", subject: "Product" },
  adicionar_prato_cardapio: { action: "create", subject: "Product" },
  alterar_preco_prato: {
    action: "update",
    subject: "Product",
    field: "salePriceCents",
    confirmAlways: true,
  },
  pausar_prato_cardapio: { action: "update", subject: "Product" },
  ajustar_estoque: { action: "update", subject: "Product" },
  aplicar_desconto_mesa: {
    action: "update",
    subject: "Order",
    field: "discountCents",
    confirmAlways: true,
  },
  atualizar_status_pedido_cozinha: { action: "update", subject: "Order" },
  consultar_pedidos_cozinha: { action: "read", subject: "Order" },
  consultar_estoque: { action: "read", subject: "Product" },
  resumo_vendas_hoje: { action: "read", subject: "Report" },
  // ─── Tema ───
  alterar_tema_painel: { action: "update", subject: "StoreSettings" },
  consultar_tema_painel: { action: "read", subject: "StoreSettings" },
  // ─── Tarefas & equipe ───
  consultar_tarefas: { action: "read", subject: "Task" },
  criar_tarefa: { action: "create", subject: "Task" },
  concluir_tarefa: { action: "update", subject: "Task" },
  consultar_equipe: { action: "read", subject: "Employee" },
  cadastrar_funcionario: { action: "create", subject: "Employee" },
  adicionar_mesa: { action: "create", subject: "Table" },
  remover_mesa: {
    action: "delete",
    subject: "Table",
    confirmWhen: (a) => a?.all === true,
  },
  // ─── Compras & cardápio ───
  criar_nota_compra: { action: "create", subject: "PurchaseNote" },
  consultar_notas_compra: { action: "read", subject: "PurchaseNote" },
  criar_categoria_cardapio: { action: "create", subject: "Product" },
  remover_prato_cardapio: {
    action: "update",
    subject: "Product",
    confirmWhen: (a) => a?.permanent === true,
  },
  // ─── Calendário ───
  consultar_calendario: { action: "read", subject: "CalendarEvent" },
  criar_evento_calendario: { action: "create", subject: "CalendarEvent" },
  editar_evento_calendario: { action: "update", subject: "CalendarEvent" },
  excluir_evento_calendario: {
    action: "update",
    subject: "CalendarEvent",
    confirmWhen: (a) => String(a?.scope || "single") === "series",
  },
  // ─── Academia ───
  consultar_alunos: { action: "read", subject: "GymStudent" },
  registrar_checkin: { action: "create", subject: "GymCheckIn" },
  resumo_academia: { action: "read", subject: "GymStudent" },
  // ─── Refrigeração ───
  consultar_os: { action: "read", subject: "ServiceOrder" },
  criar_os: { action: "create", subject: "ServiceOrder" },
  concluir_os: {
    action: "update",
    subject: "ServiceOrder",
    confirmAlways: true,
  },
  // ─── Financeiro ───
  consultar_contas_receber: { action: "read", subject: "BillReceivable" },
  dar_baixa_conta: {
    action: "update",
    subject: "BillReceivable",
    confirmAlways: true,
  },
  consultar_contas_pagar: { action: "read", subject: "BillPayable" },
  consultar_produtos: { action: "read", subject: "Product" },
};

@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);

  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly casl: CaslAbilityFactory,
    private readonly gym: GymService,
    private readonly fieldService: ServiceOrdersService,
  ) {}

  /**
   * Lê o `branding` da empresa com tolerância a dados inválidos.
   *
   * O campo é um `String` com JSON (default `"{}"`). Um valor corrompido não
   * pode derrubar a consulta de tema — nesse caso devolvemos `{}` e seguimos.
   */
  private parseBranding(raw: string | null | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      this.logger.warn("branding inválido no banco — tratado como vazio");
      return {};
    }
  }

  /**
   * Busca resiliente de produto por aproximação semântica (ignora maiúsculas/minúsculas, plurais e substrings)
   */
  private async findProductByName(
    companyId: string,
    searchTerm: string,
    mustBeActive = true,
  ) {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        ...(mustBeActive ? { isActive: true } : {}),
      },
    });

    const search = searchTerm.toLowerCase().trim();
    // 1. Match exato
    let found = products.find((p) => p.name.toLowerCase() === search);
    if (found) return found;

    // 2. Substring recíproca
    found = products.find(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        search.includes(p.name.toLowerCase()),
    );
    if (found) return found;

    // 3. Normalização de plurais ('s', 'es')
    const singularSearch = search.replace(/(?:es|s)\b/g, "").trim();
    found = products.find((p) => {
      const pSingular = p.name
        .toLowerCase()
        .replace(/(?:es|s)\b/g, "")
        .trim();
      return (
        pSingular.includes(singularSearch) || singularSearch.includes(pSingular)
      );
    });
    if (found) return found;

    // 4. Match por palavras-chave com mais de 2 letras
    const tokens = search.split(/\s+/).filter((w) => w.length >= 3);
    for (const t of tokens) {
      found = products.find((p) => p.name.toLowerCase().includes(t));
      if (found) return found;
    }

    return null;
  }

  /**
   * Catálogo de todas as ferramentas disponíveis no ERP (Com Poder Absoluto de Gestão)
   */
  getToolDefinitions(scope: "TENANT" | "GLOBAL" = "TENANT"): ToolDefinition[] {
    const allTools: ToolDefinition[] = [
      // ─── Salão & Mesas ───
      {
        name: "consultar_mesas",
        description:
          "Consulta o status de todas as mesas do restaurante (livres, ocupadas, aguardando conta, capacidade e sessões ativas).",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["FREE", "OCCUPIED", "BILL_REQUESTED", "RESERVED", "ALL"],
              description:
                "Filtrar por status específico ou ALL para todas as mesas.",
            },
          },
        },
      },
      {
        name: "abrir_comanda_mesa",
        description: "Abre uma comanda / sessão para uma mesa específica.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: {
              type: "number",
              description: "Número da mesa (ex: 4).",
            },
            customerCount: {
              type: "number",
              description: "Número de clientes na mesa.",
            },
            notes: {
              type: "string",
              description:
                'Observações ou nome na comanda (ex: "Mesa do João").',
            },
          },
          required: ["tableNumber"],
        },
      },
      {
        name: "fechar_conta_mesa",
        description:
          "Encerra a comanda da mesa, calcula o total, registra o pagamento e libera a mesa como livre.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: {
              type: "number",
              description: "Número da mesa a fechar.",
            },
            formaPagamento: {
              type: "string",
              enum: ["PIX", "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO"],
              description: "Forma de pagamento utilizada.",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true: só execute depois de mostrar o total ao operador e ele confirmar. Sem confirm:true a chamada é recusada.",
            },
          },
          required: ["tableNumber"],
        },
      },
      {
        name: "liberar_mesa",
        description:
          "Libera imediatamente uma mesa para novos clientes, fechando qualquer comanda em aberto.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: {
              type: "number",
              description: "Número da mesa a ser liberada.",
            },
          },
          required: ["tableNumber"],
        },
      },
      {
        name: "transferir_mesa",
        description:
          "Transfere a comanda e os pedidos de uma mesa para outra no salão.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            mesaOrigem: {
              type: "number",
              description: "Número da mesa atual.",
            },
            mesaDestino: {
              type: "number",
              description: "Número da nova mesa de destino.",
            },
          },
          required: ["mesaOrigem", "mesaDestino"],
        },
      },

      // ─── Lançamento de Pedidos ───
      {
        name: "lancar_pedido_mesa",
        description:
          "Lança pratos ou bebidas diretamente para a comanda de uma mesa no restaurante.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: { type: "number", description: "Número da mesa." },
            pratoNome: {
              type: "string",
              description: "Nome do prato ou bebida a lançar.",
            },
            quantidade: {
              type: "number",
              description: "Quantidade a ser lançada.",
            },
            observacao: {
              type: "string",
              description: 'Observações (ex: "Sem cebola", "Gelo e limão").',
            },
          },
          required: ["tableNumber", "pratoNome"],
        },
      },
      {
        name: "consultar_pedidos_mesa",
        description:
          "Consulta todos os itens consumidos e o total da comanda de uma mesa específica.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: { type: "number", description: "Número da mesa." },
          },
          required: ["tableNumber"],
        },
      },

      // ─── Cardápio & Pratos ───
      {
        name: "consultar_cardapio",
        description:
          "Consulta pratos, bebidas, categorias, preços e disponibilidades do cardápio.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            categoria: {
              type: "string",
              description: "Nome ou parte do nome da categoria (opcional).",
            },
            termoBusca: {
              type: "string",
              description: "Nome do prato ou ingrediente a buscar.",
            },
          },
        },
      },
      {
        name: "adicionar_prato_cardapio",
        description:
          "Cadastra um novo prato ou bebida no cardápio do restaurante.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome do prato ou bebida." },
            preco: {
              type: "number",
              description: "Preço em Reais (ex: 29.90).",
            },
            categoria: {
              type: "string",
              description:
                "Categoria do item (ex: Sushi, Sobremesas, Bebidas).",
            },
            descricao: {
              type: "string",
              description: "Descrição dos ingredientes e preparo.",
            },
          },
          required: ["nome", "preco", "categoria"],
        },
      },
      {
        name: "alterar_preco_prato",
        description:
          "Altera o preço de venda de um item existente no cardápio.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            pratoNome: {
              type: "string",
              description: "Nome do prato a ser atualizado.",
            },
            novoPreco: {
              type: "number",
              description: "Novo preço em Reais (ex: 35.00).",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true: só execute depois de mostrar o preço novo ao operador e ele confirmar. Sem confirm:true a chamada é recusada.",
            },
          },
          required: ["pratoNome", "novoPreco"],
        },
      },
      {
        name: "pausar_prato_cardapio",
        description:
          "Ativa ou desativa a disponibilidade de um prato no cardápio (pausar ou esgotar item).",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            pratoNome: {
              type: "string",
              description: "Nome do prato a pausar/ativar.",
            },
            ativo: {
              type: "boolean",
              description: "True para disponível, False para esgotado/pausado.",
            },
          },
          required: ["pratoNome"],
        },
      },

      // ─── Cozinha & KDS ───
      {
        name: "consultar_pedidos_cozinha",
        description:
          "Consulta os pedidos ativos na cozinha / KDS (pendentes, em preparo ou prontos).",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["PENDING", "PREPARING", "READY", "ALL_ACTIVE"],
              description: "Status do pedido na cozinha.",
            },
          },
        },
      },
      {
        name: "atualizar_status_pedido_cozinha",
        description:
          "Avança o status de um pedido na cozinha (ex: marcar como PRONTO ou PREPARANDO).",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: {
              type: "number",
              description: "Número da mesa associada.",
            },
            novoStatus: {
              type: "string",
              enum: ["PREPARING", "READY", "COMPLETED", "CANCELLED"],
              description: "Novo status do pedido.",
            },
          },
          required: ["novoStatus"],
        },
      },

      // ─── Estoque & Insumos ───
      {
        name: "consultar_estoque",
        description:
          "Verifica o saldo em estoque dos produtos, itens com estoque crítico ou abaixo do mínimo.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            apenasCriticos: {
              type: "boolean",
              description:
                "Se true, traz apenas produtos com estoque <= estoque mínimo.",
            },
            termo: {
              type: "string",
              description: "Nome do produto para busca.",
            },
          },
        },
      },
      {
        name: "ajustar_estoque",
        description:
          "Dá entrada ou saída manual de quantidade no estoque de um produto.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            produtoNome: { type: "string", description: "Nome do produto." },
            quantidade: {
              type: "number",
              description:
                "Quantidade a ser adicionada (positivo) ou subtraída (negativo).",
            },
            motivo: {
              type: "string",
              description:
                'Motivo do ajuste (ex: "Compra de insumo", "Perda/Quebra").',
            },
          },
          required: ["produtoNome", "quantidade"],
        },
      },

      // ─── Vendas, Caixa & Financeiro ───
      {
        name: "resumo_vendas_hoje",
        description:
          "Calcula o faturamento do dia de hoje, total de pedidos fechados, ticket médio e formas de pagamento.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "aplicar_desconto_mesa",
        description:
          "Aplica um desconto em reais ou porcentagem sobre os pedidos de uma mesa.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            tableNumber: { type: "number", description: "Número da mesa." },
            valorDescontoReais: {
              type: "number",
              description: "Valor do desconto em Reais (ex: 10.00).",
            },
            percentualDesconto: {
              type: "number",
              description: "Percentual de desconto (ex: 10 para 10%).",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true: só execute depois de mostrar o valor do desconto ao operador e ele confirmar. Sem confirm:true a chamada é recusada.",
            },
          },
          required: ["tableNumber"],
        },
      },

      // ─── Tema & Branding ───
      {
        name: "alterar_tema_painel",
        description:
          'Altera a cor primária / tema do painel em tempo real. Use quando o usuário pedir para mudar a cor, o tema ou o visual do sistema (ex: "mude a cor para azul safira", "coloque o tema verde esmeralda", "volte para o vinho do Bali Jack").',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            colorName: {
              type: "string",
              description:
                'Nome da cor em português (ex: "azul safira", "verde esmeralda", "bordô", "vinho", "laranja brasa", "roxo nobre", "dourado").',
            },
            hex: {
              type: "string",
              description:
                'Código hexadecimal da cor (ex: "#059669"). Obrigatório se o nome não for reconhecido.',
            },
            darkMode: {
              type: "boolean",
              description:
                "true para modo escuro, false para claro. Omitir mantém o atual.",
            },
          },
        },
      },
      {
        name: "consultar_tema_painel",
        description:
          "Consulta as cores atuais do painel e a lista de paletas recomendadas disponíveis para aplicar.",
        scope: "TENANT",
        parameters: { type: "object", properties: {} },
      },

      // ─── Tarefas & Rotinas ───
      {
        name: "consultar_tarefas",
        description:
          "Lista as tarefas operacionais da equipe, com filtro opcional por status, setor e prioridade.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "ALL"],
              description: "Filtrar por status. Use ALL para todas.",
            },
            assignedRole: {
              type: "string",
              description:
                'Setor responsável (ex: "Cozinha", "Garçom", "Caixa", "Limpeza").',
            },
            priority: {
              type: "string",
              enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
              description: "Filtrar por prioridade.",
            },
          },
        },
      },
      {
        name: "criar_tarefa",
        description:
          'Cria uma tarefa operacional para a equipe (ex: "crie uma tarefa urgente para o garçom repor guardanapos às 19:00").',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título curto da tarefa." },
            description: {
              type: "string",
              description: "Detalhes do que deve ser feito.",
            },
            assignedRole: {
              type: "string",
              description:
                'Setor responsável (ex: "Garçom", "Cozinha", "Caixa", "Limpeza").',
            },
            dueTime: {
              type: "string",
              description: 'Horário previsto no formato HH:MM (ex: "19:00").',
            },
            priority: {
              type: "string",
              enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
              description: "Prioridade da tarefa.",
            },
            frequency: {
              type: "string",
              enum: ["TODAY", "DAILY", "WEEKLY"],
              description: "Recorrência da tarefa.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "concluir_tarefa",
        description:
          "Marca uma tarefa como concluída, registrando quem concluiu e o horário.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "ID da tarefa, quando conhecido.",
            },
            search: {
              type: "string",
              description:
                'Trecho do título da tarefa, quando o ID não for conhecido (ex: "organizar mesas").',
            },
            completedByName: {
              type: "string",
              description: "Nome de quem concluiu.",
            },
          },
        },
      },

      // ─── Equipe & Staff ───
      {
        name: "consultar_equipe",
        description:
          "Lista os colaboradores da empresa com função, e-mail, telefone e situação.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description: 'Filtrar por cargo (ex: "Garçom", "Cozinheiro").',
            },
            activeOnly: {
              type: "boolean",
              description: "true para listar apenas ativos.",
            },
          },
        },
      },
      {
        name: "cadastrar_funcionario",
        description:
          "Cadastra um novo colaborador com nome, e-mail, telefone, cargo e função.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Nome completo do colaborador.",
            },
            email: { type: "string", description: "E-mail de acesso." },
            phone: { type: "string", description: "Telefone de contato." },
            role: {
              type: "string",
              description:
                'Cargo/função (ex: "Garçom", "Cozinheiro", "Caixa", "Gerente").',
            },
            password: {
              type: "string",
              description: "Senha inicial de acesso, quando aplicável.",
            },
          },
          required: ["name"],
        },
      },

      // ─── Mesas & Salão ───
      {
        name: "adicionar_mesa",
        description:
          'Cria uma nova mesa no salão (ex: "adicione uma nova mesa na varanda: Mesa 16 com capacidade para 6 pessoas").',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            number: {
              type: "number",
              description: "Número/identificador da mesa.",
            },
            capacity: { type: "number", description: "Capacidade de pessoas." },
            area: {
              type: "string",
              description:
                'Área do salão (ex: "Salão", "Varanda", "Mezanino").',
            },
          },
          required: ["number"],
        },
      },
      {
        name: "remover_mesa",
        description:
          'Remove mesas do salão. Aceita uma mesa específica (por número ou ID) OU todas as mesas livres de uma vez — use `all: true` quando o pedido for no plural (ex: "exclua as mesas", "apague todas as mesas"). Mesas ocupadas nunca são removidas: elas aparecem no relatório como ignoradas.',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            number: {
              type: "number",
              description: "Número da mesa a remover.",
            },
            tableId: {
              type: "string",
              description: "ID da mesa, quando conhecido.",
            },
            all: {
              type: "boolean",
              description:
                "true para remover TODAS as mesas livres do salão. Use quando o usuário não especificar uma mesa.",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true quando all:true. Sem confirm:true a remoção em lote é recusada.",
            },
          },
        },
      },

      // ─── Notas de Compra ───
      {
        name: "criar_nota_compra",
        description:
          'Cria uma nota de solicitação de insumos para os compradores (ex: "precisamos comprar arroz e caranguejo").',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título/assunto da nota." },
            items: {
              type: "array",
              description: "Itens a comprar.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Nome do insumo." },
                  quantity: { type: "number", description: "Quantidade." },
                  unit: {
                    type: "string",
                    description: "Unidade (kg, un, cx...).",
                  },
                },
                required: ["name"],
              },
            },
            notes: {
              type: "string",
              description: "Observações para o comprador.",
            },
            priority: {
              type: "string",
              enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
            },
          },
          required: ["items"],
        },
      },
      {
        name: "consultar_notas_compra",
        description:
          "Lista as notas de compra de insumos, pendentes e confirmadas.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description:
                'Filtrar por situação (ex: "PENDING", "CONFIRMED", "ALL").',
            },
          },
        },
      },

      // ─── Cardápio: categorias e remoção ───
      {
        name: "criar_categoria_cardapio",
        description:
          'Cria uma nova categoria organizacional no cardápio (ex: "Hambúrgueres", "Sobremesas").',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome da categoria." },
            description: {
              type: "string",
              description: "Descrição da categoria.",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "remover_prato_cardapio",
        description:
          "Remove ou desativa um prato do catálogo. Por padrão desativa (reversível).",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            productId: {
              type: "string",
              description: "ID do prato, quando conhecido.",
            },
            search: {
              type: "string",
              description:
                "Trecho do nome do prato, quando o ID não for conhecido.",
            },
            permanent: {
              type: "boolean",
              description:
                "true para excluir de vez; false (padrão) apenas desativa.",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true quando permanent:true. Sem confirm:true a exclusão definitiva é recusada.",
            },
          },
        },
      },

      // ─── Calendário da empresa ───
      {
        name: "consultar_calendario",
        description:
          'Lista os compromissos do calendário da empresa num período (eventos, tarefas com vencimento e agendamentos aparecem juntos). Use para "o que tenho hoje/amanhã/esta semana?".',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Início do período (ISO ou DD/MM). Padrão: hoje.",
            },
            to: {
              type: "string",
              description: "Fim do período (ISO ou DD/MM). Padrão: +7 dias.",
            },
            search: {
              type: "string",
              description: "Filtrar por trecho do título.",
            },
          },
        },
      },
      {
        name: "criar_evento_calendario",
        description:
          'Cria um evento no calendário da empresa (ex: "marca reunião amanhã às 14h", "agende visita técnica sexta 9h"). Aceita data/hora em português (hoje, amanhã, DD/MM) e repetição.',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título do evento." },
            date: {
              type: "string",
              description: 'Dia: "hoje", "amanhã" ou DD/MM (ex: "20/09").',
            },
            time: {
              type: "string",
              description: 'Hora HH:MM (ex: "14:00"). Padrão: 09:00.',
            },
            durationMin: {
              type: "number",
              description: "Duração em minutos. Padrão: 60.",
            },
            location: { type: "string", description: "Local do evento." },
            description: { type: "string", description: "Detalhes do evento." },
            category: {
              type: "string",
              description: 'Categoria (ex: "Reunião", "Visita").',
            },
            recurrence: {
              type: "string",
              enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"],
              description: "Repetição. Padrão: NONE.",
            },
            reminderMin: {
              type: "number",
              description: "Lembrete em minutos antes (ex: 10, 60, 1440).",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "editar_evento_calendario",
        description:
          'Altera um evento do calendário (título, data, hora, local). Localize por ID ou por trecho do título. Em série, `scope` decide: "single" (só este) ou "series" (toda a série).',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            eventId: {
              type: "string",
              description: "ID do evento, quando conhecido.",
            },
            search: {
              type: "string",
              description: "Trecho do título para localizar.",
            },
            title: { type: "string", description: "Novo título." },
            date: {
              type: "string",
              description: 'Novo dia: "hoje", "amanhã" ou DD/MM.',
            },
            time: { type: "string", description: "Nova hora HH:MM." },
            location: { type: "string", description: "Novo local." },
            scope: {
              type: "string",
              enum: ["single", "series"],
              description: "Padrão: single.",
            },
          },
        },
      },
      {
        name: "excluir_evento_calendario",
        description:
          'Exclui um evento do calendário. Localize por ID ou trecho do título. Em série, `scope` decide: "single" (só este, padrão) ou "series" (toda a série).',
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            eventId: {
              type: "string",
              description: "ID do evento, quando conhecido.",
            },
            search: {
              type: "string",
              description: "Trecho do título para localizar.",
            },
            scope: {
              type: "string",
              enum: ["single", "series"],
              description: "Padrão: single.",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true quando scope:series. Sem confirm:true a exclusão da série é recusada.",
            },
          },
        },
      },

      // ─── Academia ───
      {
        name: "consultar_alunos",
        description:
          "Lista os alunos da academia com plano, status e vencimento. Use para perguntas sobre alunos, matrículas e inadimplentes.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Trecho do nome, telefone ou e-mail.",
            },
            status: {
              type: "string",
              enum: [
                "ALL",
                "ATIVO",
                "PENDENTE",
                "VENCIDO",
                "PAUSADO",
                "CANCELADO",
              ],
              description: "Filtrar por situação. Padrão: ALL.",
            },
          },
        },
      },
      {
        name: "registrar_checkin",
        description:
          "Registra a entrada de um aluno na catraca (check-in manual). Valida a situação: mensalidade vencida, pausa ou cancelamento bloqueiam com motivo.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            studentId: {
              type: "string",
              description: "ID do aluno, quando conhecido.",
            },
            search: {
              type: "string",
              description:
                "Trecho do nome do aluno, quando o ID não for conhecido.",
            },
          },
        },
      },
      {
        name: "resumo_academia",
        description:
          "Resumo operacional da academia: alunos ativos, presentes hoje, novas matrículas no mês, vencendo em 7 dias, pendências e faturamento do mês.",
        scope: "TENANT",
        parameters: { type: "object", properties: {} },
      },

      // ─── Refrigeração (ordens de serviço) ───
      {
        name: "consultar_os",
        description:
          "Lista ordens de serviço com número, cliente, técnico, status e valor. Use para acompanhar serviços, agenda e pendências de campo.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: [
                "ALL",
                "ABERTA",
                "AGENDADA",
                "EM_ATENDIMENTO",
                "AGUARDANDO_PECA",
                "CONCLUIDA",
                "CANCELADA",
              ],
              description: "Filtrar por etapa do funil. Padrão: ALL.",
            },
            search: {
              type: "string",
              description: "Cliente, endereço ou número da OS.",
            },
          },
        },
      },
      {
        name: "criar_os",
        description:
          "Abre uma ordem de serviço (instalação, manutenção, conserto, visita). Gera número sequencial; com data, já nasce agendada.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            clientName: {
              type: "string",
              description: "Nome do cliente (obrigatório sem customerId).",
            },
            customerId: {
              type: "string",
              description: "ID do cliente cadastrado, quando conhecido.",
            },
            phone: { type: "string", description: "Telefone." },
            address: {
              type: "string",
              description: "Endereço do atendimento.",
            },
            serviceType: {
              type: "string",
              enum: [
                "MANUTENCAO",
                "INSTALACAO",
                "LIMPEZA",
                "RECARGA",
                "CONSERTO",
                "VISITA",
              ],
              description: "Tipo de serviço. Padrão: MANUTENCAO.",
            },
            reportedProblem: {
              type: "string",
              description: "Problema relatado pelo cliente.",
            },
            equipmentDesc: {
              type: "string",
              description: "Equipamento (ex: Split 12000 BTUs Samsung).",
            },
            scheduledAt: {
              type: "string",
              description: "Data/hora agendada (ISO).",
            },
          },
          required: ["clientName"],
        },
      },
      {
        name: "concluir_os",
        description:
          "Conclui uma ordem de serviço, gerando a cobrança no Financeiro. Localize por número ou ID.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            number: {
              type: "number",
              description: "Número da OS.",
            },
            orderId: {
              type: "string",
              description: "ID da OS, quando conhecido.",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true: só execute depois de mostrar o valor total ao operador e ele confirmar. Sem confirm:true a chamada é recusada.",
            },
          },
        },
      },

      // ─── Financeiro ───
      {
        name: "consultar_contas_receber",
        description:
          "Lista contas a receber (mensalidades, serviços, vendas) com vencimento, valores e situação. Use para pendências, atrasados e recebidos.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: [
                "ALL",
                "PENDING",
                "PARTIAL",
                "RECEIVED",
                "OVERDUE",
                "CANCELED",
              ],
              description: "Filtrar por situação. Padrão: ALL.",
            },
          },
        },
      },
      {
        name: "dar_baixa_conta",
        description:
          "Registra recebimento (total ou parcial) de uma conta a receber, atualizando saldo e situação. Localize por ID ou trecho da descrição.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            billId: {
              type: "string",
              description: "ID da conta, quando conhecido.",
            },
            search: {
              type: "string",
              description:
                "Trecho da descrição, quando o ID não for conhecido.",
            },
            amountCents: {
              type: "number",
              description: "Valor em centavos. Omitir quita o total pendente.",
            },
            method: {
              type: "string",
              description: "Forma de recebimento (PIX, DINHEIRO, CARTAO...).",
            },
            confirm: {
              type: "boolean",
              description:
                "OBRIGATÓRIO true: só execute depois de mostrar valor e conta ao operador e ele confirmar. Sem confirm:true a chamada é recusada.",
            },
          },
        },
      },
      {
        name: "consultar_contas_pagar",
        description:
          "Lista contas a pagar (fornecedores, despesas) com vencimento, valores e situação.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["ALL", "PENDING", "PAID", "OVERDUE", "CANCELED"],
              description: "Filtrar por situação. Padrão: ALL.",
            },
          },
        },
      },
      {
        name: "consultar_produtos",
        description:
          "Lista produtos e peças do catálogo com preço e estoque. Use para consultas de preço, disponibilidade e estoque baixo.",
        scope: "TENANT",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Trecho do nome, SKU ou código de barras.",
            },
          },
        },
      },

      // ─── SuperAdmin / Global ───
      {
        name: "metricas_plataforma_global",
        description:
          "Consulta métricas globais do SaaS: total de empresas/tenants ativas, faturamento MRR e distribuição de nichos.",
        scope: "GLOBAL",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "resumo_tickets_suporte",
        description:
          "Retorna a quantidade de chamados de suporte abertos e pendentes na plataforma.",
        scope: "GLOBAL",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    ];

    return allTools.filter((t) =>
      scope === "GLOBAL"
        ? t.scope === "GLOBAL" || t.scope === "BOTH"
        : t.scope === "TENANT" || t.scope === "BOTH",
    );
  }

  /**
   * Portão de segurança de cada ferramenta (fail-closed, nesta ordem):
   * 1. Ferramenta existe no catálogo (desconhecida = recusa — nunca executa
   *    "por aproximação", e nunca existe tool de excluir empresa).
   * 2. Escopo: GLOBAL exige Super Admin; TENANT exige empresa identificada
   *    vinda do token (a IA só age dentro da empresa dela).
   * 3. RBAC: o cargo do operador precisa da ação no sujeito (mesma matriz
   *    das rotas REST — garçom continua garçom para a IA).
   * 4. Confirmação: efeito sensível exige `confirm: true` (o modelo pergunta
   *    antes e re-chama confirmado; sem isso, devolve o pedido de confirmação).
   */
  private checkToolAccess(
    toolName: string,
    args: Record<string, any>,
    context: {
      tenantId?: string;
      companyId?: string;
      isSuperAdmin?: boolean;
      user?: any;
    },
    resolvedCompanyId: string | undefined,
  ): { ok: true } | { ok: false; summary: string; data: any } {
    const def =
      this.getToolDefinitions("TENANT").find((t) => t.name === toolName) ||
      this.getToolDefinitions("GLOBAL").find((t) => t.name === toolName);
    if (!def) {
      return {
        ok: false,
        summary: `Ferramenta "${toolName}" não reconhecida no catálogo ERP.`,
        data: { error: "Unknown tool" },
      };
    }

    if (def.scope === "GLOBAL") {
      if (!context.isSuperAdmin) {
        return {
          ok: false,
          summary:
            "Este recurso é da plataforma e só o suporte pode consultar.",
          data: { error: "Forbidden: plataforma" },
        };
      }
      return { ok: true };
    }

    if (!resolvedCompanyId) {
      return {
        ok: false,
        summary: "Empresa não identificada para esta operação.",
        data: { error: "Tenant não identificado." },
      };
    }

    const perm = TOOL_PERMISSIONS[toolName];
    if (!perm) {
      return {
        ok: false,
        summary: `Ferramenta "${toolName}" sem permissão mapeada — bloqueada por segurança.`,
        data: { error: "Unmapped tool" },
      };
    }

    const ability = this.casl.createForUser(context.user);
    const allowed = perm.field
      ? ability.can(
          toCaslAction(perm.action) as any,
          perm.subject as any,
          perm.field as any,
        )
      : ability.can(toCaslAction(perm.action) as any, perm.subject as any);
    if (!allowed) {
      const role = context.user?.role || "desconhecido";
      return {
        ok: false,
        summary: `Seu perfil (${role}) não tem permissão para esta ação. Peça a um gerente ou administrador.`,
        data: { error: "Forbidden: papel insuficiente" },
      };
    }

    const needsConfirm =
      perm.confirmAlways ||
      (perm.confirmWhen ? perm.confirmWhen(args || {}) : false);
    if (needsConfirm && args?.confirm !== true) {
      return {
        ok: false,
        summary: `Esta ação precisa de confirmação explícita. Confirme com o operador e chame novamente com confirm: true.`,
        data: { error: "Confirmation required", needsConfirmation: true },
      };
    }

    return { ok: true };
  }

  /**
   * Execução segura e isolada por tenant de cada ferramenta chamada pela IA
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: {
      tenantId?: string;
      companyId?: string;
      isSuperAdmin?: boolean;
      user?: any;
    },
  ): Promise<ToolExecutionResult> {
    const { tenantId, companyId, isSuperAdmin } = context;
    const resolvedCompanyId = companyId || tenantId;

    this.logger.log(
      `Executing AI tool "${toolName}" for companyId="${resolvedCompanyId}" with args: ${JSON.stringify(redactToolArgs(args || {}))}`,
    );

    const gate = this.checkToolAccess(
      toolName,
      args || {},
      context,
      resolvedCompanyId,
    );
    if (!gate.ok) {
      return {
        toolName,
        success: false,
        summary: gate.summary,
        data: gate.data,
      };
    }

    try {
      switch (toolName) {
        // ─── 1. CONSULTAR MESAS ───
        case "consultar_mesas": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const statusFilter =
            args.status && args.status !== "ALL" ? args.status : undefined;

          const tables = await this.prisma.table.findMany({
            where: {
              companyId: resolvedCompanyId,
              ...(statusFilter ? { status: statusFilter } : {}),
            },
            orderBy: { number: "asc" },
            include: {
              tableSessions: {
                where: { status: "OPEN" },
                take: 1,
              },
            },
          });

          const total = tables.length;
          const livres = tables.filter((t) => t.status === "FREE").length;
          const ocupadas = tables.filter((t) => t.status === "OCCUPIED").length;
          const conta = tables.filter(
            (t) => t.status === "BILL_REQUESTED",
          ).length;

          return {
            toolName,
            success: true,
            summary: `Consultou ${total} mesas (${livres} livres, ${ocupadas} ocupadas, ${conta} aguardando conta).`,
            data: {
              total,
              livres,
              ocupadas,
              aguardandoConta: conta,
              mesas: tables.map((t) => ({
                id: t.id,
                numero: t.number,
                nome: t.label || `Mesa ${t.number}`,
                capacidade: t.capacity,
                status: t.status,
                temSessaoAberta: t.tableSessions.length > 0,
              })),
            },
          };
        }

        // ─── 2. ABRIR COMANDA MESA ───
        case "abrir_comanda_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const num = Number(args.tableNumber);
          const table = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: num },
          });

          if (!table) {
            return {
              toolName,
              success: false,
              summary: `Mesa ${num} não encontrada no salão.`,
              data: { error: `Mesa ${num} não existe.` },
            };
          }

          let session = await this.prisma.tableSession.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tableId: table.id,
              status: "OPEN",
            },
          });

          if (!session) {
            session = await this.prisma.tableSession.create({
              data: {
                companyId: resolvedCompanyId,
                tableId: table.id,
                status: "OPEN",
                customerCount: args.customerCount || 2,
                comandaName: args.notes || `Mesa ${num}`,
              },
            });
            await this.prisma.table.update({
              where: { id: table.id },
              data: { status: "OCCUPIED" },
            });
          }

          return {
            toolName,
            success: true,
            summary: `Comanda aberta com sucesso para a Mesa ${num}! (Status: Ocupada)`,
            data: {
              sessionId: session.id,
              mesa: num,
              status: "OCCUPIED",
              clientes: session.customerCount,
            },
          };
        }

        // ─── 3. FECHAR CONTA MESA ───
        case "fechar_conta_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const num = Number(args.tableNumber);
          const table = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: num },
          });

          if (!table) throw new Error(`Mesa ${num} não encontrada.`);

          const session = await this.prisma.tableSession.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tableId: table.id,
              status: "OPEN",
            },
            include: { orders: { include: { items: true } } },
          });

          let totalCalculado = 0;
          if (session) {
            totalCalculado =
              session.orders.reduce((acc, o) => acc + (o.totalCents || 0), 0) /
              100;
            // Fecha os pedidos e a comanda
            await this.prisma.order.updateMany({
              where: {
                tableSessionId: session.id,
                status: { notIn: ["CANCELLED"] },
              },
              data: { status: "COMPLETED" },
            });
            await this.prisma.tableSession.update({
              where: { id: session.id },
              data: { status: "CLOSED", closedAt: new Date() },
            });
          }

          // Libera a mesa
          await this.prisma.table.update({
            where: { id: table.id },
            data: { status: "FREE" },
          });

          return {
            toolName,
            success: true,
            summary: `Conta da Mesa ${num} encerrada com sucesso! Total: R$ ${totalCalculado.toFixed(2)}. Mesa liberada.`,
            data: {
              mesa: num,
              totalPago: totalCalculado,
              formaPagamento: args.formaPagamento || "PIX",
              statusMesa: "FREE",
            },
          };
        }

        // ─── 4. LIBERAR MESA ───
        case "liberar_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const num = Number(args.tableNumber);
          const table = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: num },
          });

          if (!table) throw new Error(`Mesa ${num} não encontrada.`);

          await this.prisma.tableSession.updateMany({
            where: {
              companyId: resolvedCompanyId,
              tableId: table.id,
              status: "OPEN",
            },
            data: { status: "CLOSED", closedAt: new Date() },
          });

          await this.prisma.table.update({
            where: { id: table.id },
            data: { status: "FREE" },
          });

          return {
            toolName,
            success: true,
            summary: `Mesa ${num} foi liberada com sucesso e agora está disponível no salão.`,
            data: { mesa: num, status: "FREE" },
          };
        }

        // ─── 5. TRANSFERIR MESA ───
        case "transferir_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const de = Number(args.mesaOrigem);
          const para = Number(args.mesaDestino);

          const tOrigem = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: de },
          });
          const tDestino = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: para },
          });

          if (!tOrigem || !tDestino)
            throw new Error("Mesa de origem ou destino não encontrada.");

          const session = await this.prisma.tableSession.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tableId: tOrigem.id,
              status: "OPEN",
            },
          });

          if (session) {
            await this.prisma.tableSession.update({
              where: { id: session.id },
              data: { tableId: tDestino.id },
            });
            await this.prisma.order.updateMany({
              where: { tableSessionId: session.id },
              data: { tableId: tDestino.id },
            });
          }

          await this.prisma.table.update({
            where: { id: tOrigem.id },
            data: { status: "FREE" },
          });
          await this.prisma.table.update({
            where: { id: tDestino.id },
            data: { status: "OCCUPIED" },
          });

          return {
            toolName,
            success: true,
            summary: `Comanda transferida da Mesa ${de} para a Mesa ${para} com sucesso!`,
            data: { mesaOrigem: de, mesaDestino: para },
          };
        }

        // ─── 6. LANÇAR PEDIDO NA MESA ───
        case "lancar_pedido_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const num = Number(args.tableNumber);
          const pratoNome = String(args.pratoNome).trim();
          const qtd = Number(args.quantidade) || 1;

          const table = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: num },
          });
          if (!table) throw new Error(`Mesa ${num} não encontrada.`);

          // Encontra o produto no cardápio de forma inteligente
          const product = await this.findProductByName(
            resolvedCompanyId,
            pratoNome,
            true,
          );

          if (!product) {
            return {
              toolName,
              success: false,
              summary: `Produto "${pratoNome}" não foi encontrado no cardápio ativo.`,
              data: { error: "Produto não cadastrado ou inativo." },
            };
          }

          // Obtém ou abre sessão
          let session = await this.prisma.tableSession.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tableId: table.id,
              status: "OPEN",
            },
          });

          if (!session) {
            session = await this.prisma.tableSession.create({
              data: {
                companyId: resolvedCompanyId,
                tableId: table.id,
                status: "OPEN",
                comandaName: `Mesa ${num}`,
                customerCount: 2,
              },
            });
            await this.prisma.table.update({
              where: { id: table.id },
              data: { status: "OCCUPIED" },
            });
          }

          const valorTotalCents = Math.round(product.salePriceCents * qtd);

          // Cria o pedido
          const maxOrder = await this.prisma.order.findFirst({
            where: { companyId: resolvedCompanyId },
            orderBy: { orderNumber: "desc" },
            select: { orderNumber: true },
          });
          const nextNumber = (maxOrder?.orderNumber || 100) + 1;

          const order = await this.prisma.order.create({
            data: {
              companyId: resolvedCompanyId,
              tenantId: resolvedCompanyId,
              tableId: table.id,
              tableSessionId: session.id,
              orderNumber: nextNumber,
              origin: "WAITER",
              status: "PENDING",
              subtotalCents: valorTotalCents,
              totalCents: valorTotalCents,
              notes: args.observacao || null,
              items: {
                create: [
                  {
                    productId: product.id,
                    quantity: qtd,
                    unitPriceCents: product.salePriceCents,
                    unitPrice: product.salePriceCents,
                    totalPrice: valorTotalCents,
                    notes: args.observacao || null,
                  },
                ],
              },
            },
          });

          // Abate quantidade do estoque se controlado
          await this.prisma.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: qtd } },
          });

          return {
            toolName,
            success: true,
            summary: `Lançado com sucesso: ${qtd}x ${product.name} (R$ ${(valorTotalCents / 100).toFixed(2)}) na Mesa ${num}! Pedido #${nextNumber} enviado à Cozinha.`,
            data: {
              pedidoId: order.id,
              numeroPedido: nextNumber,
              mesa: num,
              item: product.name,
              quantidade: qtd,
              total: valorTotalCents / 100,
            },
          };
        }

        // ─── 7. CONSULTAR PEDIDOS DA MESA ───
        case "consultar_pedidos_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const num = Number(args.tableNumber);
          const table = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: num },
          });

          if (!table) throw new Error(`Mesa ${num} não encontrada.`);

          const session = await this.prisma.tableSession.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tableId: table.id,
              status: "OPEN",
            },
            include: {
              orders: {
                include: { items: { include: { product: true } } },
              },
            },
          });

          if (!session || session.orders.length === 0) {
            return {
              toolName,
              success: true,
              summary: `Mesa ${num} está aberta, mas ainda não possui itens lançados.`,
              data: { mesa: num, totalItens: 0, valorTotal: 0, itens: [] },
            };
          }

          const itensAgrupados: any[] = [];
          let totalCents = 0;

          for (const ord of session.orders) {
            totalCents += ord.totalCents || 0;
            for (const it of ord.items) {
              itensAgrupados.push({
                prato: it.product?.name || "Item",
                quantidade: it.quantity,
                unitario: (it.unitPriceCents || 0) / 100,
                subtotal: (it.totalPrice || 0) / 100,
                statusPedido: ord.status,
              });
            }
          }

          return {
            toolName,
            success: true,
            summary: `Mesa ${num} possui ${itensAgrupados.length} itens lançados. Total acumulado: R$ ${(totalCents / 100).toFixed(2)}.`,
            data: {
              mesa: num,
              totalGeral: totalCents / 100,
              itens: itensAgrupados,
            },
          };
        }

        // ─── 8. CARDÁPIO ───
        case "consultar_cardapio": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const termo = args.termoBusca
            ? String(args.termoBusca).toLowerCase()
            : null;

          const categories = await this.prisma.productCategory.findMany({
            where: { companyId: resolvedCompanyId, active: true },
            orderBy: { order: "asc" },
            include: {
              products: {
                where: {
                  isActive: true,
                  ...(termo ? { name: { contains: termo } } : {}),
                },
              },
            },
          });

          const totalPratos = categories.reduce(
            (acc, cat) => acc + cat.products.length,
            0,
          );

          return {
            toolName,
            success: true,
            summary: `Consultou cardápio: ${totalPratos} itens distribuídos em ${categories.length} categorias.`,
            data: {
              totalCategorias: categories.length,
              totalItens: totalPratos,
              categorias: categories.map((c) => ({
                id: c.id,
                nome: c.name,
                itens: c.products.map((p) => ({
                  id: p.id,
                  nome: p.name,
                  preco: p.salePriceCents / 100,
                  descricao: p.description,
                  imageUrl: p.imageUrl,
                  saldoEstoque: p.stockQuantity,
                })),
              })),
            },
          };
        }

        // ─── 9. ADICIONAR PRATO NO CARDÁPIO ───
        case "adicionar_prato_cardapio": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const nome = String(args.nome).trim();
          const preco = Number(args.preco);
          const catNome = String(args.categoria).trim();

          let cat = await this.prisma.productCategory.findFirst({
            where: { companyId: resolvedCompanyId, name: catNome },
          });

          if (!cat) {
            cat = await this.prisma.productCategory.create({
              data: {
                companyId: resolvedCompanyId,
                name: catNome,
                active: true,
                order: 10,
              },
            });
          }

          const product = await this.prisma.product.create({
            data: {
              companyId: resolvedCompanyId,
              tenantId: resolvedCompanyId,
              categoryId: cat.id,
              name: nome,
              salePriceCents: Math.round(preco * 100),
              description: args.descricao || null,
              unit: "UN",
              stockQuantity: 20,
              minStockAlert: 5,
              isActive: true,
            },
          });

          return {
            toolName,
            success: true,
            summary: `Prato "${nome}" cadastrado com sucesso por R$ ${preco.toFixed(2)} na categoria "${catNome}".`,
            data: {
              id: product.id,
              nome: product.name,
              preco: product.salePriceCents / 100,
              categoria: cat.name,
            },
          };
        }

        // ─── 10. ALTERAR PREÇO DO PRATO ───
        case "alterar_preco_prato": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const pratoNome = String(args.pratoNome).trim();
          const novoPreco = Number(args.novoPreco);

          const product = await this.findProductByName(
            resolvedCompanyId,
            pratoNome,
            false,
          );

          if (!product) {
            return {
              toolName,
              success: false,
              summary: `Prato "${pratoNome}" não foi encontrado no cardápio.`,
              data: { error: `Prato "${pratoNome}" não cadastrado.` },
            };
          }

          const precoAntigo = product.salePriceCents / 100;
          await this.prisma.product.update({
            where: { id: product.id },
            data: { salePriceCents: Math.round(novoPreco * 100) },
          });

          return {
            toolName,
            success: true,
            summary: `Preço do item "${product.name}" atualizado de R$ ${precoAntigo.toFixed(2)} para R$ ${novoPreco.toFixed(2)}!`,
            data: {
              prato: product.name,
              precoAnterior: precoAntigo,
              novoPreco,
            },
          };
        }

        // ─── 11. PAUSAR / ATIVAR PRATO ───
        case "pausar_prato_cardapio": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const pratoNome = String(args.pratoNome).trim();
          const ativo = args.ativo !== undefined ? !!args.ativo : false;

          const product = await this.findProductByName(
            resolvedCompanyId,
            pratoNome,
            false,
          );

          if (!product) {
            return {
              toolName,
              success: false,
              summary: `Prato "${pratoNome}" não foi encontrado no cardápio.`,
              data: { error: `Prato "${pratoNome}" não cadastrado.` },
            };
          }

          await this.prisma.product.update({
            where: { id: product.id },
            data: { isActive: ativo },
          });

          return {
            toolName,
            success: true,
            summary: `O prato "${product.name}" foi marcado como ${ativo ? "DISPONÍVEL ✅" : "ESGOTADO / PAUSADO ⏸️"} no cardápio.`,
            data: { prato: product.name, disponivel: ativo },
          };
        }

        // ─── 12. AJUSTAR ESTOQUE ───
        case "ajustar_estoque": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const prodNome = String(args.produtoNome).trim();
          const qtd = Number(args.quantidade);

          const product = await this.findProductByName(
            resolvedCompanyId,
            prodNome,
            false,
          );

          if (!product) {
            return {
              toolName,
              success: false,
              summary: `Produto "${prodNome}" não foi encontrado no inventário.`,
              data: { error: `Produto "${prodNome}" não cadastrado.` },
            };
          }

          const novoSaldo = Math.max(0, product.stockQuantity + qtd);
          await this.prisma.product.update({
            where: { id: product.id },
            data: { stockQuantity: novoSaldo },
          });

          // Paridade com a rota: todo ajuste vira movimento rastreado no Kardex.
          try {
            await this.prisma.stockMovement.create({
              data: {
                tenantId: resolvedCompanyId as string,
                productId: product.id,
                type: "ADJUSTMENT",
                quantity: qtd,
                balanceAfter: novoSaldo,
                notes: args.motivo
                  ? String(args.motivo).slice(0, 300)
                  : "Ajuste via Copiloto IA",
                operatorId: context.user?.sub || context.user?.id || null,
              },
            });
          } catch (err: any) {
            this.logger.warn(
              `Kardex do ajuste IA falhou (saldo já aplicado): ${err?.message}`,
            );
          }

          return {
            toolName,
            success: true,
            summary: `Estoque de "${product.name}" ajustado (${qtd > 0 ? "+" : ""}${qtd}). Novo saldo: ${novoSaldo} unidades.`,
            data: {
              produto: product.name,
              saldoAnterior: product.stockQuantity,
              novoSaldo,
              motivo: args.motivo || "Ajuste via Copiloto IA",
            },
          };
        }

        // ─── 13. APLICAR DESCONTO NA MESA ───
        case "aplicar_desconto_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const num = Number(args.tableNumber);
          const table = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number: num },
          });

          if (!table) throw new Error(`Mesa ${num} não encontrada.`);

          const session = await this.prisma.tableSession.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tableId: table.id,
              status: "OPEN",
            },
            include: { orders: true },
          });

          if (!session || session.orders.length === 0) {
            return {
              toolName,
              success: false,
              summary: `Mesa ${num} não possui pedidos em aberto para receber desconto.`,
              data: { error: `Mesa ${num} não possui pedidos em aberto.` },
            };
          }

          const lastOrder = session.orders[session.orders.length - 1];
          let descontoCents = 0;

          if (args.valorDescontoReais) {
            descontoCents = Math.round(Number(args.valorDescontoReais) * 100);
          } else if (args.percentualDesconto) {
            descontoCents = Math.round(
              (lastOrder.totalCents * Number(args.percentualDesconto)) / 100,
            );
          }

          const novoTotal = Math.max(0, lastOrder.totalCents - descontoCents);
          await this.prisma.order.update({
            where: { id: lastOrder.id },
            data: { discountCents: descontoCents, totalCents: novoTotal },
          });

          return {
            toolName,
            success: true,
            summary: `Desconto de R$ ${(descontoCents / 100).toFixed(2)} aplicado na Mesa ${num}! Novo valor do pedido: R$ ${(novoTotal / 100).toFixed(2)}.`,
            data: {
              mesa: num,
              descontoReais: descontoCents / 100,
              novoTotal: novoTotal / 100,
            },
          };
        }

        // ─── 14. ATUALIZAR STATUS DO PEDIDO NA COZINHA ───
        case "atualizar_status_pedido_cozinha": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const novoStatus = args.novoStatus;
          const tableNum = args.tableNumber
            ? Number(args.tableNumber)
            : undefined;

          let orderToUpdate: any = null;

          if (tableNum) {
            const table = await this.prisma.table.findFirst({
              where: { companyId: resolvedCompanyId, number: tableNum },
            });
            if (table) {
              orderToUpdate = await this.prisma.order.findFirst({
                where: {
                  companyId: resolvedCompanyId,
                  tableId: table.id,
                  status: { in: ["PENDING", "PREPARING"] },
                },
                orderBy: { createdAt: "desc" },
              });
            }
          }

          if (!orderToUpdate) {
            orderToUpdate = await this.prisma.order.findFirst({
              where: {
                companyId: resolvedCompanyId,
                status: { in: ["PENDING", "PREPARING"] },
              },
              orderBy: { createdAt: "desc" },
            });
          }

          if (!orderToUpdate) {
            return {
              toolName,
              success: false,
              summary:
                "Nenhum pedido pendente ou em preparo encontrado para atualizar.",
              data: { error: "Sem pedidos pendentes" },
            };
          }

          await this.prisma.order.update({
            where: { id: orderToUpdate.id },
            data: { status: novoStatus },
          });

          return {
            toolName,
            success: true,
            summary: `Pedido #${orderToUpdate.orderNumber} atualizado para "${novoStatus}" com sucesso!`,
            data: {
              pedidoId: orderToUpdate.id,
              numero: orderToUpdate.orderNumber,
              status: novoStatus,
            },
          };
        }

        // ─── 15. COZINHA GERAL ───
        case "consultar_pedidos_cozinha": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const status = args.status;

          const where: any = { companyId: resolvedCompanyId };
          if (
            status === "PENDING" ||
            status === "PREPARING" ||
            status === "READY"
          ) {
            where.status = status;
          } else {
            where.status = { in: ["PENDING", "PREPARING", "READY"] };
          }

          const orders = await this.prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
              items: { include: { product: true } },
              table: true,
            },
          });

          return {
            toolName,
            success: true,
            summary: `Consultou ${orders.length} pedidos na cozinha.`,
            data: {
              total: orders.length,
              pedidos: orders.map((o) => ({
                id: o.id,
                numero: String(o.orderNumber),
                status: o.status,
                mesa: o.table?.number || "Balcão",
                total: (o.totalCents || 0) / 100,
                itens: o.items.map(
                  (i) => `${i.quantity}x ${i.product?.name || "Item"}`,
                ),
                criadoEm: o.createdAt,
              })),
            },
          };
        }

        // ─── 16. ESTOQUE GERAL ───
        case "consultar_estoque": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const products = await this.prisma.product.findMany({
            where: {
              companyId: resolvedCompanyId,
              isActive: true,
              ...(args.termo ? { name: { contains: String(args.termo) } } : {}),
            },
            orderBy: { stockQuantity: "asc" },
            take: 50,
          });

          const criticos = products.filter(
            (p) => p.stockQuantity <= (p.minStockAlert || 0),
          );
          const lista = args.apenasCriticos ? criticos : products;

          return {
            toolName,
            success: true,
            summary: `Consultou estoque: ${products.length} itens cadastrados, sendo ${criticos.length} com estoque crítico.`,
            data: {
              totalProdutos: products.length,
              totalCriticos: criticos.length,
              produtos: lista.slice(0, 15).map((p) => ({
                id: p.id,
                nome: p.name,
                saldoAtual: p.stockQuantity,
                minimo: p.minStockAlert,
                critico: p.stockQuantity <= (p.minStockAlert || 0),
                precoVenda: p.salePriceCents / 100,
              })),
            },
          };
        }

        // ─── 17. VENDAS & FINANCEIRO HOJE ───
        case "resumo_vendas_hoje": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);

          const ordersHoje = await this.prisma.order.findMany({
            where: {
              companyId: resolvedCompanyId,
              createdAt: { gte: hoje },
              status: { notIn: ["CANCELLED"] },
            },
            include: { items: true },
          });

          const faturamentoCents = ordersHoje.reduce(
            (acc, o) => acc + (o.totalCents || 0),
            0,
          );
          const faturamento = faturamentoCents / 100;
          const totalPedidos = ordersHoje.length;
          const ticketMedio = totalPedidos > 0 ? faturamento / totalPedidos : 0;

          return {
            toolName,
            success: true,
            summary: `Hoje foram realizados ${totalPedidos} pedidos, totalizando faturamento de R$ ${faturamento.toFixed(2)}.`,
            data: {
              data: hoje.toISOString().split("T")[0],
              totalPedidos,
              faturamentoTotal: faturamento,
              ticketMedio,
              statusMaisComum: totalPedidos > 0 ? "CONCLUÍDO" : "SEM_PEDIDOS",
            },
          };
        }

        // ─── 18. SUPERADMIN GLOBAL ───
        case "metricas_plataforma_global": {
          const tenantsCount = await this.prisma.tenant.count();
          const activeTenants = await this.prisma.tenant.count({
            where: { status: "ACTIVE" },
          });
          const usersCount = await this.prisma.user.count();

          return {
            toolName,
            success: true,
            summary: `Plataforma SaaS possui ${tenantsCount} empresas cadastradas (${activeTenants} ativas) e ${usersCount} usuários.`,
            data: {
              totalEmpresas: tenantsCount,
              empresasAtivas: activeTenants,
              totalUsuarios: usersCount,
            },
          };
        }

        case "resumo_tickets_suporte": {
          const ticketsPendentes = await this.prisma.ticket.count({
            where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          });
          const totalTickets = await this.prisma.ticket.count();

          return {
            toolName,
            success: true,
            summary: `Existem ${ticketsPendentes} chamados de suporte em aberto de um total de ${totalTickets}.`,
            data: {
              pendentes: ticketsPendentes,
              total: totalTickets,
            },
          };
        }

        // ─── TEMA & BRANDING ───
        case "alterar_tema_painel": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          let hex = typeof args.hex === "string" ? args.hex.trim() : "";
          let label = "";

          if (!hex && args.colorName) {
            const resolved = resolveColor(String(args.colorName));
            if (!resolved) {
              return {
                toolName,
                success: false,
                summary: `Não reconheci a cor "${args.colorName}". Paletas disponíveis: ${Object.values(
                  THEME_PALETTES,
                )
                  .map((p) => p.label)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(
                    ", ",
                  )}. Você também pode informar um código hexadecimal, ex: #059669.`,
                data: { error: "Cor não reconhecida" },
              };
            }
            hex = resolved.hex;
            label = resolved.label;
          }

          if (!isValidHex(hex)) {
            return {
              toolName,
              success: false,
              summary:
                "Preciso de uma cor válida: um nome conhecido (azul safira, verde esmeralda, bordô...) ou um hexadecimal no formato #RRGGBB.",
              data: { error: "Hex inválido" },
            };
          }

          const company = await this.prisma.company.findUnique({
            where: { id: resolvedCompanyId },
            select: { branding: true },
          });
          if (!company) throw new Error("Empresa não encontrada.");

          const current = this.parseBranding(company.branding);
          const next = {
            ...current,
            primaryColor: hex,
            colorLabel: label || current.colorLabel || hex,
            ...(typeof args.darkMode === "boolean"
              ? { darkMode: args.darkMode }
              : {}),
          };

          await this.prisma.company.update({
            where: { id: resolvedCompanyId },
            data: { branding: JSON.stringify(next) },
          });

          const modeNote =
            typeof args.darkMode === "boolean"
              ? args.darkMode
                ? " no modo escuro"
                : " no modo claro"
              : "";

          return {
            toolName,
            success: true,
            summary: `Tema atualizado para ${next.colorLabel} (${hex})${modeNote}. A cor já está sendo aplicada no painel.`,
            data: next,
            // O frontend escuta esta ação e aplica as CSS vars sem recarregar.
            clientAction: { type: "CHANGE_THEME", payload: next },
          };
        }

        case "consultar_tema_painel": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const company = await this.prisma.company.findUnique({
            where: { id: resolvedCompanyId },
            select: { branding: true },
          });
          if (!company) throw new Error("Empresa não encontrada.");

          const branding = this.parseBranding(company.branding);
          const palettes = Object.values(THEME_PALETTES)
            .map((p) => `${p.label} (${p.hex})`)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", ");

          return {
            toolName,
            success: true,
            summary: `Cor atual: ${branding.colorLabel || branding.primaryColor || "padrão do sistema"}${
              branding.primaryColor ? ` (${branding.primaryColor})` : ""
            }. Paletas disponíveis: ${palettes}.`,
            data: { branding, palettes: THEME_PALETTES },
          };
        }

        // ─── TAREFAS & ROTINAS ───
        case "consultar_tarefas": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const statusFilter =
            args.status && args.status !== "ALL"
              ? String(args.status)
              : undefined;
          const tasks = await this.prisma.task.findMany({
            where: {
              companyId: resolvedCompanyId,
              ...(statusFilter ? { status: statusFilter } : {}),
              ...(args.assignedRole
                ? { assignedRole: String(args.assignedRole) }
                : {}),
              ...(args.priority ? { priority: String(args.priority) } : {}),
            },
            orderBy: [{ status: "asc" }, { dueDate: "asc" }],
            take: 60,
          });

          if (tasks.length === 0) {
            return {
              toolName,
              success: true,
              summary: "Nenhuma tarefa encontrada com esses filtros.",
              data: { tasks: [], total: 0 },
            };
          }

          const pendentes = tasks.filter(
            (t) => t.status === "PENDING" || t.status === "IN_PROGRESS",
          );
          return {
            toolName,
            success: true,
            summary: `${tasks.length} tarefa(s) encontrada(s) — ${pendentes.length} pendente(s).`,
            data: {
              total: tasks.length,
              tasks: tasks.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                assignedRole: t.assignedRole,
                dueTime: t.dueTime,
                description: t.description,
              })),
            },
          };
        }

        case "criar_tarefa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          if (!args.title) throw new Error("O título da tarefa é obrigatório.");

          const dueTime = args.dueTime ? String(args.dueTime) : null;
          if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
            return {
              toolName,
              success: false,
              summary: `Horário "${dueTime}" inválido. Use o formato HH:MM, por exemplo 19:00.`,
              data: { error: "Horário inválido" },
            };
          }

          const task = await this.prisma.task.create({
            data: {
              companyId: resolvedCompanyId,
              tenantId: tenantId || null,
              title: String(args.title).trim(),
              description: args.description ? String(args.description) : null,
              assignedRole: args.assignedRole
                ? String(args.assignedRole)
                : "Todos",
              dueTime,
              priority: args.priority ? String(args.priority) : "NORMAL",
              frequency: args.frequency ? String(args.frequency) : "TODAY",
              status: "PENDING",
              createdById: context.user?.sub || context.user?.id || null,
            },
          });

          return {
            toolName,
            success: true,
            summary: `Tarefa "${task.title}" criada para ${task.assignedRole}${
              task.dueTime ? ` às ${task.dueTime}` : ""
            } com prioridade ${task.priority}.`,
            data: {
              id: task.id,
              title: task.title,
              dueTime: task.dueTime,
              priority: task.priority,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["tasks"] },
            },
          };
        }

        case "concluir_tarefa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          let task = null as any;

          if (args.taskId) {
            task = await this.prisma.task.findFirst({
              where: { id: String(args.taskId), companyId: resolvedCompanyId },
            });
          }

          if (!task && args.search) {
            const term = normalizeColorName(String(args.search));
            const candidates = await this.prisma.task.findMany({
              where: {
                companyId: resolvedCompanyId,
                status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] },
              },
              orderBy: { dueDate: "asc" },
            });
            // Comparação sem acento/caixa: "organizar mesas" acha "Organizar Mesas".
            task =
              candidates.find((c) =>
                normalizeColorName(c.title).includes(term),
              ) ||
              candidates.find((c) =>
                term
                  .split(" ")
                  .filter((w) => w.length >= 3)
                  .some((w) => normalizeColorName(c.title).includes(w)),
              );
          }

          if (!task) {
            return {
              toolName,
              success: false,
              summary: `Não encontrei a tarefa${
                args.search ? ` "${args.search}"` : ""
              } entre as pendentes. Quer que eu liste as tarefas abertas?`,
              data: { error: "Tarefa não encontrada" },
            };
          }

          if (task.status === "COMPLETED") {
            return {
              toolName,
              success: true,
              summary: `A tarefa "${task.title}" já estava concluída.`,
              data: { id: task.id, title: task.title, status: task.status },
            };
          }

          const updated = await this.prisma.task.update({
            where: { id: task.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
              completedById: context.user?.sub || context.user?.id || null,
              completedByName: args.completedByName
                ? String(args.completedByName)
                : context.user?.name || null,
            },
          });

          return {
            toolName,
            success: true,
            summary: `Tarefa "${updated.title}" concluída${
              updated.completedByName ? ` por ${updated.completedByName}` : ""
            }.`,
            data: {
              id: updated.id,
              title: updated.title,
              status: updated.status,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["tasks"] },
            },
          };
        }

        // ─── EQUIPE & STAFF ───
        case "consultar_equipe": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const staff = await this.prisma.user.findMany({
            where: {
              companyId: resolvedCompanyId,
              ...(args.activeOnly === true ? { isActive: true } : {}),
              ...(args.role
                ? { position: { contains: String(args.role) } }
                : {}),
            },
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
            take: 100,
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              position: true,
              role: true,
              isActive: true,
            },
          });

          if (staff.length === 0) {
            return {
              toolName,
              success: true,
              summary: "Nenhum colaborador encontrado com esses filtros.",
              data: { staff: [], total: 0 },
            };
          }

          return {
            toolName,
            success: true,
            summary: `${staff.length} colaborador(es) — ${staff.filter((s) => s.isActive).length} ativo(s).`,
            data: { total: staff.length, staff },
          };
        }

        case "cadastrar_funcionario": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          if (!args.name)
            throw new Error("O nome do colaborador é obrigatório.");

          const email = args.email
            ? String(args.email).trim().toLowerCase()
            : null;

          // `email` é @unique global no schema — sem esta checagem o usuário
          // recebia um erro cru de constraint em vez de uma mensagem clara.
          if (email) {
            const dup = await this.prisma.user.findUnique({
              where: { email },
              select: { id: true },
            });
            if (dup) {
              return {
                toolName,
                success: false,
                summary: `Já existe um usuário cadastrado com o e-mail ${email}.`,
                data: { error: "E-mail já cadastrado" },
              };
            }
          }

          // `passwordHash` é obrigatório no schema. Sem senha informada,
          // geramos uma aleatória forte — o colaborador entra por redefinição
          // de senha. Nunca gravamos string vazia nem senha previsível.
          const rawPassword = args.password
            ? String(args.password)
            : crypto.randomBytes(18).toString("base64url");

          const created = await this.prisma.user.create({
            data: {
              name: String(args.name).trim(),
              email,
              phone: args.phone
                ? String(args.phone).replace(/\D/g, "") || null
                : null,
              position: args.role ? String(args.role) : null,
              role: "TENANT_EMPLOYEE",
              companyId: resolvedCompanyId,
              tenantId: tenantId || null,
              isActive: true,
              passwordHash: await argon2.hash(rawPassword),
            },
            select: { id: true, name: true, email: true, position: true },
          });

          return {
            toolName,
            success: true,
            summary: `Colaborador ${created.name} cadastrado${
              created.position ? ` como ${created.position}` : ""
            }.${
              args.password
                ? ""
                : " Nenhuma senha foi informada — uma senha aleatória foi gerada, então ele precisará redefinir o acesso."
            }`,
            data: created,
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["tenant-employees"] },
            },
          };
        }

        // ─── MESAS & SALÃO ───
        case "adicionar_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const number = Number(args.number);
          if (!Number.isFinite(number) || number <= 0) {
            return {
              toolName,
              success: false,
              summary: "Preciso de um número de mesa válido (ex: 16).",
              data: { error: "Número inválido" },
            };
          }

          const capacity = Number(args.capacity) || 4;
          if (capacity <= 0) {
            return {
              toolName,
              success: false,
              summary: "A capacidade da mesa deve ser maior que zero.",
              data: { error: "Capacidade inválida" },
            };
          }

          // O número da mesa é o identificador visível no salão: duplicar
          // tornaria duas mesas indistinguíveis para a equipe.
          const existing = await this.prisma.table.findFirst({
            where: { companyId: resolvedCompanyId, number },
            select: { id: true },
          });
          if (existing) {
            return {
              toolName,
              success: false,
              summary: `Já existe uma mesa com o número ${number}. Escolha outro número.`,
              data: { error: "Mesa duplicada" },
            };
          }

          const table = await this.prisma.table.create({
            data: {
              companyId: resolvedCompanyId,
              number,
              // `label` e `qrTokenHash` são obrigatórios no schema. O token é
              // gerado como no fluxo normal de criação de mesa (restaurant.service).
              label: args.area
                ? `Mesa ${number} (${args.area})`
                : `Mesa ${String(number).padStart(2, "0")}`,
              capacity,
              status: "FREE",
              qrTokenHash: crypto
                .createHash("sha256")
                .update(crypto.randomBytes(24).toString("hex"))
                .digest("hex"),
            },
          });

          return {
            toolName,
            success: true,
            summary: `Mesa ${table.number} criada${args.area ? ` em ${args.area}` : ""} com capacidade para ${table.capacity} pessoas.`,
            data: {
              id: table.id,
              number: table.number,
              capacity: table.capacity,
              label: table.label,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["restaurant-tables"] },
            },
          };
        }

        case "remover_mesa": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const wantsAll =
            args.all === true ||
            (args.number === undefined && args.tableId === undefined);

          // ─── Exclusão em lote ───
          // Antes, um pedido no plural ("exclua as mesas") caía no caminho de
          // mesa única, não achava nada e devolvia "Não encontrei a mesa" — a
          // IA então relatava falha mesmo havendo mesas removíveis.
          if (wantsAll) {
            const all = await this.prisma.table.findMany({
              where: { companyId: resolvedCompanyId },
              select: { id: true, number: true, label: true, status: true },
              orderBy: { number: "asc" },
            });

            if (all.length === 0) {
              return {
                toolName,
                success: true,
                summary: "Não há mesas cadastradas neste salão.",
                data: { removed: [], skipped: [] },
              };
            }

            const removable = all.filter((t) => t.status === "FREE");
            const blocked = all.filter((t) => t.status !== "FREE");

            if (removable.length === 0) {
              return {
                toolName,
                success: false,
                summary: `Nenhuma mesa pôde ser removida: as ${all.length} mesa(s) estão ocupadas ou aguardando conta (${blocked
                  .map((t) => t.number)
                  .join(", ")}). Feche as contas e libere antes de excluir.`,
                data: { removed: [], skipped: blocked },
              };
            }

            await this.prisma.table.deleteMany({
              where: { id: { in: removable.map((t) => t.id) } },
            });

            const blockedNote =
              blocked.length > 0
                ? ` ${blocked.length} mesa(s) foram mantidas por estarem ocupadas (${blocked
                    .map((t) => t.number)
                    .join(", ")}).`
                : "";

            return {
              toolName,
              success: true,
              summary: `${removable.length} mesa(s) removida(s): ${removable
                .map((t) => t.number)
                .join(", ")}.${blockedNote}`,
              data: {
                removed: removable.map((t) => ({
                  id: t.id,
                  number: t.number,
                  label: t.label,
                })),
                skipped: blocked.map((t) => ({
                  id: t.id,
                  number: t.number,
                  status: t.status,
                })),
              },
              clientAction: {
                type: "REFRESH_DATA",
                payload: { queries: ["restaurant-tables"] },
              },
            };
          }

          // ─── Exclusão de uma mesa específica ───
          let table = null as any;
          if (args.tableId) {
            table = await this.prisma.table.findFirst({
              where: { id: String(args.tableId), companyId: resolvedCompanyId },
            });
          }
          if (!table && args.number !== undefined) {
            table = await this.prisma.table.findFirst({
              where: {
                companyId: resolvedCompanyId,
                number: Number(args.number),
              },
            });
          }
          if (!table) {
            const existing = await this.prisma.table.findMany({
              where: { companyId: resolvedCompanyId },
              select: { number: true },
              orderBy: { number: "asc" },
            });
            const available =
              existing.map((t) => t.number).join(", ") || "nenhuma";

            return {
              toolName,
              success: false,
              summary: `Não encontrei a mesa ${
                args.number !== undefined
                  ? args.number
                  : "(número não informado)"
              }. Mesas existentes: ${available}.`,
              data: { error: "Mesa não encontrada", available },
            };
          }

          // Remover mesa ocupada perderia a comanda aberta e o consumo lançado.
          if (table.status !== "FREE") {
            return {
              toolName,
              success: false,
              summary: `A mesa ${table.number} está com status ${table.status} e não pode ser removida. Feche a conta e libere a mesa primeiro.`,
              data: {
                error: "Mesa ocupada",
                number: table.number,
                status: table.status,
              },
            };
          }

          await this.prisma.table.delete({ where: { id: table.id } });

          return {
            toolName,
            success: true,
            summary: `Mesa ${table.number} removida do salão.`,
            data: { id: table.id, number: table.number },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["restaurant-tables"] },
            },
          };
        }

        // ─── NOTAS DE COMPRA ───
        case "criar_nota_compra": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const rawItems = Array.isArray(args.items) ? args.items : [];
          const items = rawItems
            .filter((i: any) => i && (i.name || typeof i === "string"))
            .map((i: any) => {
              const name = String(typeof i === "string" ? i : i.name).trim();
              const qty = i?.quantity !== undefined ? Number(i.quantity) : null;
              const unit = i?.unit ? String(i.unit) : "";
              return {
                itemName: name,
                quantity:
                  qty && Number.isFinite(qty)
                    ? `${qty}${unit ? ` ${unit}` : ""}`
                    : unit || "a definir",
              };
            })
            .filter((i: any) => i.itemName);

          if (items.length === 0) {
            return {
              toolName,
              success: false,
              summary:
                "Preciso de pelo menos um insumo para montar a nota de compra.",
              data: { error: "Sem itens" },
            };
          }

          const note = await this.prisma.purchaseNote.create({
            data: {
              companyId: resolvedCompanyId,
              tenantId: tenantId || null,
              title: args.title ? String(args.title) : "Nota de Compra",
              status: "PENDING",
              notes: args.notes ? String(args.notes) : null,
              createdByName: context.user?.name || null,
              items: { create: items },
            },
            include: { items: true },
          });

          return {
            toolName,
            success: true,
            summary: `Nota de compra criada com ${note.items.length} item(ns): ${note.items
              .map((i) => i.itemName)
              .join(", ")}.`,
            data: {
              id: note.id,
              title: note.title,
              items: note.items.map((i) => i.itemName),
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["purchase-notes"] },
            },
          };
        }

        case "consultar_notas_compra": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          const statusFilter =
            args.status && String(args.status).toUpperCase() !== "ALL"
              ? String(args.status).toUpperCase()
              : undefined;

          const notes = await this.prisma.purchaseNote.findMany({
            where: {
              companyId: resolvedCompanyId,
              ...(statusFilter ? { status: statusFilter } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 40,
            include: { items: true },
          });

          if (notes.length === 0) {
            return {
              toolName,
              success: true,
              summary: "Nenhuma nota de compra encontrada.",
              data: { notes: [], total: 0 },
            };
          }

          return {
            toolName,
            success: true,
            summary: `${notes.length} nota(s) de compra — ${notes.filter((n) => n.status === "PENDING").length} pendente(s).`,
            data: {
              total: notes.length,
              notes: notes.map((n) => ({
                id: n.id,
                title: n.title,
                status: n.status,
                itemCount: n.items.length,
                items: n.items.map((i) => `${i.itemName} (${i.quantity})`),
                createdAt: n.createdAt,
              })),
            },
          };
        }

        // ─── CARDÁPIO: CATEGORIAS E REMOÇÃO ───
        case "criar_categoria_cardapio": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          if (!args.name) throw new Error("O nome da categoria é obrigatório.");

          const name = String(args.name).trim();
          const existing = await this.prisma.productCategory.findFirst({
            where: { companyId: resolvedCompanyId, name: { equals: name } },
            select: { id: true },
          });
          if (existing) {
            return {
              toolName,
              success: false,
              summary: `A categoria "${name}" já existe no cardápio.`,
              data: { error: "Categoria duplicada" },
            };
          }

          const category = await this.prisma.productCategory.create({
            data: {
              companyId: resolvedCompanyId,
              tenantId: tenantId || null,
              name,
              active: true,
            },
          });

          return {
            toolName,
            success: true,
            summary: `Categoria "${category.name}" criada no cardápio.`,
            data: { id: category.id, name: category.name },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["pos-products", "product-categories"] },
            },
          };
        }

        case "remover_prato_cardapio": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");

          let product = null as any;
          if (args.productId) {
            product = await this.prisma.product.findFirst({
              where: {
                id: String(args.productId),
                companyId: resolvedCompanyId,
              },
            });
          }
          if (!product && args.search) {
            product = await this.findProductByName(
              resolvedCompanyId,
              String(args.search),
              false,
            );
          }
          if (!product) {
            return {
              toolName,
              success: false,
              summary: `Não encontrei o prato${
                args.search ? ` "${args.search}"` : ""
              } no cardápio.`,
              data: { error: "Prato não encontrado" },
            };
          }

          // Padrão é desativar: preserva o histórico de vendas que referencia o
          // produto. Exclusão definitiva só quando pedida explicitamente.
          if (args.permanent === true) {
            const sold = await this.prisma.orderItem.count({
              where: { productId: product.id },
            });
            if (sold > 0) {
              return {
                toolName,
                success: false,
                summary: `O prato "${product.name}" já tem ${sold} venda(s) registrada(s) e não pode ser excluído — o histórico seria perdido. Vou desativá-lo em vez disso.`,
                data: { error: "Produto com histórico" },
              };
            }
            await this.prisma.product.delete({ where: { id: product.id } });
            return {
              toolName,
              success: true,
              summary: `Prato "${product.name}" excluído do cardápio.`,
              data: { id: product.id, name: product.name, deleted: true },
              clientAction: {
                type: "REFRESH_DATA",
                payload: { queries: ["pos-products"] },
              },
            };
          }

          await this.prisma.product.update({
            where: { id: product.id },
            data: { isActive: false },
          });

          return {
            toolName,
            success: true,
            summary: `Prato "${product.name}" desativado do cardápio. Ele sai da venda mas o histórico é preservado.`,
            data: { id: product.id, name: product.name, isActive: false },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["pos-products"] },
            },
          };
        }

        // ─── CALENDÁRIO DA EMPRESA ───
        case "consultar_calendario": {
          const tid = tenantId || resolvedCompanyId;
          if (!tid) throw new Error("Tenant não identificado.");

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          let from = parseAiCalendarDay(args.from) || today;
          let to = parseAiCalendarDay(args.to);
          if (!to || to < from) {
            to = new Date(from);
            to.setDate(to.getDate() + 7);
            to.setHours(23, 59, 59, 999);
          } else {
            to.setHours(23, 59, 59, 999);
          }

          const heads = await this.prisma.calendarEvent.findMany({
            where: {
              tenantId: tid,
              OR: [{ startsAt: { lte: to } }, { recurrence: { not: null } }],
            },
            orderBy: { startsAt: "asc" },
            take: 200,
          });

          let items: any[] = [];
          for (const h of heads) {
            let rule: any = null;
            try {
              rule =
                typeof h.recurrence === "string"
                  ? JSON.parse(h.recurrence)
                  : h.recurrence;
            } catch {
              rule = null;
            }
            if (rule?.freq) {
              items.push(
                ...expandAiCalendarRecurrence(h, String(rule.freq), from, to),
              );
            } else if (
              new Date(h.startsAt) >= from &&
              new Date(h.startsAt) <= to
            ) {
              items.push({
                id: h.id,
                eventId: h.id,
                title: h.title,
                location: h.location,
                category: (h as any).category || "Compromisso",
                startsAt: h.startsAt,
                endsAt: h.endsAt,
                recurrence: null,
              });
            }
          }
          items.sort(
            (a, b) =>
              new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          );

          if (args.search) {
            const term = normalizeColorName(String(args.search));
            items = items.filter((i) =>
              normalizeColorName(i.title).includes(term),
            );
          }
          items = items.slice(0, 60);

          const fmt = (d: any) => {
            const dt = new Date(d);
            const dd = String(dt.getDate()).padStart(2, "0");
            const mm = String(dt.getMonth() + 1).padStart(2, "0");
            const hh = String(dt.getHours()).padStart(2, "0");
            const mi = String(dt.getMinutes()).padStart(2, "0");
            return `${dd}/${mm} ${hh}:${mi}`;
          };

          return {
            toolName,
            success: true,
            summary:
              items.length === 0
                ? `Nenhum compromisso de ${fmt(from)} até ${fmt(to)}.`
                : `${items.length} compromisso(s) de ${fmt(from)} até ${fmt(to)}: ` +
                  items
                    .map(
                      (i) =>
                        `"${i.title}" (${fmt(i.startsAt)}${i.location ? ` em ${i.location}` : ""})`,
                    )
                    .join("; "),
            data: {
              from: from.toISOString(),
              to: to.toISOString(),
              total: items.length,
              eventos: items.map((i) => ({
                id: i.id,
                eventId: i.eventId,
                title: i.title,
                location: i.location,
                category: i.category,
                startsAt: new Date(i.startsAt).toISOString(),
                endsAt: new Date(i.endsAt).toISOString(),
                recurrence: i.recurrence,
              })),
            },
          };
        }

        case "criar_evento_calendario": {
          const tid = tenantId || resolvedCompanyId;
          if (!tid) throw new Error("Tenant não identificado.");
          if (!args.title || !String(args.title).trim())
            throw new Error("O título do evento é obrigatório.");

          const day = parseAiCalendarDay(args.date);
          if (args.date && !day) {
            return {
              toolName,
              success: false,
              summary: `Não entendi a data "${args.date}". Use "hoje", "amanhã" ou DD/MM (ex: 20/09).`,
              data: { error: "Data inválida" },
            };
          }
          const t = parseAiCalendarTime(args.time);
          if (args.time && !t) {
            return {
              toolName,
              success: false,
              summary: `Não entendi a hora "${args.time}". Use HH:MM (ex: 14:00).`,
              data: { error: "Hora inválida" },
            };
          }
          const base =
            day ||
            (() => {
              const n = new Date();
              n.setHours(0, 0, 0, 0);
              return n;
            })();
          const startsAt = new Date(base);
          startsAt.setHours(t?.h ?? 9, t?.m ?? 0, 0, 0);
          const durationMin = Math.max(
            5,
            Math.min(24 * 60, Math.round(Number(args.durationMin) || 60)),
          );
          const endsAt = new Date(startsAt.getTime() + durationMin * 60000);

          const freq = String(args.recurrence || "NONE").toUpperCase();
          if (!["NONE", "DAILY", "WEEKLY", "MONTHLY"].includes(freq)) {
            return {
              toolName,
              success: false,
              summary: `Repetição "${args.recurrence}" inválida. Use NONE, DAILY, WEEKLY ou MONTHLY.`,
              data: { error: "Recorrência inválida" },
            };
          }

          const created = await this.prisma.calendarEvent.create({
            data: {
              tenantId: tid,
              title: String(args.title).trim().slice(0, 200),
              description: args.description
                ? String(args.description).slice(0, 2000)
                : null,
              location: args.location
                ? String(args.location).slice(0, 300)
                : null,
              startsAt,
              endsAt,
              allDay: false,
              color: "#0E54F8",
              category: args.category
                ? String(args.category).slice(0, 80)
                : "Compromisso",
              recurrence:
                freq === "NONE" ? null : JSON.stringify({ freq, interval: 1 }),
              reminderMin:
                args.reminderMin !== undefined
                  ? Math.max(0, Math.round(Number(args.reminderMin) || 0))
                  : null,
              createdById: context.user?.sub || context.user?.id || null,
            },
          });

          const dd = String(startsAt.getDate()).padStart(2, "0");
          const mm = String(startsAt.getMonth() + 1).padStart(2, "0");
          const hh = String(startsAt.getHours()).padStart(2, "0");
          const mi = String(startsAt.getMinutes()).padStart(2, "0");
          return {
            toolName,
            success: true,
            summary: `Evento "${created.title}" marcado para ${dd}/${mm} às ${hh}:${mi}${freq !== "NONE" ? ` (repete ${freq})` : ""}.`,
            data: {
              id: created.id,
              title: created.title,
              startsAt: created.startsAt,
              endsAt: created.endsAt,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["calendar"] },
            },
          };
        }

        case "editar_evento_calendario":
        case "excluir_evento_calendario": {
          const tid = tenantId || resolvedCompanyId;
          if (!tid) throw new Error("Tenant não identificado.");
          const isDelete = toolName === "excluir_evento_calendario";
          const scope =
            String(args.scope || "single").toLowerCase() === "series"
              ? "series"
              : "single";

          // Localiza: ID direto (aceita "id@iso" de ocorrência) ou busca por título.
          let head: any = null;
          let occurrenceIso: string | null = null;
          const rawId = args.eventId ? String(args.eventId) : null;
          if (rawId) {
            const [baseId, iso] = rawId.split("@");
            head = await this.prisma.calendarEvent.findFirst({
              where: { id: baseId, tenantId: tid },
            });
            if (iso) occurrenceIso = iso;
          }
          if (!head && args.search) {
            const term = normalizeColorName(String(args.search));
            const candidates = await this.prisma.calendarEvent.findMany({
              where: { tenantId: tid },
              orderBy: { startsAt: "asc" },
              take: 100,
            });
            head =
              candidates.find((c) =>
                normalizeColorName(c.title).includes(term),
              ) ||
              candidates.find((c) =>
                term
                  .split(" ")
                  .filter((w) => w.length >= 3)
                  .some((w) => normalizeColorName(c.title).includes(w)),
              ) ||
              null;
          }
          if (!head) {
            return {
              toolName,
              success: false,
              summary: `Não encontrei o evento${args.search ? ` "${args.search}"` : ""} no calendário.`,
              data: { error: "Evento não encontrado" },
            };
          }

          let rule: any = null;
          try {
            rule =
              typeof head.recurrence === "string"
                ? JSON.parse(head.recurrence)
                : head.recurrence;
          } catch {
            rule = null;
          }
          const isRecurring = Boolean(rule?.freq);

          if (isDelete) {
            if (isRecurring && scope === "single" && !occurrenceIso) {
              return {
                toolName,
                success: false,
                summary: `O evento "${head.title}" é uma série que se repete (${rule.freq}). Quer excluir só uma ocorrência ou a série toda?`,
                data: {
                  error: "Escopo ambíguo",
                  eventId: head.id,
                  needsScope: true,
                },
              };
            }
            if (isRecurring && scope === "single" && occurrenceIso) {
              let exceptions: string[] = [];
              try {
                const arr =
                  typeof head.recurrenceExceptions === "string"
                    ? JSON.parse(head.recurrenceExceptions)
                    : head.recurrenceExceptions;
                if (Array.isArray(arr)) exceptions = arr.map((x) => String(x));
              } catch {
                exceptions = [];
              }
              if (!exceptions.includes(occurrenceIso))
                exceptions.push(occurrenceIso);
              await this.prisma.calendarEvent.update({
                where: { id: head.id },
                data: { recurrenceExceptions: JSON.stringify(exceptions) },
              });
              return {
                toolName,
                success: true,
                summary: `Ocorrência de "${head.title}" excluída. A série continua nos demais dias.`,
                data: { eventId: head.id, occurrenceIso, scope: "single" },
                clientAction: {
                  type: "REFRESH_DATA",
                  payload: { queries: ["calendar"] },
                },
              };
            }
            await this.prisma.calendarEvent.delete({ where: { id: head.id } });
            return {
              toolName,
              success: true,
              summary: isRecurring
                ? `Série "${head.title}" excluída por completo.`
                : `Evento "${head.title}" excluído do calendário.`,
              data: {
                eventId: head.id,
                scope: isRecurring ? "series" : "single",
                deleted: true,
              },
              clientAction: {
                type: "REFRESH_DATA",
                payload: { queries: ["calendar"] },
              },
            };
          }

          // ─── Edição ───
          if (isRecurring && scope === "single" && !occurrenceIso) {
            return {
              toolName,
              success: false,
              summary: `O evento "${head.title}" é uma série que se repete (${rule.freq}). Quer alterar só uma ocorrência ou a série toda?`,
              data: {
                error: "Escopo ambíguo",
                eventId: head.id,
                needsScope: true,
              },
            };
          }

          const patch: any = {};
          if (args.title) patch.title = String(args.title).trim().slice(0, 200);
          if (args.location !== undefined)
            patch.location = args.location
              ? String(args.location).slice(0, 300)
              : null;
          if (args.description !== undefined)
            patch.description = args.description
              ? String(args.description).slice(0, 2000)
              : null;
          if (args.category)
            patch.category = String(args.category).slice(0, 80);

          const newDay = args.date ? parseAiCalendarDay(args.date) : null;
          if (args.date && !newDay) {
            return {
              toolName,
              success: false,
              summary: `Não entendi a data "${args.date}". Use "hoje", "amanhã" ou DD/MM.`,
              data: { error: "Data inválida" },
            };
          }
          const newTime = args.time ? parseAiCalendarTime(args.time) : null;
          if (args.time && !newTime) {
            return {
              toolName,
              success: false,
              summary: `Não entendi a hora "${args.time}". Use HH:MM.`,
              data: { error: "Hora inválida" },
            };
          }
          if (newDay || newTime) {
            const cur = new Date(head.startsAt);
            const dur = new Date(head.endsAt).getTime() - cur.getTime();
            const ns = new Date(newDay || cur);
            ns.setHours(
              newTime?.h ?? cur.getHours(),
              newTime?.m ?? cur.getMinutes(),
              0,
              0,
            );
            patch.startsAt = ns;
            patch.endsAt = new Date(ns.getTime() + dur);
          }

          // Edição de ocorrência única: destaca (detach) como o app faz.
          if (isRecurring && scope === "single" && occurrenceIso) {
            let exceptions: string[] = [];
            try {
              const arr =
                typeof head.recurrenceExceptions === "string"
                  ? JSON.parse(head.recurrenceExceptions)
                  : head.recurrenceExceptions;
              if (Array.isArray(arr)) exceptions = arr.map((x) => String(x));
            } catch {
              exceptions = [];
            }
            if (!exceptions.includes(occurrenceIso))
              exceptions.push(occurrenceIso);
            await this.prisma.calendarEvent.update({
              where: { id: head.id },
              data: { recurrenceExceptions: JSON.stringify(exceptions) },
            });
            const detached = await this.prisma.calendarEvent.create({
              data: {
                tenantId: tid,
                title: patch.title ?? head.title,
                description: patch.description ?? head.description,
                location: patch.location ?? head.location,
                startsAt: patch.startsAt ?? new Date(occurrenceIso),
                endsAt:
                  patch.endsAt ??
                  new Date(
                    new Date(occurrenceIso).getTime() +
                      (new Date(head.endsAt).getTime() -
                        new Date(head.startsAt).getTime()),
                  ),
                allDay: Boolean(head.allDay),
                color: head.color,
                category: patch.category ?? head.category,
                recurrence: null,
                reminderMin: head.reminderMin,
                createdById: context.user?.sub || context.user?.id || null,
              },
            });
            return {
              toolName,
              success: true,
              summary: `Ocorrência de "${head.title}" alterada. A série continua igual nos demais dias.`,
              data: { id: detached.id, title: detached.title, scope: "single" },
              clientAction: {
                type: "REFRESH_DATA",
                payload: { queries: ["calendar"] },
              },
            };
          }

          if (Object.keys(patch).length === 0) {
            return {
              toolName,
              success: false,
              summary: `Nada para alterar em "${head.title}". Diga o novo título, data, hora ou local.`,
              data: { error: "Sem alterações", eventId: head.id },
            };
          }
          const updated = await this.prisma.calendarEvent.update({
            where: { id: head.id },
            data: patch,
          });
          return {
            toolName,
            success: true,
            summary: `Evento "${updated.title}" atualizado${patch.startsAt ? " com nova data/hora" : ""}.`,
            data: {
              id: updated.id,
              title: updated.title,
              scope: isRecurring ? "series" : "single",
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["calendar"] },
            },
          };
        }

        // ─── ACADEMIA ───
        case "consultar_alunos": {
          const list = await this.gym.listStudents(companyId, tenantId, {
            search: args.search ? String(args.search) : undefined,
            status:
              args.status && args.status !== "ALL"
                ? String(args.status)
                : "ALL",
          });
          const activos = list.filter((s: any) => s.status === "ATIVO").length;
          const vencidos = list.filter(
            (s: any) => s.status === "VENCIDO",
          ).length;
          return {
            toolName,
            success: true,
            summary: `${list.length} aluno(s) localizado(s) (${activos} ativos${vencidos ? `, ${vencidos} vencidos` : ""}).`,
            data: {
              total: list.length,
              alunos: list.slice(0, 30).map((s: any) => ({
                id: s.id,
                name: s.name,
                phone: s.phone,
                planName: s.planName,
                status: s.status,
                dueDate: s.dueDate,
              })),
            },
          };
        }

        case "registrar_checkin": {
          let studentId = args.studentId ? String(args.studentId) : null;
          if (!studentId && args.search) {
            const term = normalizeColorName(String(args.search));
            const candidates = await this.gym.listStudents(
              companyId,
              tenantId,
              { status: "ALL" },
            );
            const match = candidates.filter((c: any) =>
              normalizeColorName(c.name).includes(term),
            );
            if (match.length === 0) {
              return {
                toolName,
                success: false,
                summary: `Não encontrei o aluno "${args.search}".`,
                data: { error: "Aluno não encontrado" },
              };
            }
            if (match.length > 1) {
              return {
                toolName,
                success: false,
                summary: `Há ${match.length} alunos com esse nome — qual deles? ${match
                  .slice(0, 5)
                  .map((m: any) => m.name)
                  .join(", ")}.`,
                data: {
                  error: "Ambiguidade",
                  candidates: match
                    .slice(0, 5)
                    .map((m: any) => ({ id: m.id, name: m.name })),
                },
              };
            }
            studentId = match[0].id;
          }
          if (!studentId)
            throw new Error("Informe o aluno (ID ou trecho do nome).");
          const record: any = await this.gym.checkIn(
            companyId,
            tenantId,
            studentId,
            "MANUAL",
          );
          return {
            toolName,
            success: true,
            summary: record.allowed
              ? `Entrada liberada para ${record.student?.name}.`
              : `Acesso BLOQUEADO para ${record.student?.name}: ${record.reason}.`,
            data: {
              id: record.id,
              allowed: record.allowed,
              reason: record.reason,
              student: record.student,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["gym-checkins-today", "gym-dashboard"] },
            },
          };
        }

        case "resumo_academia": {
          const d: any = await this.gym.dashboard(companyId, tenantId);
          const brl = (c: number) =>
            `R$ ${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")}`;
          return {
            toolName,
            success: true,
            summary: `${d.activeStudents} ativos, ${d.presentToday} presentes hoje, ${d.newEnrollmentsMonth} matrículas no mês, ${d.expiring7d} vencendo em 7 dias, ${d.pendingBills} contas pendentes (${brl(d.pendingCents)}) e ${brl(d.revenueMonthCents)} faturados no mês.`,
            data: d,
          };
        }

        // ─── REFRIGERAÇÃO ───
        case "consultar_os": {
          const list: any[] = await this.fieldService.listOrders(
            companyId,
            tenantId,
            {
              status:
                args.status && args.status !== "ALL"
                  ? String(args.status)
                  : undefined,
              search: args.search ? String(args.search) : undefined,
            },
          );
          return {
            toolName,
            success: true,
            summary: `${list.length} ordem(ns) localizada(s).`,
            data: {
              total: list.length,
              ordens: list.slice(0, 20).map((o: any) => ({
                id: o.id,
                number: o.number,
                clientName: o.clientName,
                serviceType: o.serviceType,
                status: o.status,
                technicianName: o.technicianName,
                scheduledAt: o.scheduledAt,
                totalCents: o.totalCents,
              })),
            },
          };
        }

        case "criar_os": {
          if (!args.clientName?.trim() && !args.customerId)
            throw new Error("Informe o nome do cliente.");
          const order: any = await this.fieldService.createOrder(
            companyId,
            tenantId,
            {
              clientName: args.clientName,
              customerId: args.customerId,
              phone: args.phone,
              address: args.address,
              serviceType: args.serviceType,
              reportedProblem: args.reportedProblem,
              equipmentDesc: args.equipmentDesc,
              scheduledAt: args.scheduledAt,
            },
            context.user?.sub || context.user?.id,
          );
          return {
            toolName,
            success: true,
            summary: `OS #${order.number} aberta para ${order.clientName}${order.scheduledAt ? " (agendada)" : ""}.`,
            data: { id: order.id, number: order.number, status: order.status },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["service-orders", "service-dashboard"] },
            },
          };
        }

        case "concluir_os": {
          let order: any = null;
          if (args.orderId) {
            try {
              order = await this.fieldService.getOrder(
                companyId,
                tenantId,
                String(args.orderId),
              );
            } catch {
              order = null;
            }
          }
          if (!order && args.number) {
            const list: any[] = await this.fieldService.listOrders(
              companyId,
              tenantId,
              {},
            );
            order =
              list.find((o: any) => o.number === Number(args.number)) || null;
          }
          if (!order) {
            return {
              toolName,
              success: false,
              summary: "Não encontrei a OS. Informe o número.",
              data: { error: "OS não encontrada" },
            };
          }
          if (order.status === "CONCLUIDA") {
            return {
              toolName,
              success: true,
              summary: `A OS #${order.number} já estava concluída.`,
              data: { id: order.id, status: order.status },
            };
          }
          if (order.status === "CANCELADA") {
            return {
              toolName,
              success: false,
              summary: `A OS #${order.number} está cancelada e não pode ser concluída.`,
              data: { error: "OS cancelada" },
            };
          }
          const updated: any = await this.fieldService.setStatus(
            companyId,
            tenantId,
            order.id,
            "CONCLUIDA",
          );
          const brl = (c: number) =>
            `R$ ${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")}`;
          return {
            toolName,
            success: true,
            summary: `OS #${updated.number} concluída (${brl(updated.totalCents)} lançados no Financeiro).`,
            data: {
              id: updated.id,
              number: updated.number,
              totalCents: updated.totalCents,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["service-orders", "service-dashboard"] },
            },
          };
        }

        // ─── FINANCEIRO ───
        case "consultar_contas_receber": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const st =
            args.status && args.status !== "ALL"
              ? String(args.status)
              : undefined;
          const bills = await this.prisma.billReceivable.findMany({
            where: {
              tenantId: resolvedCompanyId,
              ...(st ? { status: st } : {}),
            },
            orderBy: { dueDate: "asc" },
            take: 50,
            include: { customer: { select: { name: true } } },
          });
          const pending = bills
            .filter((b) => ["PENDING", "PARTIAL"].includes(b.status))
            .reduce((a, b) => a + (b.amountCents - b.paidCents), 0);
          const brl = (c: number) =>
            `R$ ${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")}`;
          return {
            toolName,
            success: true,
            summary: `${bills.length} conta(s) localizada(s). Pendente total: ${brl(pending)}.`,
            data: {
              total: bills.length,
              pendenteCents: pending,
              contas: bills.map((b) => ({
                id: b.id,
                description: b.description,
                customer: (b as any).customer?.name || null,
                amountCents: b.amountCents,
                paidCents: b.paidCents,
                dueDate: b.dueDate,
                status: b.status,
              })),
            },
          };
        }

        case "dar_baixa_conta": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          let bill: any = null;
          if (args.billId) {
            bill = await this.prisma.billReceivable.findFirst({
              where: { id: String(args.billId), tenantId: resolvedCompanyId },
            });
          }
          if (!bill && args.search) {
            const term = String(args.search);
            const candidates = await this.prisma.billReceivable.findMany({
              where: {
                tenantId: resolvedCompanyId,
                status: { in: ["PENDING", "PARTIAL"] },
              },
              orderBy: { dueDate: "asc" },
              take: 20,
            });
            const match = candidates.filter((c) =>
              c.description.toLowerCase().includes(term.toLowerCase()),
            );
            if (match.length === 0) {
              return {
                toolName,
                success: false,
                summary: `Nenhuma conta pendente com "${args.search}".`,
                data: { error: "Conta não encontrada" },
              };
            }
            if (match.length > 1) {
              return {
                toolName,
                success: false,
                summary: `Há ${match.length} contas parecidas — qual delas? ${match
                  .slice(0, 5)
                  .map((m) => m.description)
                  .join("; ")}.`,
                data: {
                  error: "Ambiguidade",
                  candidates: match
                    .slice(0, 5)
                    .map((m) => ({ id: m.id, description: m.description })),
                },
              };
            }
            bill = match[0];
          }
          if (!bill)
            throw new Error("Informe a conta (ID ou trecho da descrição).");
          if (["RECEIVED", "CANCELED"].includes(bill.status)) {
            return {
              toolName,
              success: false,
              summary: "Esta conta já está quitada ou cancelada.",
              data: { error: "Conta encerrada" },
            };
          }
          const pending = Math.max(0, bill.amountCents - bill.paidCents);
          const amount =
            args.amountCents !== undefined
              ? Math.round(Number(args.amountCents))
              : pending;
          if (!Number.isFinite(amount) || amount <= 0 || amount > pending) {
            return {
              toolName,
              success: false,
              summary: `Valor inválido. Pendente: R$ ${(pending / 100).toFixed(2).replace(".", ",")}.`,
              data: { error: "Valor inválido" },
            };
          }
          const operatorId = context.user?.sub || context.user?.id || null;
          const result = await this.prisma.$transaction(async (tx) => {
            await tx.receivablePayment.create({
              data: {
                tenantId: resolvedCompanyId as string,
                billReceivableId: bill.id,
                amountCents: amount,
                method: args.method ? String(args.method).slice(0, 30) : null,
                notes: "Baixa via Copiloto IA",
                operatorId,
              },
            });
            const newPaid = bill.paidCents + amount;
            const full = newPaid >= bill.amountCents;
            const updated = await tx.billReceivable.update({
              where: { id: bill.id },
              data: {
                paidCents: newPaid,
                status: full ? "RECEIVED" : "PARTIAL",
                receivedAt: full ? new Date() : bill.receivedAt,
              },
            });
            if (bill.customerId) {
              await tx.customer.update({
                where: { id: bill.customerId },
                data: { currentDebtCents: { decrement: amount } },
              });
            }
            return updated;
          });
          const brl = (c: number) =>
            `R$ ${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")}`;
          return {
            toolName,
            success: true,
            summary: `Recebidos ${brl(amount)} de "${bill.description}" — conta ${result.status === "RECEIVED" ? "quitada" : "parcialmente paga"}.`,
            data: {
              id: result.id,
              status: result.status,
              paidCents: result.paidCents,
            },
            clientAction: {
              type: "REFRESH_DATA",
              payload: { queries: ["bills-receivable", "pending-payments"] },
            },
          };
        }

        case "consultar_contas_pagar": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const st =
            args.status && args.status !== "ALL"
              ? String(args.status)
              : undefined;
          const bills = await this.prisma.billPayable.findMany({
            where: {
              tenantId: resolvedCompanyId,
              ...(st ? { status: st } : {}),
            },
            orderBy: { dueDate: "asc" },
            take: 50,
          });
          const pending = bills
            .filter((b) => b.status === "PENDING")
            .reduce((a, b) => a + b.amountCents, 0);
          const brl = (c: number) =>
            `R$ ${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")}`;
          return {
            toolName,
            success: true,
            summary: `${bills.length} conta(s) localizada(s). A pagar: ${brl(pending)}.`,
            data: {
              total: bills.length,
              aPagarCents: pending,
              contas: bills.map((b) => ({
                id: b.id,
                description: b.description,
                category: (b as any).category || null,
                amountCents: b.amountCents,
                dueDate: b.dueDate,
                status: b.status,
              })),
            },
          };
        }

        case "consultar_produtos": {
          if (!resolvedCompanyId) throw new Error("Tenant não identificado.");
          const term = args.search ? String(args.search) : "";
          const products = await this.prisma.product.findMany({
            where: {
              AND: [
                {
                  OR: [
                    { tenantId: resolvedCompanyId },
                    { companyId: resolvedCompanyId },
                  ],
                },
                { isActive: true },
                ...(term
                  ? [
                      {
                        OR: [
                          { name: { contains: term } },
                          { sku: { contains: term } },
                          { barcode: { contains: term } },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            orderBy: { name: "asc" },
            take: 30,
            select: {
              id: true,
              name: true,
              salePriceCents: true,
              stockQuantity: true,
              unit: true,
            },
          });
          const brl = (c: number) =>
            `R$ ${((Number(c) || 0) / 100).toFixed(2).replace(".", ",")}`;
          return {
            toolName,
            success: true,
            summary:
              products.length === 0
                ? `Nenhum produto com "${term}".`
                : `${products.length} produto(s): ` +
                  products
                    .slice(0, 10)
                    .map(
                      (p) =>
                        `${p.name} (${brl(p.salePriceCents)}, est. ${p.stockQuantity})`,
                    )
                    .join("; "),
            data: { total: products.length, produtos: products },
          };
        }

        default:
          return {
            toolName,
            success: false,
            summary: `Ferramenta "${toolName}" não reconhecida no catálogo ERP.`,
            data: { error: "Unknown tool" },
          };
      }
    } catch (err: any) {
      this.logger.error(
        `Error executing tool ${toolName}: ${err.message}`,
        err.stack,
      );
      return {
        toolName,
        success: false,
        summary: `Erro ao executar ${toolName}: ${err.message}`,
        data: { error: err.message },
      };
    }
  }
}
