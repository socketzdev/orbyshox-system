import { resolveColor } from "./ai-tools.service";

/**
 * Orquestrador heurístico de intenção.
 *
 * Quando o Gemini falha (cota, latência, rede), o Copiloto precisa continuar
 * funcionando — a exigência é 100% de disponibilidade para os comandos mais
 * usados. Este módulo interpreta a mensagem por regras determinísticas e
 * devolve qual ferramenta executar, sem depender de nenhum provedor externo.
 *
 * Decisões de projeto:
 *  - **Só reconhece intenção com verbo explícito de ação ou pergunta clara.**
 *    Um texto ambíguo devolve `null`, e o chamador responde pedindo
 *    esclarecimento — melhor do que executar a coisa errada.
 *  - **Nenhuma escrita acontece aqui.** O módulo só decide *o que* executar;
 *    quem grava é `AiToolsService`, que já valida e isola por tenant.
 *  - É puro e testável: sem Prisma, sem rede, sem estado.
 */

export type HeuristicTool =
  | "alterar_tema_painel"
  | "consultar_tema_painel"
  | "criar_tarefa"
  | "concluir_tarefa"
  | "consultar_tarefas"
  | "consultar_equipe"
  | "cadastrar_funcionario"
  | "adicionar_mesa"
  | "remover_mesa"
  | "criar_nota_compra"
  | "consultar_notas_compra"
  | "criar_categoria_cardapio"
  | "remover_prato_cardapio"
  | "adicionar_prato_cardapio"
  | "consultar_cardapio"
  | "consultar_mesas"
  | "consultar_calendario"
  | "criar_evento_calendario"
  | "editar_evento_calendario"
  | "excluir_evento_calendario"
  | "consultar_alunos"
  | "consultar_os"
  | "consultar_contas_receber"
  | "consultar_contas_pagar";

export interface HeuristicIntent {
  tool: HeuristicTool;
  args: Record<string, any>;
  /** 0–1. Abaixo de 0.5 o chamador deve pedir confirmação antes de agir. */
  confidence: number;
  /** Explicação curta de por que esta intenção foi reconhecida. */
  reason: string;
}

/** Remove acento, baixa caixa e colapsa espaços — base de toda comparação. */
function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const has = (text: string, ...words: string[]) =>
  words.some((w) => text.includes(w));

/** Verbos que indicam ação de escrita. */
const WRITE_VERBS = [
  "muda",
  "mude",
  "troca",
  "troque",
  "coloca",
  "coloque",
  "altera",
  "altere",
  "poe",
  "ponha",
  "deixa",
  "deixe",
  "aplica",
  "aplique",
  "volta",
  "volte",
  "retorna",
  "retorne",
  "restaura",
  "restaure",
  "cria",
  "crie",
  "adiciona",
  "adicione",
  "cadastra",
  "cadastre",
  "remove",
  "remova",
  "apaga",
  "apague",
  "exclui",
  "exclua",
  "conclui",
  "conclua",
  "finaliza",
  "finalize",
  "marca",
  "marque",
  "desativa",
  "desative",
  "ativa",
  "ative",
];

/** Verbos/interrogativos de consulta. */
const READ_HINTS = [
  "quais",
  "qual",
  "lista",
  "liste",
  "mostra",
  "mostre",
  "exibe",
  "exiba",
  "consulta",
  "consulte",
  "como esta",
  "ver",
  "veja",
  "me diga",
];

const isWrite = (t: string) => has(t, ...WRITE_VERBS);
const isRead = (t: string) => has(t, ...READ_HINTS);

/**
 * Extrai "19:00", "19h", "às 19" → "19:00".
 *
 * Normaliza o texto internamente: a função não pode depender de o chamador já
 * ter removido acento ("às 23" precisa funcionar tanto quanto "as 23").
 */
export function extractTime(text: string): string | null {
  const t = normalize(text);

  const colon = t.match(/\b(2[0-3]|[01]?\d):([0-5]\d)\b/);
  if (colon) return `${String(Number(colon[1])).padStart(2, "0")}:${colon[2]}`;

  // `2[0-3]` precisa vir ANTES de `[01]?\d`: com a ordem inversa, "22h"
  // casaria só com o "2" e viraria 02:00.
  const h = t.match(/\b(?:as\s+)?(2[0-3]|[01]?\d)\s*h(?:oras)?\b/);
  if (h) return `${String(Number(h[1])).padStart(2, "0")}:00`;

  const asOnly = t.match(/\bas\s+(2[0-3]|[01]?\d)\b/);
  if (asOnly) return `${String(Number(asOnly[1])).padStart(2, "0")}:00`;

  return null;
}

/** "R$ 38,00", "38,00", "38.00" → 3800 centavos. */
export function extractPriceCents(text: string): number | null {
  const m = text.match(/r?\$?\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/i);
  if (!m) return null;
  const reais = Number(String(m[1]).replace(/\./g, ""));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (!Number.isFinite(reais)) return null;
  return reais * 100 + cents;
}

const PRIORITY_MAP: Array<[string, string]> = [
  ["urgente", "URGENT"],
  ["urgentissimo", "URGENT"],
  ["prioridade alta", "HIGH"],
  ["importante", "HIGH"],
  ["alta", "HIGH"],
  ["baixa", "LOW"],
];

function extractPriority(text: string): string | null {
  for (const [needle, value] of PRIORITY_MAP) {
    if (text.includes(needle)) return value;
  }
  return null;
}

const ROLE_MAP: Array<[string, string]> = [
  ["garcom", "Garçom"],
  ["cozinha", "Cozinha"],
  ["cozinheiro", "Cozinha"],
  ["chef", "Cozinha"],
  ["caixa", "Caixa"],
  ["limpeza", "Limpeza"],
  ["faxina", "Limpeza"],
  ["estoque", "Estoque"],
  ["estoquista", "Estoque"],
  ["bar", "Bar"],
  ["barman", "Bar"],
  ["atendente", "Atendimento"],
  ["gerente", "Gerência"],
];

function extractRole(text: string): string | null {
  for (const [needle, value] of ROLE_MAP) {
    if (text.includes(needle)) return value;
  }
  return null;
}

/**
 * Interpreta a mensagem e devolve a intenção, ou `null` se nada for
 * reconhecido com segurança suficiente.
 */
export function parseIntent(message: string): HeuristicIntent | null {
  const t = normalize(message);
  if (!t) return null;

  // ─── 1. Tema / cor ───
  if (has(t, "cor", "tema", "visual", "paleta", "cor primaria")) {
    // "volte para o vinho", "mude para azul safira"
    const colorMatch =
      t.match(
        /(?:para|pro|em|no)\s+(?:a\s+|o\s+)?(?:cor\s+)?([a-z0-9#\s]{3,30}?)(?:\s*\(|,|\.|$|\s+e\s)/,
      ) || t.match(/(#[0-9a-f]{3,6})/);

    const hexDirect = t.match(/#[0-9a-f]{3,6}/)?.[0];
    const candidate = hexDirect || (colorMatch ? colorMatch[1].trim() : "");

    if (isWrite(t) || hexDirect) {
      const resolved = candidate && !hexDirect ? resolveColor(candidate) : null;
      if (hexDirect || resolved) {
        const args: Record<string, any> = {};
        if (hexDirect) args.hex = hexDirect;
        else if (resolved) args.colorName = candidate;
        if (has(t, "escuro", "dark", "noturno")) args.darkMode = true;
        if (has(t, "claro", "light", "dia")) args.darkMode = false;

        return {
          tool: "alterar_tema_painel",
          args,
          confidence: 0.9,
          reason:
            "Pedido explícito de mudança de cor/tema com cor identificada.",
        };
      }

      // Pediu para mudar a cor mas não disse qual.
      if (has(t, "muda", "mude", "troca", "troque", "altera", "altere")) {
        return {
          tool: "consultar_tema_painel",
          args: {},
          confidence: 0.4,
          reason: "Pediu mudança de cor sem informar qual — melhor perguntar.",
        };
      }
    }

    if (isRead(t) || has(t, "cor atual", "qual cor", "que cor")) {
      return {
        tool: "consultar_tema_painel",
        args: {},
        confidence: 0.8,
        reason: "Pergunta sobre a cor/tema atual.",
      };
    }
  }

  // ─── 2. Tarefas ───
  if (has(t, "tarefa", "tarefas", "afazer", "checklist")) {
    if (
      has(
        t,
        "conclui",
        "conclua",
        "finaliza",
        "finalize",
        "marca como",
        "marque como",
        "feito",
        "pronta",
        "pronto",
      )
    ) {
      const search = t.match(
        /(?:tarefa|tarefas)(?:\s+de|\s+da|\s+do)?\s+(.{3,60}?)(?:\s+como|\s*$|,|\.)/,
      );
      return {
        tool: "concluir_tarefa",
        args: { search: search ? search[1].trim() : undefined },
        confidence: search ? 0.85 : 0.5,
        reason: "Pedido de conclusão de tarefa.",
      };
    }

    if (
      has(
        t,
        "cria",
        "crie",
        "adiciona",
        "adicione",
        "nova",
        "novo",
        "agenda",
        "agende",
      )
    ) {
      // "crie uma tarefa urgente para o garçom repor guardanapos às 19:00"
      const role = extractRole(t);
      const dueTime = extractTime(t);
      const priority = extractPriority(t);

      // O título é o trecho após o setor/verbo, sem o horário.
      let title = message
        .replace(
          /^.*?(?:criar?|crie|adicionar?|adicione|nova|novo)\s+(?:uma\s+|um\s+)?tarefa\s*/i,
          "",
        )
        .replace(/\b(?:urgente|importante)\b/gi, "")
        .replace(
          /\b(?:para|pro|ao|a|o)\s+(?:o\s+|a\s+)?(?:gar[çc]om|cozinha|cozinheiro|chef|caixa|limpeza|estoque|barman|bar|atendente|gerente)\b/gi,
          "",
        )
        .replace(/\b(?:as|às)\s*\d{1,2}(?::\d{2}|\s*h(?:oras)?)?\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      title = title.replace(/^[-–,:]\s*/, "").trim();

      if (!title) title = "Tarefa operacional";

      return {
        tool: "criar_tarefa",
        args: {
          title: title.charAt(0).toUpperCase() + title.slice(1),
          assignedRole: role || "Todos",
          ...(dueTime ? { dueTime } : {}),
          ...(priority ? { priority } : {}),
        },
        confidence: 0.85,
        reason: "Pedido de criação de tarefa com verbo explícito.",
      };
    }

    return {
      tool: "consultar_tarefas",
      args: { status: "ALL" },
      confidence: 0.75,
      reason: "Menção a tarefas sem verbo de escrita — listando.",
    };
  }

  // ─── 3. Mesas ───
  if (has(t, "mesa", "mesas", "salao", "varanda")) {
    if (
      has(
        t,
        "remove",
        "remova",
        "remove",
        "apaga",
        "apague",
        "exclui",
        "exclua",
        "tira",
        "tire",
        "deleta",
        "delete",
      )
    ) {
      const num = t.match(/(?:mesa\s*)?(\d{1,3})/);

      // Plural sem número = remover todas as mesas livres. Sem isto, o pedido
      // caía no caminho de mesa única, não achava nada e a IA relatava falha.
      const isPlural = /\bmesas\b/.test(t) && !num;
      const isAll = has(t, "todas", "todos", "tudo") || isPlural;

      if (isAll && !num) {
        return {
          tool: "remover_mesa",
          args: { all: true },
          confidence: 0.8,
          reason: "Pedido de remoção em lote (todas as mesas).",
        };
      }

      return {
        tool: "remover_mesa",
        args: num ? { number: Number(num[1]) } : { all: true },
        confidence: num ? 0.8 : 0.5,
        reason: num
          ? "Pedido de remoção de mesa específica."
          : "Remoção de mesa sem número.",
      };
    }

    if (has(t, "adiciona", "adicione", "cria", "crie", "nova", "novo")) {
      const num = t.match(/(?:mesa\s*)(\d{1,3})/) || t.match(/(\d{1,3})/);
      const cap = t.match(
        /(?:capacidade|para|lugar(?:es)?)\s*(?:de\s*)?(\d{1,2})/,
      );
      const areaMatch = t.match(
        /\b(varanda|salao|mezanino|terraco|area externa|jardim|balcao)\b/,
      );

      if (!num) {
        return {
          tool: "adicionar_mesa",
          args: {},
          confidence: 0.3,
          reason: "Pediu para criar mesa mas não informou o número.",
        };
      }

      return {
        tool: "adicionar_mesa",
        args: {
          number: Number(num[1]),
          ...(cap ? { capacity: Number(cap[1]) } : {}),
          ...(areaMatch
            ? {
                area:
                  areaMatch[1].charAt(0).toUpperCase() + areaMatch[1].slice(1),
              }
            : {}),
        },
        confidence: 0.85,
        reason: "Pedido de criação de mesa com número identificado.",
      };
    }

    return {
      tool: "consultar_mesas",
      args: { status: "ALL" },
      confidence: 0.8,
      reason: "Consulta sobre mesas.",
    };
  }

  // ─── 4. Notas de compra / insumos ───
  if (
    has(
      t,
      "nota de compra",
      "notas de compra",
      "compra de insumo",
      "comprar insumo",
      "reposicao",
      "precisamos comprar",
      "precisamos de",
      "falta insumo",
      "lista de compras",
    )
  ) {
    if (
      has(
        t,
        "quais",
        "lista",
        "liste",
        "mostra",
        "mostre",
        "consulta",
        "consulte",
        "pendente",
      )
    ) {
      return {
        tool: "consultar_notas_compra",
        args: { status: "ALL" },
        confidence: 0.8,
        reason: "Consulta de notas de compra.",
      };
    }

    // Extrai insumos citados após "comprar"/"precisamos".
    const afterVerb = message.replace(
      /^.*?(?:comprar|compra de|precisamos de|repor|reposi[cç][aã]o de)\s*/i,
      "",
    );
    const items = afterVerb
      .split(/[,;]|\s+e\s+/i)
      .map((s) =>
        s
          .replace(
            /\b(?:arroz|feijao|queijo|caranguejo|carne|peixe|tomate|cebola|batata|oleo|farinha|acucar|cafe|leite|pao)\b/gi,
            (m) => m,
          )
          .trim(),
      )
      .map((s) => s.replace(/^(?:de|do|da)\s+/i, "").trim())
      .filter((s) => s.length >= 3 && s.length <= 40);

    if (items.length === 0) {
      return {
        tool: "criar_nota_compra",
        args: {},
        confidence: 0.3,
        reason: "Pediu nota de compra mas não informou os insumos.",
      };
    }

    return {
      tool: "criar_nota_compra",
      args: {
        title: "Reposição de insumos (via Copiloto)",
        items: items.map((name) => ({ name })),
      },
      confidence: 0.75,
      reason: "Pedido de reposição com insumos identificados.",
    };
  }

  // ─── 5. Equipe / funcionários ───
  if (
    has(
      t,
      "funcionario",
      "funcionarios",
      "colaborador",
      "colaboradores",
      "equipe",
      "staff",
    )
  ) {
    if (
      has(
        t,
        "cadastra",
        "cadastre",
        "adiciona",
        "adicione",
        "contrata",
        "contrate",
        "novo",
        "nova",
      )
    ) {
      const email = message.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
      const phone = message.match(/\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/)?.[0];
      const role = extractRole(t);

      // Acentos: "funcionário" precisa casar com o padrão sem acento.
      const nameMatch = message.match(
        /(?:funcion[aá]rio|colaborador|contratar?|contrate)\s+(?:o\s+|a\s+)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)*)/,
      );
      const name = nameMatch ? nameMatch[1].trim() : null;

      if (!name) {
        return {
          tool: "cadastrar_funcionario",
          args: {},
          confidence: 0.3,
          reason: "Pediu cadastro mas não informou o nome.",
        };
      }

      return {
        tool: "cadastrar_funcionario",
        args: {
          name,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(role ? { role } : {}),
        },
        confidence: 0.8,
        reason: "Pedido de cadastro de colaborador com nome identificado.",
      };
    }

    return {
      tool: "consultar_equipe",
      args: {},
      confidence: 0.8,
      reason: "Consulta sobre a equipe.",
    };
  }

  // ─── 6. Cardápio / pratos ───
  if (
    has(
      t,
      "prato",
      "pratos",
      "cardapio",
      "menu",
      "categoria",
      "item do cardapio",
    )
  ) {
    if (has(t, "categoria")) {
      if (isWrite(t)) {
        const m = message.match(
          /categoria\s+(?:de\s+|chamada\s+|nova\s+)?["']?([^"',.]{3,40})["']?/i,
        );
        return {
          tool: "criar_categoria_cardapio",
          args: m ? { name: m[1].trim() } : {},
          confidence: m ? 0.8 : 0.3,
          reason: "Pedido de criação de categoria.",
        };
      }
    }

    if (
      has(
        t,
        "remove",
        "remova",
        "apaga",
        "apague",
        "exclui",
        "exclua",
        "desativa",
        "desative",
        "tira",
        "tire",
      )
    ) {
      const m = message.match(
        /(?:prato|item)\s+(?:de\s+|do\s+|da\s+)?["']?([^"',.]{3,50})["']?/i,
      );
      return {
        tool: "remover_prato_cardapio",
        args: {
          ...(m ? { search: m[1].trim() } : {}),
          permanent: has(
            t,
            "exclui",
            "exclua",
            "apaga",
            "apague",
            "definitivo",
            "de vez",
          ),
        },
        confidence: m ? 0.75 : 0.4,
        reason: "Pedido de remoção/desativação de prato.",
      };
    }

    // Criar prato com preço: "adicione Hambúrguer Bali por R$ 38,00 na categoria Hambúrgueres"
    if (
      isWrite(t) &&
      has(t, "adiciona", "adicione", "cria", "crie", "novo", "nova")
    ) {
      const price = extractPriceCents(message);
      const catMatch = message.match(/categoria\s+["']?([^"',.]{3,40})["']?/i);
      const nameMatch = message.match(
        /(?:prato|item)?\s*[:\-]?\s*["']?([^"',.]{3,60}?)["']?\s*(?:por|a|no valor de|r\$)/i,
      );

      if (nameMatch && price) {
        return {
          tool: "adicionar_prato_cardapio",
          args: {
            // A ferramenta `adicionar_prato_cardapio` usa nomes em português e
            // preço em REAIS (não centavos) — o contrato precisa bater.
            nome: nameMatch[1].replace(/^(?:um|uma|o|a)\s+/i, "").trim(),
            preco: price / 100,
            ...(catMatch ? { categoria: catMatch[1].trim() } : {}),
          },
          confidence: 0.8,
          reason: "Pedido de criação de prato com nome e preço.",
        };
      }
    }

    return {
      tool: "consultar_cardapio",
      args: {},
      confidence: 0.8,
      reason: "Consulta sobre o cardápio.",
    };
  }

  // ─── 7. Calendário / compromissos ───
  if (
    has(
      t,
      "calendario",
      "agenda",
      "compromisso",
      "reuniao",
      "evento",
      "lembrete",
    )
  ) {
    const dayMatch =
      t.match(/\b(hoje|amanha)\b/) ||
      t.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
    const day = dayMatch ? dayMatch[1] : null;
    const time = extractTime(t);

    // Excluir: "cancela a reunião de amanhã", "apaga o evento dentista".
    if (
      has(
        t,
        "exclui",
        "exclua",
        "apaga",
        "apague",
        "remove",
        "remova",
        "cancela",
        "cancele",
        "deleta",
        "delete",
      )
    ) {
      const m = message.match(
        /(?:evento|compromisso|reuniao|lembrete|agenda)\s+(?:de\s+|do\s+|da\s+)?["']?([^"',.]{3,60})["']?/i,
      );
      const search = m
        ? m[1].replace(/\s+(de\s+)?(amanha|hoje)$/i, "").trim()
        : null;
      return {
        tool: "excluir_evento_calendario",
        args: { ...(search ? { search } : {}) },
        confidence: search ? 0.75 : 0.4,
        reason: "Pedido de exclusão de evento do calendário.",
      };
    }

    // Remarcar: "remarca a reunião para sexta", "muda o dentista para 15h".
    if (
      has(
        t,
        "remarca",
        "remarque",
        "reagenda",
        "reagende",
        "muda",
        "mude",
        "altera",
        "altere",
        "transfere",
        "transfira",
        "adianta",
        "adiante",
      )
    ) {
      const m = message.match(
        /(?:evento|compromisso|reuniao|lembrete|agenda)\s+(?:de\s+|do\s+|da\s+)?["']?([^"',.]{3,60})["']?/i,
      );
      const rawSearch = m ? m[1].trim() : null;
      const search = rawSearch
        ?.replace(/\s+(de\s+)?(amanha|hoje)$/i, "")
        .replace(
          /\b(?:para\s+)?(?:as\s+|às\s+)?\d{1,2}(?::\d{2}|\s*h)?\b/gi,
          "",
        )
        .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
        .trim();
      return {
        tool: "editar_evento_calendario",
        args: {
          ...(search ? { search } : {}),
          ...(day ? { date: day } : {}),
          ...(time ? { time } : {}),
        },
        confidence: search && (day || time) ? 0.8 : 0.45,
        reason: "Pedido de remarcação de evento.",
      };
    }

    // Criar: "marca reunião amanhã às 14h", "agende dentista 9h".
    // (Ramo avaliado DEPOIS de excluir/editar. "agenda" substantivo não entra
    // aqui — só o verbo "agende" — senão "o que tenho na agenda?" viraria criação.)
    if (
      has(
        t,
        "marca",
        "marque",
        "agende",
        "cria",
        "crie",
        "adiciona",
        "adicione",
        "cadastra",
        "cadastre",
        "novo",
        "nova",
        "preciso",
      )
    ) {
      // Limpeza sobre o texto ORIGINAL (preserva acento/caixa do título), com
      // padrões tolerantes a acento: \b não funciona após "ã"/"à" porque no
      // JS sem flag /u essas letras são não-word — por isso (?<![a-zà-ÿ]).
      // "reunião", "compromisso" etc. FAZEM parte do título ("marca reunião
      // amanhã" → "Reunião") — só o verbo e o artigo saem.
      let title = message
        .replace(
          /^.*?(?:marca|marque|agende|crie|cria|adicione|adiciona|cadastra|cadastre)\s+(?:um\s+|uma\s+)?/i,
          "",
        )
        .replace(/(?<![a-zà-ÿ])(?:amanh[aã]|hoje)(?![a-zà-ÿ])/gi, "")
        .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
        .replace(
          /(?<![a-zà-ÿ])[aà]s?\s*\d{1,2}(?::\d{2}|\s*h\d{0,2})?(?![a-zà-ÿ0-9])/gi,
          "",
        )
        .replace(/(?<![0-9a-zà-ÿ])\d{1,2}\s*h\d{0,2}(?![a-zà-ÿ0-9])/gi, "")
        .replace(/\bna?\s+(?:agenda|calend[aá]rio)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[-–,:)(\s]+/, "")
        .trim();
      if (!title) title = "Compromisso";
      return {
        tool: "criar_evento_calendario",
        args: {
          title: title.charAt(0).toUpperCase() + title.slice(1),
          ...(day ? { date: day } : {}),
          ...(time ? { time } : {}),
        },
        confidence: day || time ? 0.85 : 0.6,
        reason: "Pedido de criação de evento no calendário.",
      };
    }

    // Consulta: "o que tenho hoje?", "compromissos da semana".
    if (has(t, "amanha")) {
      return {
        tool: "consultar_calendario",
        args: { from: "amanhã", to: "amanhã" },
        confidence: 0.85,
        reason: "Consulta da agenda de amanhã.",
      };
    }
    if (has(t, "hoje")) {
      return {
        tool: "consultar_calendario",
        args: { from: "hoje", to: "hoje" },
        confidence: 0.85,
        reason: "Consulta da agenda de hoje.",
      };
    }
    return {
      tool: "consultar_calendario",
      args: {},
      confidence: 0.8,
      reason: "Consulta de compromissos do calendário.",
    };
  }

  // ─── 9. Refrigeração (somente leitura no fallback) ───
  if (
    has(
      t,
      "ordem de servico",
      "ordens de servico",
      "os aberta",
      "os agendada",
      "os concluida",
      "visita tecnica",
      "tecnico",
    )
  ) {
    // "cadastre o técnico" é equipe, não OS — devolve null para pedir
    // esclarecimento em vez de agir errado.
    if (has(t, "cadastra", "cadastre", "contrata", "contrate")) return null;
    return {
      tool: "consultar_os",
      args: {},
      confidence: 0.7,
      reason: "Consulta de ordens de serviço.",
    };
  }
  // ─── 8. Academia (somente leitura no fallback) ───
  if (
    has(
      t,
      "aluno",
      "alunos",
      "matricula",
      "matriculas",
      "mensalidade",
      "mensalidades",
    )
  ) {
    return {
      tool: "consultar_alunos",
      args: {
        status: has(t, "vencido", "vencida", "atrasado", "inadimplente")
          ? "VENCIDO"
          : "ALL",
      },
      confidence: 0.75,
      reason: "Consulta de alunos da academia.",
    };
  }

  // ─── 10. Financeiro (somente leitura no fallback) ───
  if (
    has(
      t,
      "contas a receber",
      "conta a receber",
      "inadimplencia",
      "valores a receber",
      "quem me deve",
    )
  ) {
    return {
      tool: "consultar_contas_receber",
      args: {},
      confidence: 0.8,
      reason: "Consulta de contas a receber.",
    };
  }
  if (has(t, "contas a pagar", "conta a pagar", "fornecedor", "despesas")) {
    return {
      tool: "consultar_contas_pagar",
      args: {},
      confidence: 0.8,
      reason: "Consulta de contas a pagar.",
    };
  }

  return null;
}
