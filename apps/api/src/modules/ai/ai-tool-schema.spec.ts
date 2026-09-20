import {
  findInvalidSchemas,
  formatToolsForGemini,
  toGeminiSchema,
} from "./ai-tool-schema";
import { AiToolsService, type ToolDefinition } from "./ai-tools.service";

describe("toGeminiSchema", () => {
  it("converte tipo simples para maiúsculas", () => {
    expect(toGeminiSchema({ type: "string", description: "nome" })).toEqual({
      type: "STRING",
      description: "nome",
    });
  });

  it("assume STRING quando o tipo não é informado", () => {
    expect(toGeminiSchema({}).type).toBe("STRING");
    expect(toGeminiSchema(null).type).toBe("STRING");
  });

  it("inclui enum apenas quando há valores", () => {
    expect(toGeminiSchema({ type: "string", enum: ["A", "B"] }).enum).toEqual([
      "A",
      "B",
    ]);
    // enum vazio é inválido para o Gemini e não pode ser enviado.
    expect(toGeminiSchema({ type: "string", enum: [] }).enum).toBeUndefined();
  });

  it("ARRAY sempre recebe items — esta é a correção do 400", () => {
    const schema = toGeminiSchema({ type: "array" });
    expect(schema.type).toBe("ARRAY");
    expect(schema.items).toBeDefined();
    expect(schema.items.type).toBe("STRING");
  });

  it("converte items de array de objetos recursivamente", () => {
    const schema = toGeminiSchema({
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do insumo" },
          quantity: { type: "number" },
        },
        required: ["name"],
      },
    });

    expect(schema.items.type).toBe("OBJECT");
    expect(schema.items.properties.name.type).toBe("STRING");
    expect(schema.items.properties.quantity.type).toBe("NUMBER");
    expect(schema.items.required).toEqual(["name"]);
  });

  it("converte propriedades aninhadas em qualquer profundidade", () => {
    const schema = toGeminiSchema({
      type: "object",
      properties: {
        filter: {
          type: "object",
          properties: { tags: { type: "array", items: { type: "string" } } },
        },
      },
      required: ["filter"],
    });

    expect(schema.properties.filter.type).toBe("OBJECT");
    expect(schema.properties.filter.properties.tags.type).toBe("ARRAY");
    expect(schema.properties.filter.properties.tags.items.type).toBe("STRING");
  });

  it("OBJECT sem propriedades não recebe required", () => {
    const schema = toGeminiSchema({ type: "object" });
    expect(schema.properties).toBeUndefined();
    expect(schema.required).toBeUndefined();
  });
});

describe("formatToolsForGemini", () => {
  const tool: ToolDefinition = {
    name: "criar_nota_compra",
    description: "Cria nota de compra",
    scope: "TENANT",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      },
      required: ["items"],
    },
  };

  it("monta o bloco functionDeclarations", () => {
    const out = formatToolsForGemini([tool]);
    expect(out).toHaveLength(1);
    expect(out[0].functionDeclarations).toHaveLength(1);
    expect(out[0].functionDeclarations[0].name).toBe("criar_nota_compra");
  });

  it("o parâmetro array sai com items preenchido", () => {
    const decl = formatToolsForGemini([tool])[0].functionDeclarations[0];
    expect(decl.parameters.properties.items.type).toBe("ARRAY");
    expect(decl.parameters.properties.items.items.type).toBe("OBJECT");
  });
});

describe("findInvalidSchemas", () => {
  it("acusa ARRAY sem items", () => {
    const bad: ToolDefinition = {
      name: "quebrada",
      description: "",
      scope: "TENANT",
      parameters: { type: "object", properties: { lista: { type: "array" } } },
    };
    expect(findInvalidSchemas([bad])).toEqual([
      'quebrada.lista: ARRAY sem "items"',
    ]);
  });

  it("acusa OBJECT sem properties", () => {
    const bad: ToolDefinition = {
      name: "vazia",
      description: "",
      scope: "TENANT",
      parameters: { type: "object", properties: { obj: { type: "object" } } },
    };
    expect(findInvalidSchemas([bad])).toEqual([
      'vazia.obj: OBJECT sem "properties"',
    ]);
  });

  it("não acusa nada em schema válido", () => {
    const good: ToolDefinition = {
      name: "ok",
      description: "",
      scope: "TENANT",
      parameters: {
        type: "object",
        properties: {
          itens: {
            type: "array",
            items: { type: "object", properties: { nome: { type: "string" } } },
          },
        },
      },
    };
    expect(findInvalidSchemas([good])).toEqual([]);
  });
});

describe("catálogo real de ferramentas", () => {
  // Guarda contra a regressão que derrubou o Copiloto: uma ferramenta nova com
  // parâmetro `array` sem `items` faz o Gemini responder 400 e invalida TODAS
  // as chamadas, porque o catálogo inteiro vai em cada requisição.
  const service = new AiToolsService(
    null as any,
    null as any,
    null as any,
    null as any,
  );

  it("nenhuma ferramenta do catálogo tem schema inválido", () => {
    const tools = service.getToolDefinitions("TENANT");
    expect(tools.length).toBeGreaterThan(0);

    const problems = findInvalidSchemas(tools);
    expect(problems).toEqual([]);
  });

  it("o catálogo completo passa pelo formato do Gemini sem erro", () => {
    const tools = service.getToolDefinitions("TENANT");
    const formatted = formatToolsForGemini(tools);

    expect(formatted[0].functionDeclarations).toHaveLength(tools.length);
    for (const decl of formatted[0].functionDeclarations) {
      expect(decl.name).toBeTruthy();
      expect(decl.parameters.type).toBe("OBJECT");
    }
  });

  it("todo parâmetro array do catálogo sai com items APÓS a conversão", () => {
    // Importante checar a SAÍDA, não o schema bruto: o catálogo já tinha
    // `items`, e foi a conversão que os descartava — gerando o 400. Um teste
    // sobre o schema bruto passaria mesmo com o bug presente.
    const tools = service.getToolDefinitions("TENANT");
    const formatted = formatToolsForGemini(tools);

    const missing: string[] = [];

    const walk = (schema: any, path: string) => {
      if (!schema || typeof schema !== "object") return;
      if (schema.type === "ARRAY") {
        if (!schema.items) missing.push(path);
        else walk(schema.items, `${path}[]`);
      }
      if (schema.properties) {
        for (const [k, v] of Object.entries(schema.properties)) {
          walk(v, `${path}.${k}`);
        }
      }
    };

    for (const decl of formatted[0].functionDeclarations) {
      walk(decl.parameters, decl.name);
    }

    expect(missing).toEqual([]);
  });

  it("a ferramenta de nota de compra preserva os items na conversão", () => {
    const tools = service.getToolDefinitions("TENANT");
    const formatted = formatToolsForGemini(tools);
    const decl = formatted[0].functionDeclarations.find(
      (d) => d.name === "criar_nota_compra",
    );

    expect(decl).toBeDefined();
    const itemsParam = decl!.parameters.properties.items;
    expect(itemsParam.type).toBe("ARRAY");
    expect(itemsParam.items.type).toBe("OBJECT");
    expect(itemsParam.items.properties.name.type).toBe("STRING");
  });
});
