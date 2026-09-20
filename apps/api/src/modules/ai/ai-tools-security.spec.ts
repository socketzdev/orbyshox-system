import { AiToolsService, redactToolArgs } from "./ai-tools.service";
import { CaslAbilityFactory } from "../../common/casl/casl-ability.factory";

/**
 * Portão de segurança das tools da IA (fail-closed):
 * RBAC por cargo, GLOBAL só para suporte, confirmação em destrutivas,
 * catálogo sem excluir-empresa e logs sem segredos.
 */
describe("AiToolsService — portão de segurança", () => {
  let service: AiToolsService;
  let prisma: any;

  const ADMIN = { id: "admin-1", role: "TENANT_ADMIN" };
  const WAITER = { id: "waiter-1", role: "WAITER" };
  const EMPLOYEE = { id: "emp-1", role: "TENANT_EMPLOYEE" };
  const SUPER = { id: "super-1", role: "SUPER_ADMIN" };
  const ctx = (user: any, extra: any = {}) => ({
    tenantId: "t1",
    companyId: "t1",
    isSuperAdmin: user.role === "SUPER_ADMIN",
    user,
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      table: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
      },
      tenant: { count: jest.fn(async () => 3) },
      user: { count: jest.fn(async () => 10) },
    };
    service = new AiToolsService(
      prisma,
      new CaslAbilityFactory(),
      null as any,
      null as any,
    );
  });

  it("funcionário genérico não remove mesa (Delete Table negado), admin passa do RBAC", async () => {
    const denied = await service.executeTool(
      "remover_mesa",
      { number: 5 },
      ctx(EMPLOYEE),
    );
    expect(denied.success).toBe(false);
    expect(denied.data.error).toMatch(/papel insuficiente/i);

    // Admin passa do RBAC: mesa inexistente = erro de negócio, não de permissão.
    const adminRes = await service.executeTool(
      "remover_mesa",
      { number: 5 },
      ctx(ADMIN),
    );
    expect(adminRes.data.error).not.toMatch(/permissão/i);
  });

  it("fechar conta exige confirm:true mesmo para admin", async () => {
    const res = await service.executeTool(
      "fechar_conta_mesa",
      { tableNumber: 3 },
      ctx(ADMIN),
    );
    expect(res.success).toBe(false);
    expect(res.data.needsConfirmation).toBe(true);
  });

  it("GLOBAL negada para dono da empresa, liberada para suporte", async () => {
    const denied = await service.executeTool(
      "metricas_plataforma_global",
      {},
      ctx(ADMIN),
    );
    expect(denied.success).toBe(false);
    expect(denied.data.error).toMatch(/plataforma/i);

    const ok = await service.executeTool(
      "metricas_plataforma_global",
      {},
      ctx(SUPER, { tenantId: undefined, companyId: undefined }),
    );
    expect(ok.success).toBe(true);
    expect(ok.data.totalEmpresas).toBe(3);
  });

  it("TENANT sem empresa identificada é recusada", async () => {
    const res = await service.executeTool(
      "consultar_mesas",
      {},
      ctx(ADMIN, { tenantId: undefined, companyId: undefined }),
    );
    expect(res.success).toBe(false);
  });

  it("tool desconhecida nunca executa", async () => {
    const res = await service.executeTool("excluir_empresa", {}, ctx(SUPER));
    expect(res.success).toBe(false);
    expect(res.data.error).toBe("Unknown tool");
  });

  it("catálogo não tem excluir-empresa nem acesso fora da empresa", () => {
    const names = service.getToolDefinitions("TENANT").map((t) => t.name);
    expect(names).not.toContain("excluir_empresa");
    expect(
      names.filter((n) =>
        /excluir_empresa|deletar_empresa|apagar_empresa|delete_tenant/i.test(n),
      ),
    ).toEqual([]);
    const globals = service.getToolDefinitions("GLOBAL").map((t) => t.name);
    expect(globals).toEqual(
      expect.arrayContaining([
        "metricas_plataforma_global",
        "resumo_tickets_suporte",
      ]),
    );
  });

  it("logs mascaram senha e segredos", () => {
    expect(
      redactToolArgs({ name: "Ana", password: "segredo123", notes: "ok" }),
    ).toEqual({
      name: "Ana",
      password: "***",
      notes: "ok",
    });
  });

  it("leitura liberada para cargo operacional (garçom consulta mesas)", async () => {
    const res = await service.executeTool("consultar_mesas", {}, ctx(WAITER));
    expect(res.success).toBe(true);
  });
});
