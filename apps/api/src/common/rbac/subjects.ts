/**
 * Sujeitos CASL — o "objeto" sobre o qual uma ação é executada.
 *
 * Cada sujeito corresponde a um agregado de negócio, não a um endpoint. Isso
 * importa porque o mesmo agregado é tocado por rotas diferentes (ex.: `Order`
 * é criado pelo PDV, pelo salão e pelo QR code).
 */

// ─── Sujeitos de plataforma (equipe interna do SaaS) ────────────────────────

export const PLATFORM_SUBJECTS = [
  "Tenant",
  "Ticket",
  "Billing",
  "Invoice",
  "Subscription",
  "Plan",
  "Coupon",
  "Staff",
  "Settings",
  "Integration",
  "AuditLog",
] as const;

// ─── Sujeitos de tenant (loja cliente) ─────────────────────────────────────

export const TENANT_SUBJECTS = [
  "Order",
  "Table",
  /**
   * Sessão de mesa é sujeito PRÓPRIO, separado de `Table`, porque as operações
   * são de naturezas diferentes: abrir/fechar sessão e transferir mesa é
   * operação de salão (garçom e caixa fazem); renomear, criar, apagar ou girar
   * o QR da mesa é administração do salão (só gerente e admin). Com um único
   * sujeito `Table` não havia como expressar essa diferença.
   */
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
  "Employee",
  "StoreSettings",
  "Customer",
  "Appointment",
  "ModifierGroup",
  "PurchaseNote",
  // Rotinas operacionais (tarefas da cozinha/salão/limpeza). Sujeito próprio
  // para que garçom/cozinha/limpeza concluam tarefas sem ganhar acesso a
  // estoque, financeiro ou equipe.
  "Task",
  // Agenda/calendário da empresa (compromissos, lembretes, eventos). Separado
  // de `Appointment` (atendimento ao cliente com cobrança): ver a agenda não
  // pode implicar ver comandas, e vice-versa.
  "CalendarEvent",
  // Vertical Academia: gestão fitness com dados próprios (alunos, matrículas,
  // check-ins, treinos, aulas). Sujeitos separados para que a recepção faça
  // check-in sem ganhar financeiro, e só admin/professor mexa em treinos.
  "GymStudent",
  "GymEnrollment",
  "GymCheckIn",
  "GymWorkout",
  "GymClass",
  // Vertical Refrigeração: ordens de serviço com ciclo próprio, orçamentos
  // que viram OS e equipamentos do cliente. Sujeitos separados para que o
  // técnico avance a OS sem alcançar o financeiro.
  "ServiceOrder",
  "ServiceQuote",
  "ServiceEquipment",
] as const;

export const SUBJECTS = [...PLATFORM_SUBJECTS, ...TENANT_SUBJECTS] as const;

export type PlatformSubject = (typeof PLATFORM_SUBJECTS)[number];
export type TenantSubject = (typeof TENANT_SUBJECTS)[number];
export type Subject = (typeof SUBJECTS)[number];

/** Nome usado nas regras "manage all" do SUPER_ADMIN. */
export const ALL = "all" as const;
