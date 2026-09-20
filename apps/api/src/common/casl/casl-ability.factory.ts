import { Injectable } from "@nestjs/common";
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from "@casl/ability";
import {
  ALL,
  PLATFORM_SUBJECTS,
  TENANT_SUBJECTS,
  type Subject,
} from "../rbac/subjects";
import { normalizeRole, isTenantRole } from "../rbac/roles";

export enum Action {
  Manage = "manage",
  Create = "create",
  Read = "read",
  Update = "update",
  Delete = "delete",
  /**
   * Operação que gera efeito contábil/estoque em lote e não pode ser desfeita
   * por um simples update. Hoje: finalizar NF-e (lança estoque + contas a
   * pagar). Precisa ser distinta de `Update` porque o estoquista PODE
   * reconciliar itens da NF-e, mas NÃO pode finalizá-la.
   */
  Finalize = "finalize",
  /**
   * Aprovação por PIN de gerente, exigida quando uma edição cai fora da
   * janela normal (regra R3). Distinta de `Update` de propósito: quem edita
   * não é necessariamente quem aprova.
   */
  Approve = "approve",
}

export type AppAbility = MongoAbility<[Action, Subject | typeof ALL]>;

export interface AbilityUser {
  id?: string;
  role?: string | null;
  /**
   * Acúmulos de função (`User.tags`, JSON). Ex.: garçom que também faz limpeza
   * soma as permissões de limpeza sem trocar de cargo. Só entra por checkbox
   * controlado na tela de equipe — nunca texto livre.
   */
  tags?: string | string[] | null;
}

/** Normaliza `tags` (JSON string ou array) para lista maiúscula. */
export function parseUserTags(tags: AbilityUser["tags"]): string[] {
  if (!tags) return [];
  try {
    const arr = typeof tags === "string" ? JSON.parse(tags) : tags;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t) => typeof t === "string")
      .map((t) => t.trim().toUpperCase());
  } catch {
    return [];
  }
}

/**
 * Constrói a "ability" CASL de um usuário a partir do seu papel.
 *
 * Histórico: a versão anterior cobria apenas papéis de PLATAFORMA
 * (`SUPER_ADMIN`, `SUPPORT_MANAGER`, `SUPPORT_AGENT`, `FINANCE`, `DEV`) e
 * caía no `default` — ability vazia — para todo papel de tenant. Como
 * `TENANT_ADMIN` não estava em nenhum `case`, plugar o `PoliciesGuard` sem
 * corrigir isto bloquearia o dono da loja de tudo. Este arquivo resolve o
 * achado B2.
 *
 * Regras de projeto:
 * - **Fail-closed.** Papel ausente, desconhecido ou com caixa diferente do
 *   esperado não recebe nenhuma permissão.
 * - **Sujeitos de plataforma e de tenant não se misturam.** Um
 *   `TENANT_ADMIN` tem poder total *dentro do próprio tenant*; nunca sobre
 *   `Tenant`, `Billing`, `Settings` de plataforma.
 * - **Negar é o padrão.** Só o que está escrito abaixo é permitido.
 *
 * A checagem por campo (`can(Update, 'Product', 'salePriceCents')`) é a
 * segunda camada: o guard decide se a rota passa; o serviço decide se o campo
 * específico pode mudar. As duas precisam concordar.
 */
@Injectable()
export class CaslAbilityFactory {
  createForUser(user: AbilityUser | null | undefined): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    const role = normalizeRole(user?.role);
    if (!role) {
      // Papel desconhecido → sem permissões. Não cai em "todo mundo pode".
      return build();
    }

    switch (role) {
      // ─── Plataforma ───────────────────────────────────────────────────────
      case "SUPER_ADMIN":
        can(Action.Manage, ALL);
        break;

      case "SUPPORT_MANAGER":
        can(Action.Manage, "Ticket");
        can(Action.Read, "Tenant");
        cannot(Action.Manage, "Billing");
        cannot(Action.Manage, "Plan");
        cannot(Action.Manage, "Settings");
        break;

      case "SUPPORT_AGENT":
        can(Action.Read, "Ticket");
        can(Action.Update, "Ticket", { assigneeId: user?.id } as never);
        can(Action.Read, "Tenant");
        break;

      case "FINANCE":
        can(Action.Manage, "Billing");
        can(Action.Manage, "Invoice");
        can(Action.Manage, "Subscription");
        can(Action.Read, "Tenant");
        cannot(Action.Manage, "Settings");
        cannot(Action.Manage, "Staff");
        break;

      case "DEV":
        can(Action.Manage, "Settings");
        can(Action.Manage, "Integration");
        can(Action.Read, "AuditLog");
        cannot(Action.Manage, "Billing");
        break;

      // ─── Tenant ───────────────────────────────────────────────────────────
      // Dono da loja: poder total dentro do tenant, nenhum sujeito de
      // plataforma. É o único que apaga lote, fornecedor e conta a pagar.
      // `TENANT_OWNER` é legado do banco e recebe exatamente o mesmo poder.
      case "TENANT_ADMIN":
      case "TENANT_OWNER":
        can(Action.Manage, [...TENANT_SUBJECTS]);
        break;

      case "STORE_MANAGER":
        // Opera tudo, mas NÃO exclui nada: apagar lote/fornecedor/conta é
        // irreversível e fica restrito ao TENANT_ADMIN (C8, H6, M7).
        can(Action.Read, [
          "Order",
          "Table",
          "TableSession",
          "WaiterCall",
          "CashRegister",
          "Product",
          "StockBatch",
          "StockMovement",
          "Supplier",
          "PurchaseOrder",
          "Nfe",
          "BillPayable",
          "BillReceivable",
          "Finance",
          "Report",
          "StoreSettings",
          "Customer",
          "Appointment",
          "ModifierGroup",
          "PurchaseNote",
          "Task",
          // Academia: o gerente opera alunos, matrículas, treinos e aulas.
          "GymStudent",
          "GymEnrollment",
          "GymCheckIn",
          "GymWorkout",
          "GymClass",
          // Refrigeração: o gerente opera OS, orçamentos e equipamentos.
          "ServiceOrder",
          "ServiceQuote",
          "ServiceEquipment",
          // Agenda da empresa: ver compromissos sem ver comandas.
          "CalendarEvent",
          // Ler a equipe é necessário para montar listas (agenda, atribuição de
          // garçom, comissão). GERIR contas — criar, editar papel, desativar —
          // continua exclusivo do TENANT_ADMIN, abaixo.
          "Employee",
        ]);
        can(Action.Create, [
          "Order",
          "Table",
          "TableSession",
          "WaiterCall",
          "CashRegister",
          "Product",
          "StockMovement",
          "Supplier",
          "PurchaseOrder",
          "Nfe",
          "BillPayable",
          "BillReceivable",
          "Customer",
          "Appointment",
          "ModifierGroup",
          "PurchaseNote",
          "Task",
          "GymStudent",
          "GymEnrollment",
          "GymCheckIn",
          "GymWorkout",
          "GymClass",
          "ServiceOrder",
          "ServiceQuote",
          "ServiceEquipment",
        ]);
        can(Action.Update, [
          "Order",
          "Table",
          "TableSession",
          "WaiterCall",
          "CashRegister",
          "Product",
          "StockBatch",
          "StockMovement",
          "Supplier",
          "PurchaseOrder",
          "Nfe",
          "BillPayable",
          "BillReceivable",
          "StoreSettings",
          "Customer",
          "Appointment",
          "ModifierGroup",
          "PurchaseNote",
          "Task",
          "GymStudent",
          "GymEnrollment",
          "GymCheckIn",
          "GymWorkout",
          "GymClass",
          "ServiceOrder",
          "ServiceQuote",
          "ServiceEquipment",
          "CalendarEvent",
        ]);
        can(Action.Delete, ["Task"]);
        // Operações sensíveis: o gerente PODE finalizar NF-e (gera estoque +
        // contas a pagar) e aprovar correção fora da janela por PIN. O
        // estoquista pode reconciliar, mas não finalizar.
        can(Action.Finalize, "Nfe");
        can(Action.Approve, "Order");
        // `Employee` fora: só o TENANT_ADMIN gerencia a equipe.
        break;

      case "CASHIER":
        can(Action.Read, [
          "Order",
          "Table",
          "TableSession",
          "Product",
          "CashRegister",
          "Customer",
          "Appointment",
          "Report",
          "StoreSettings",
          "Employee",
          "Task",
          // Recepção da academia: consulta alunos/aulas e opera a catraca.
          "GymStudent",
          "GymClass",
          "GymCheckIn",
          // Atendimento da refrigeração: consulta OS/orçamentos e cadastra.
          "ServiceOrder",
          "ServiceQuote",
          "ServiceEquipment",
          // Agenda da empresa (leitura): o caixa vê compromissos sem ver comandas.
          "CalendarEvent",
        ]);
        can(Action.Create, [
          "Order",
          "TableSession",
          "CashRegister",
          "Customer",
          "Appointment",
          "Task",
          "GymCheckIn",
          "ServiceOrder",
          "ServiceQuote",
          "ServiceEquipment",
        ]);
        // Sessão de mesa sim; a MESA em si (criar, renomear, apagar, girar QR)
        // é administração do salão — gerente e admin.
        can(Action.Update, [
          "Order",
          "TableSession",
          "CashRegister",
          "Customer",
          "Appointment",
          "Task",
          "GymCheckIn",
          "ServiceQuote",
        ]);
        // Financeiro: marca conta como paga/recebida (com trilha), mas NÃO
        // navega a lista de contas — conforme matriz validada.
        can(Action.Update, ["BillPayable", "BillReceivable"]);
        // Nunca: estoque, lote, fornecedor, NF-e, preço, exclusões.
        break;

      case "STOCKIST":
        can(Action.Read, [
          "Product",
          "StockBatch",
          "StockMovement",
          "Supplier",
          "PurchaseOrder",
          "Nfe",
          "Employee",
          "Task",
        ]);
        can(Action.Create, ["StockMovement", "PurchaseOrder", "Task"]);
        can(Action.Update, [
          "Product",
          "StockBatch",
          "StockMovement",
          "PurchaseOrder",
          "Nfe",
          "Task",
        ]);
        // Preço de venda não é atribuição do estoquista.
        cannot(Action.Update, "Product", ["salePriceCents"]);
        // Quantidade de lote NUNCA por PATCH livre — só por movimento de
        // estoque rastreado (Kardex). Aqui só validade e status.
        cannot(Action.Update, "StockBatch", [
          "quantity",
          "costCents",
          "lotNumber",
        ]);
        break;

      case "WAITER":
        // O mapa de mesas (`restaurant-tables-page.tsx`) É o painel do garçom:
        // criar, editar, apagar mesa, parear tablet e girar QR saem todos dessa
        // mesma tela, que é a tela inicial do cargo. Restringir isso quebraria
        // o painel inteiro — não é operação "administrativa" na prática.
        can(Action.Manage, ["Table", "TableSession", "WaiterCall"]);
        // Sem Report/Finance/Settings de gestão: o garçom opera salão (mesas,
        // KDS, PDV, tarefas) — relatório e fechamento são do gerente.
        can(Action.Read, [
          "Order",
          "Product",
          "Customer",
          "Employee",
          "StoreSettings",
          "Task",
        ]);
        can(Action.Create, ["Order", "Customer", "Task"]);
        can(Action.Update, ["Order", "Task"]);
        // Corrige o pedido, não o valor. A janela de tempo e a autoria são
        // verificadas no serviço (regra R1).
        cannot(Action.Update, "Order", ["discountCents", "totalCents"]);
        break;

      case "KITCHEN":
        can(Action.Read, [
          "Order",
          "Product",
          "WaiterCall",
          "Employee",
          "Task",
          "PurchaseNote",
        ]);
        can(Action.Create, ["PurchaseNote", "Task"]);
        can(Action.Update, ["Order", "Task", "PurchaseNote"]);
        // Cozinha muda status de preparo e toca a lista de compras, nunca
        // valor/forma de pagamento de pedido.
        cannot(Action.Update, "Order", [
          "subtotalCents",
          "discountCents",
          "totalCents",
          "paymentMethod",
        ]);
        break;

      case "CLEANING":
        // Limpeza/serviços gerais: só rotinas. Cargo próprio ou acúmulo
        // (`User.tags`) — ver união abaixo.
        can(Action.Read, ["Task", "Employee"]);
        can(Action.Create, ["Task"]);
        can(Action.Update, ["Task"]);
        break;

      case "TENANT_EMPLOYEE":
        // Papel genérico e também o `@default` de `User.role` no schema —
        // por isso é deliberadamente o mais restrito. Recomendação: atribuir
        // um papel explícito a todo funcionário (ver B4).
        // O técnico de campo avança a OS e consulta peças/equipamentos.
        can(Action.Read, [
          "Product",
          "Order",
          "Table",
          "TableSession",
          "Customer",
          "Employee",
          "Task",
          "GymStudent",
          "GymClass",
          "GymCheckIn",
          "ServiceOrder",
          "ServiceQuote",
          "ServiceEquipment",
          "CalendarEvent",
        ]);
        can(Action.Create, [
          "Order",
          "TableSession",
          "Customer",
          "Task",
          "GymCheckIn",
          "ServiceOrder",
        ]);
        can(Action.Update, [
          "Order",
          "TableSession",
          "Task",
          "GymCheckIn",
          "ServiceOrder",
        ]);
        cannot(Action.Update, "Order", ["discountCents", "totalCents"]);
        break;
    }

    // Acúmulo de função: quem tem a tag soma as permissões correspondentes sem
    // trocar de cargo (ex.: garçom que também faz limpeza conclui rotinas de
    // limpeza). União pura — nunca remove nada do cargo principal.
    if (parseUserTags(user?.tags).includes("CLEANING")) {
      can(Action.Read, ["Task", "Employee"]);
      can(Action.Create, ["Task"]);
      can(Action.Update, ["Task"]);
    }

    // Defesa em profundidade: papel de tenant nunca alcança sujeito de
    // plataforma, mesmo que uma regra futura seja adicionada por engano.
    // `TENANT_ADMIN` tem `manage all` restrito a `TENANT_SUBJECTS`, mas a
    // negação explícita abaixo documenta e trava a intenção.
    if (isTenantRole(role)) {
      cannot(Action.Manage, [...PLATFORM_SUBJECTS]);
      cannot(Action.Create, [...PLATFORM_SUBJECTS]);
      cannot(Action.Update, [...PLATFORM_SUBJECTS]);
      cannot(Action.Delete, [...PLATFORM_SUBJECTS]);
    }

    return build();
  }
}
