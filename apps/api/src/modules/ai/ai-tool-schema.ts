import type { ToolDefinition } from './ai-tools.service';

/**
 * Converte o JSON Schema interno das ferramentas para o `Schema` do Gemini
 * Function Calling.
 *
 * **Por que isto é um módulo separado e testado:** todas as ferramentas viajam
 * em *toda* requisição ao Gemini. Uma única declaração inválida faz a API
 * rejeitar a chamada inteira com **400**, derrubando o Copiloto por completo —
 * foi exatamente o que aconteceu quando uma ferramenta passou a usar um
 * parâmetro de lista e o conversor (que só tratava o nível raiz) não emitia o
 * `items` obrigatório para `ARRAY`.
 *
 * Regras aplicadas:
 *  - `array` **exige** `items` (o Gemini rejeita sem ele).
 *  - `object` exige `properties`; `required` só é enviado quando há propriedades.
 *  - A conversão é recursiva, então aninhamento em qualquer profundidade funciona.
 *  - `enum` só é incluído quando há valores (lista vazia também é inválida).
 */
export function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return { type: 'STRING' };
  }

  const type = String(schema.type || 'string').toUpperCase();
  const out: any = { type };

  if (schema.description) out.description = schema.description;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    out.enum = schema.enum;
  }

  if (type === 'ARRAY') {
    // Sem `items` o Gemini responde 400 e invalida a chamada inteira.
    out.items = toGeminiSchema(schema.items || { type: 'string' });
  }

  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(prop);
    }
    out.required = Array.isArray(schema.required) ? schema.required : [];
  }

  return out;
}

/** Monta o bloco `tools` do payload do Gemini. */
export function formatToolsForGemini(tools: ToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.parameters),
      })),
    },
  ];
}

/**
 * Valida que toda declaração é aceitável pelo Gemini.
 * Usado em teste para garantir que nenhuma ferramenta nova quebre o Copiloto.
 */
export function findInvalidSchemas(tools: ToolDefinition[]): string[] {
  const problems: string[] = [];

  const walk = (schema: any, path: string) => {
    if (!schema || typeof schema !== 'object') return;

    const type = String(schema.type || '').toUpperCase();

    if (type === 'ARRAY' && !schema.items) {
      problems.push(`${path}: ARRAY sem "items"`);
    }
    if (type === 'OBJECT' && !schema.properties) {
      problems.push(`${path}: OBJECT sem "properties"`);
    }
    if (Array.isArray(schema.enum) && schema.enum.length === 0) {
      problems.push(`${path}: enum vazio`);
    }

    if (schema.items) walk(schema.items, `${path}[]`);
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        walk(prop, `${path}.${key}`);
      }
    }
  };

  for (const tool of tools) {
    walk(tool.parameters, tool.name);
  }

  return problems;
}
