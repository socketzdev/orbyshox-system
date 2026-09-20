import {
  extractPriceCents,
  extractTime,
  parseIntent,
} from "./ai-heuristic.service";

describe("extractTime", () => {
  it("lê HH:MM", () => {
    expect(extractTime("repor guardanapos às 19:00")).toBe("19:00");
    expect(extractTime("às 8:30")).toBe("08:30");
  });

  it('lê "19h" e "às 19"', () => {
    expect(extractTime("limpar o chão as 22h")).toBe("22:00");
    expect(extractTime("fechar o caixa às 23")).toBe("23:00");
  });

  it("devolve null quando não há horário", () => {
    expect(extractTime("crie uma tarefa para limpar o chão")).toBeNull();
  });
});

describe("extractPriceCents", () => {
  it("lê R$ com vírgula", () => {
    expect(extractPriceCents("Hambúrguer por R$ 38,00")).toBe(3800);
    expect(extractPriceCents("R$ 12,50")).toBe(1250);
  });

  it("lê valor inteiro", () => {
    expect(extractPriceCents("por R$ 38")).toBe(3800);
  });

  it("lê milhar com ponto", () => {
    expect(extractPriceCents("R$ 1.299,90")).toBe(129990);
  });
});

describe("parseIntent — tema", () => {
  it("reconhece mudança de cor por nome", () => {
    const intent = parseIntent("mude a cor do painel para verde esmeralda");
    expect(intent?.tool).toBe("alterar_tema_painel");
    expect(intent?.args.colorName).toBe("verde esmeralda");
    expect(intent?.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("reconhece hex direto", () => {
    const intent = parseIntent("coloque o tema #059669");
    expect(intent?.tool).toBe("alterar_tema_painel");
    expect(intent?.args.hex).toBe("#059669");
  });

  it("detecta modo escuro no pedido", () => {
    const intent = parseIntent("mude a cor para azul safira no modo escuro");
    expect(intent?.tool).toBe("alterar_tema_painel");
    expect(intent?.args.darkMode).toBe(true);
  });

  it("reconhece volta ao vinho oficial", () => {
    const intent = parseIntent(
      "volte a cor do painel para o vinho oficial do Bali Jack",
    );
    expect(intent?.tool).toBe("alterar_tema_painel");
    // `resolveColor` faz casamento parcial, então "vinho oficial do bali jack"
    // resolve para a paleta "vinho" — o nome capturado pode vir mais longo.
    expect(intent?.args.colorName).toContain("vinho");
  });

  it("pedido de mudança sem cor vira consulta de baixa confiança", () => {
    const intent = parseIntent("mude a cor do painel");
    expect(intent?.tool).toBe("consultar_tema_painel");
    expect(intent?.confidence).toBeLessThan(0.5);
  });

  it("pergunta sobre a cor atual", () => {
    const intent = parseIntent("qual é a cor atual do painel?");
    expect(intent?.tool).toBe("consultar_tema_painel");
  });
});

describe("parseIntent — tarefas", () => {
  it("cria tarefa com setor, horário e prioridade", () => {
    const intent = parseIntent(
      "crie uma tarefa urgente para o garçom repor guardanapos às 19:00",
    );
    expect(intent?.tool).toBe("criar_tarefa");
    expect(intent?.args.assignedRole).toBe("Garçom");
    expect(intent?.args.dueTime).toBe("19:00");
    expect(intent?.args.priority).toBe("URGENT");
    expect(intent?.args.title.toLowerCase()).toContain("repor guardanapos");
  });

  it("conclui tarefa por trecho do título", () => {
    const intent = parseIntent("conclua a tarefa de organizar mesas");
    expect(intent?.tool).toBe("concluir_tarefa");
    expect(intent?.args.search).toContain("organizar mesas");
  });

  it("listar tarefas quando não há verbo de escrita", () => {
    const intent = parseIntent("quais tarefas estão pendentes?");
    expect(intent?.tool).toBe("consultar_tarefas");
  });

  it("não inventa título vazio", () => {
    const intent = parseIntent("crie uma tarefa");
    expect(intent?.tool).toBe("criar_tarefa");
    expect(intent?.args.title).toBeTruthy();
  });
});

describe("parseIntent — mesas", () => {
  it("cria mesa com número, capacidade e área", () => {
    const intent = parseIntent(
      "adicione uma nova mesa na varanda: Mesa 16 com capacidade para 6 pessoas",
    );
    expect(intent?.tool).toBe("adicionar_mesa");
    expect(intent?.args.number).toBe(16);
    expect(intent?.args.capacity).toBe(6);
    expect(intent?.args.area).toBe("Varanda");
  });

  it("remove mesa pelo número", () => {
    const intent = parseIntent("remova a mesa 12");
    expect(intent?.tool).toBe("remover_mesa");
    expect(intent?.args.number).toBe(12);
  });

  it("consulta mesas", () => {
    const intent = parseIntent("como estão as mesas agora?");
    expect(intent?.tool).toBe("consultar_mesas");
  });
});

describe("parseIntent — compras, equipe e cardápio", () => {
  it("cria nota de compra com insumos", () => {
    const intent = parseIntent("precisamos comprar arroz e caranguejo");
    expect(intent?.tool).toBe("criar_nota_compra");
    expect(intent?.args.items.length).toBeGreaterThanOrEqual(2);
  });

  it("consulta notas de compra", () => {
    const intent = parseIntent("quais notas de compra estão pendentes?");
    expect(intent?.tool).toBe("consultar_notas_compra");
  });

  it("consulta a equipe", () => {
    const intent = parseIntent("quem está na equipe hoje?");
    expect(intent?.tool).toBe("consultar_equipe");
  });

  it("cadastra colaborador com nome", () => {
    const intent = parseIntent(
      "cadastre o funcionário Carlos Silva como cozinheiro",
    );
    expect(intent?.tool).toBe("cadastrar_funcionario");
    expect(intent?.args.name).toContain("Carlos");
    expect(intent?.args.role).toBe("Cozinha");
  });

  it("consulta cardápio", () => {
    const intent = parseIntent("quais pratos temos no cardápio?");
    expect(intent?.tool).toBe("consultar_cardapio");
  });

  it("remove prato do cardápio", () => {
    const intent = parseIntent("remova o prato Camarão Empanado do cardápio");
    expect(intent?.tool).toBe("remover_prato_cardapio");
    expect(intent?.args.permanent).toBe(false);
  });
});

describe("parseIntent — calendário", () => {
  it("consulta a agenda de hoje", () => {
    const intent = parseIntent("o que tenho hoje na agenda?");
    expect(intent?.tool).toBe("consultar_calendario");
    expect(intent?.args.from).toBe("hoje");
  });

  it("consulta a agenda de amanhã", () => {
    const intent = parseIntent("quais compromissos tenho amanhã?");
    expect(intent?.tool).toBe("consultar_calendario");
    expect(intent?.args.from).toBe("amanhã");
  });

  it("cria evento com data e hora", () => {
    const intent = parseIntent("marca reunião amanhã às 14h");
    expect(intent?.tool).toBe("criar_evento_calendario");
    expect(intent?.args.date).toBe("amanha");
    expect(intent?.args.time).toBe("14:00");
    expect(intent?.args.title.toLowerCase()).toContain("reuni");
  });

  it("cancela evento por nome", () => {
    const intent = parseIntent("cancela a reunião de amanhã");
    expect(intent?.tool).toBe("excluir_evento_calendario");
  });

  it("remarca evento com nova hora", () => {
    const intent = parseIntent("remarca a reunião do dentista para 15h");
    expect(intent?.tool).toBe("editar_evento_calendario");
    expect(intent?.args.time).toBe("15:00");
  });
});

describe("parseIntent — academia, serviços e financeiro (só leitura)", () => {
  it("lista alunos vencidos", () => {
    const intent = parseIntent("quais alunos estão vencidos?");
    expect(intent?.tool).toBe("consultar_alunos");
    expect(intent?.args.status).toBe("VENCIDO");
  });

  it("lista ordens de serviço", () => {
    const intent = parseIntent("quais ordens de serviço estão abertas?");
    expect(intent?.tool).toBe("consultar_os");
  });

  it("lista contas a receber", () => {
    const intent = parseIntent("quais contas a receber estão pendentes?");
    expect(intent?.tool).toBe("consultar_contas_receber");
  });

  it("lista contas a pagar", () => {
    const intent = parseIntent("mostre as contas a pagar");
    expect(intent?.tool).toBe("consultar_contas_pagar");
  });
});

describe("parseIntent — segurança", () => {
  it("devolve null para texto sem intenção reconhecível", () => {
    expect(parseIntent("bom dia, tudo bem?")).toBeNull();
    expect(parseIntent("")).toBeNull();
    expect(parseIntent("   ")).toBeNull();
  });

  it("não reconhece ação de escrita sem verbo explícito", () => {
    // Só mencionar "mesa" não pode criar nem apagar nada.
    const intent = parseIntent("a mesa 5 está ocupada");
    expect(intent?.tool).toBe("consultar_mesas");
  });

  it("ignora acento e caixa na interpretação", () => {
    const intent = parseIntent("MUDE A COR PARA AZUL SAFIRA");
    expect(intent?.tool).toBe("alterar_tema_painel");
  });
});
