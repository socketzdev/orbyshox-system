import { CaslAbilityFactory, Action } from './casl-ability.factory';

describe('CaslAbilityFactory (RBAC Hierarchy)', () => {
  let factory: CaslAbilityFactory;

  beforeEach(() => {
    factory = new CaslAbilityFactory();
  });

  describe('fail-closed', () => {
    it('nega tudo quando o papel é desconhecido', () => {
      const ability = factory.createForUser({ id: 'u-x', role: 'ADMIN' });

      expect(ability.can(Action.Manage, 'all')).toBe(false);
      expect(ability.can(Action.Read, 'Order')).toBe(false);
      expect(ability.can(Action.Read, 'Product')).toBe(false);
    });

    it('nega tudo quando não há usuário', () => {
      const ability = factory.createForUser(null);
      expect(ability.can(Action.Read, 'Order')).toBe(false);
    });

    it('normaliza caixa e espaços do papel', () => {
      const ability = factory.createForUser({ id: 'u-y', role: ' tenant_admin ' });
      expect(ability.can(Action.Manage, 'Order')).toBe(true);
    });
  });

  // ─── Plataforma ───────────────────────────────────────────────────────────

  describe('SUPER_ADMIN', () => {
    it('should have full management access to all entities', () => {
      const user = { id: 'u-admin', role: 'SUPER_ADMIN' };
      const ability = factory.createForUser(user);

      expect(ability.can(Action.Manage, 'all')).toBe(true);
      expect(ability.can(Action.Create, 'Tenant')).toBe(true);
      expect(ability.can(Action.Delete, 'Billing')).toBe(true);
      expect(ability.can(Action.Manage, 'Settings')).toBe(true);
    });
  });

  describe('SUPPORT_MANAGER', () => {
    it('should be able to manage Tickets and read Tenants, but NOT manage Billing, Plan, or Settings', () => {
      const user = { id: 'u-sup-mgr', role: 'SUPPORT_MANAGER' };
      const ability = factory.createForUser(user);

      expect(ability.can(Action.Manage, 'Ticket')).toBe(true);
      expect(ability.can(Action.Read, 'Tenant')).toBe(true);
      expect(ability.can(Action.Manage, 'Billing')).toBe(false);
      expect(ability.can(Action.Manage, 'Plan')).toBe(false);
      expect(ability.can(Action.Manage, 'Settings')).toBe(false);
    });
  });

  describe('SUPPORT_AGENT', () => {
    it('should be able to read Tickets and Tenants, but only update assigned Tickets', () => {
      const user = { id: 'u-agent-1', role: 'SUPPORT_AGENT' };
      const ability = factory.createForUser(user);

      expect(ability.can(Action.Read, 'Ticket')).toBe(true);
      expect(ability.can(Action.Read, 'Tenant')).toBe(true);
      expect(ability.can(Action.Manage, 'Billing')).toBe(false);
    });
  });

  describe('FINANCE', () => {
    it('should manage Billing, Invoices, Subscriptions and read Tenants, but NOT manage Settings or Staff', () => {
      const user = { id: 'u-fin', role: 'FINANCE' };
      const ability = factory.createForUser(user);

      expect(ability.can(Action.Manage, 'Billing')).toBe(true);
      expect(ability.can(Action.Manage, 'Invoice')).toBe(true);
      expect(ability.can(Action.Manage, 'Subscription')).toBe(true);
      expect(ability.can(Action.Read, 'Tenant')).toBe(true);
      expect(ability.can(Action.Manage, 'Settings')).toBe(false);
      expect(ability.can(Action.Manage, 'Staff')).toBe(false);
    });
  });

  describe('DEV', () => {
    it('should manage Settings and Integrations and read AuditLog, but NOT manage Billing', () => {
      const user = { id: 'u-dev', role: 'DEV' };
      const ability = factory.createForUser(user);

      expect(ability.can(Action.Manage, 'Settings')).toBe(true);
      expect(ability.can(Action.Manage, 'Integration')).toBe(true);
      expect(ability.can(Action.Read, 'AuditLog')).toBe(true);
      expect(ability.can(Action.Manage, 'Billing')).toBe(false);
    });
  });

  // ─── Tenant ───────────────────────────────────────────────────────────────
  // Papel de tenant nunca alcança sujeito de plataforma.

  describe('TENANT_ADMIN', () => {
    it('gerencia todos os sujeitos do próprio tenant', () => {
      const ability = factory.createForUser({ id: 'u-ta', role: 'TENANT_ADMIN' });

      expect(ability.can(Action.Manage, 'Order')).toBe(true);
      expect(ability.can(Action.Delete, 'Supplier')).toBe(true);
      expect(ability.can(Action.Delete, 'StockBatch')).toBe(true);
      expect(ability.can(Action.Delete, 'BillPayable')).toBe(true);
      expect(ability.can(Action.Manage, 'Employee')).toBe(true);
    });

    it('não alcança sujeitos de plataforma', () => {
      const ability = factory.createForUser({ id: 'u-ta', role: 'TENANT_ADMIN' });

      expect(ability.can(Action.Read, 'Billing')).toBe(false);
      expect(ability.can(Action.Manage, 'Tenant')).toBe(false);
      expect(ability.can(Action.Manage, 'Settings')).toBe(false);
      expect(ability.can(Action.Manage, 'all')).toBe(false);
    });
  });

  describe('TENANT_OWNER (legado do banco)', () => {
    it('recebe o mesmo poder do TENANT_ADMIN — senão ficaria sem permissão nenhuma', () => {
      const ability = factory.createForUser({ id: 'u-own', role: 'TENANT_OWNER' });

      expect(ability.can(Action.Manage, 'Order')).toBe(true);
      expect(ability.can(Action.Delete, 'Supplier')).toBe(true);
      expect(ability.can(Action.Manage, 'Employee')).toBe(true);
      expect(ability.can(Action.Read, 'Billing')).toBe(false);
    });
  });

  describe('STORE_MANAGER', () => {
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser({ id: 'u-gm', role: 'STORE_MANAGER' });
    });

    it('opera o dia a dia: cria fornecedor, recebe pedido, importa e finaliza NF-e', () => {
      expect(ability.can(Action.Create, 'Supplier')).toBe(true);
      expect(ability.can(Action.Update, 'Supplier')).toBe(true);
      expect(ability.can(Action.Create, 'PurchaseOrder')).toBe(true);
      expect(ability.can(Action.Update, 'PurchaseOrder')).toBe(true);
      expect(ability.can(Action.Create, 'Nfe')).toBe(true);
      expect(ability.can(Action.Update, 'Nfe')).toBe(true);
      expect(ability.can(Action.Update, 'StoreSettings')).toBe(true);
    });

    it('NÃO exclui nada — exclusão é irreversível e fica com o TENANT_ADMIN', () => {
      expect(ability.can(Action.Delete, 'Supplier')).toBe(false);
      expect(ability.can(Action.Delete, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Delete, 'BillPayable')).toBe(false);
      expect(ability.can(Action.Delete, 'BillReceivable')).toBe(false);
      expect(ability.can(Action.Delete, 'Table')).toBe(false);
    });

    it('pode finalizar NF-e e aprovar correção por PIN', () => {
      expect(ability.can(Action.Finalize, 'Nfe')).toBe(true);
      expect(ability.can(Action.Approve, 'Order')).toBe(true);
    });

    it('vê o fluxo de caixa (Finance)', () => {
      expect(ability.can(Action.Read, 'Finance')).toBe(true);
    });

    it('não gerencia a equipe (Employee é do TENANT_ADMIN), mas lê a lista', () => {
      expect(ability.can(Action.Manage, 'Employee')).toBe(false);
      expect(ability.can(Action.Create, 'Employee')).toBe(false);
      expect(ability.can(Action.Update, 'Employee')).toBe(false);
      expect(ability.can(Action.Delete, 'Employee')).toBe(false);
      expect(ability.can(Action.Read, 'Employee')).toBe(true);
    });

    it('não alcança sujeitos de plataforma', () => {
      expect(ability.can(Action.Read, 'Billing')).toBe(false);
      expect(ability.can(Action.Read, 'AuditLog')).toBe(false);
    });
  });

  describe('CASHIER', () => {
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser({ id: 'u-cx', role: 'CASHIER' });
    });

    it('opera o PDV: venda, caixa, mesas e devolução', () => {
      expect(ability.can(Action.Create, 'Order')).toBe(true);
      expect(ability.can(Action.Update, 'Order')).toBe(true);
      expect(ability.can(Action.Create, 'CashRegister')).toBe(true);
      expect(ability.can(Action.Update, 'CashRegister')).toBe(true);
      expect(ability.can(Action.Read, 'Product')).toBe(true);
    });

    it('marca conta como paga (com trilha) mas não navega o financeiro', () => {
      expect(ability.can(Action.Update, 'BillPayable')).toBe(true);
      expect(ability.can(Action.Update, 'BillReceivable')).toBe(true);
      expect(ability.can(Action.Read, 'BillPayable')).toBe(false);
      expect(ability.can(Action.Delete, 'BillPayable')).toBe(false);
    });

    it('não finaliza NF-e, não apaga fornecedor, não apaga lote, não mexe em estoque', () => {
      expect(ability.can(Action.Update, 'Nfe')).toBe(false);
      expect(ability.can(Action.Create, 'Nfe')).toBe(false);
      expect(ability.can(Action.Finalize, 'Nfe')).toBe(false);
      expect(ability.can(Action.Delete, 'Supplier')).toBe(false);
      expect(ability.can(Action.Delete, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Update, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Update, 'StockMovement')).toBe(false);
    });

    it('não aprova correção nem vê o fluxo de caixa', () => {
      expect(ability.can(Action.Approve, 'Order')).toBe(false);
      expect(ability.can(Action.Read, 'Finance')).toBe(false);
    });

    it('não altera preço de venda', () => {
      expect(ability.can(Action.Update, 'Product', 'salePriceCents')).toBe(false);
      expect(ability.can(Action.Update, 'Product')).toBe(false);
    });

    it('não gerencia funcionários', () => {
      expect(ability.can(Action.Manage, 'Employee')).toBe(false);
      expect(ability.can(Action.Create, 'Employee')).toBe(false);
      expect(ability.can(Action.Read, 'Employee')).toBe(true);
    });
  });

  describe('STOCKIST', () => {
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser({ id: 'u-st', role: 'STOCKIST' });
    });

    it('recebe pedido, ajusta estoque e reconcilia NF-e', () => {
      expect(ability.can(Action.Update, 'PurchaseOrder')).toBe(true);
      expect(ability.can(Action.Create, 'StockMovement')).toBe(true);
      expect(ability.can(Action.Update, 'Nfe')).toBe(true);
      expect(ability.can(Action.Read, 'StockBatch')).toBe(true);
    });

    it('NÃO importa nem finaliza NF-e', () => {
      expect(ability.can(Action.Create, 'Nfe')).toBe(false);
      expect(ability.can(Action.Finalize, 'Nfe')).toBe(false);
    });

    it('não apaga lote nem fornecedor', () => {
      expect(ability.can(Action.Delete, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Delete, 'Supplier')).toBe(false);
    });

    it('não altera preço de venda do produto', () => {
      expect(ability.can(Action.Update, 'Product')).toBe(true);
      expect(ability.can(Action.Update, 'Product', 'salePriceCents')).toBe(false);
    });

    it('edita validade do lote, mas NUNCA a quantidade por PATCH livre', () => {
      expect(ability.can(Action.Update, 'StockBatch')).toBe(true);
      expect(ability.can(Action.Update, 'StockBatch', 'expiryDate')).toBe(true);
      expect(ability.can(Action.Update, 'StockBatch', 'quantity')).toBe(false);
      expect(ability.can(Action.Update, 'StockBatch', 'costCents')).toBe(false);
    });

    it('não acessa financeiro nem configurações da loja', () => {
      expect(ability.can(Action.Read, 'BillPayable')).toBe(false);
      expect(ability.can(Action.Update, 'StoreSettings')).toBe(false);
      expect(ability.can(Action.Manage, 'Employee')).toBe(false);
    });
  });

  describe('WAITER', () => {
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser({ id: 'u-wt', role: 'WAITER' });
    });

    it('o mapa de mesas é o painel dele: controla mesa, sessão e chamada', () => {
      expect(ability.can(Action.Create, 'Order')).toBe(true);
      expect(ability.can(Action.Update, 'Order')).toBe(true);
      expect(ability.can(Action.Create, 'Table')).toBe(true);
      expect(ability.can(Action.Update, 'Table')).toBe(true);
      expect(ability.can(Action.Delete, 'Table')).toBe(true);
      expect(ability.can(Action.Update, 'TableSession')).toBe(true);
      expect(ability.can(Action.Update, 'WaiterCall')).toBe(true);
      expect(ability.can(Action.Read, 'Product')).toBe(true);
      expect(ability.can(Action.Read, 'StoreSettings')).toBe(true);
    });

    it('não altera desconto nem total do pedido', () => {
      expect(ability.can(Action.Update, 'Order', 'discountCents')).toBe(false);
      expect(ability.can(Action.Update, 'Order', 'totalCents')).toBe(false);
    });

    it('não exclui PEDIDO (apagar mesa é do mapa dele, apagar venda não)', () => {
      expect(ability.can(Action.Delete, 'Order')).toBe(false);
      expect(ability.can(Action.Delete, 'Table')).toBe(true);
      expect(ability.can(Action.Delete, 'Supplier')).toBe(false);
      expect(ability.can(Action.Delete, 'StockBatch')).toBe(false);
    });

    it('não acessa estoque, preço, financeiro nem fornecedor', () => {
      expect(ability.can(Action.Update, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Read, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Update, 'Product')).toBe(false);
      expect(ability.can(Action.Read, 'BillPayable')).toBe(false);
      expect(ability.can(Action.Read, 'Supplier')).toBe(false);
      expect(ability.can(Action.Update, 'Nfe')).toBe(false);
      expect(ability.can(Action.Read, 'CashRegister')).toBe(false);
    });

    it('não aprova correção (PIN é de gerente/admin)', () => {
      expect(ability.can(Action.Approve, 'Order')).toBe(false);
    });
  });

  describe('KITCHEN', () => {
    it('lê pedidos e muda status de preparo, mas não mexe em valor', () => {
      const ability = factory.createForUser({ id: 'u-kt', role: 'KITCHEN' });

      expect(ability.can(Action.Read, 'Order')).toBe(true);
      expect(ability.can(Action.Update, 'Order')).toBe(true);
      expect(ability.can(Action.Update, 'Order', 'totalCents')).toBe(false);
      expect(ability.can(Action.Update, 'Order', 'paymentMethod')).toBe(false);
      expect(ability.can(Action.Create, 'Order')).toBe(false);
      expect(ability.can(Action.Read, 'BillPayable')).toBe(false);
    });
  });

  describe('TENANT_EMPLOYEE (papel genérico / default do schema)', () => {
    it('recebe o mínimo para operar, sem estoque, financeiro ou exclusões', () => {
      const ability = factory.createForUser({ id: 'u-emp', role: 'TENANT_EMPLOYEE' });

      expect(ability.can(Action.Read, 'Product')).toBe(true);
      expect(ability.can(Action.Create, 'Order')).toBe(true);
      expect(ability.can(Action.Update, 'Order', 'discountCents')).toBe(false);
      expect(ability.can(Action.Read, 'StockBatch')).toBe(false);
      expect(ability.can(Action.Read, 'BillPayable')).toBe(false);
      expect(ability.can(Action.Delete, 'Order')).toBe(false);
      expect(ability.can(Action.Manage, 'Employee')).toBe(false);
    });
  });

  // ─── Cargos operacionais do restaurante ────────────────────────────────────

  describe('WAITER (matriz do salão)', () => {
    it('vê KDS/PDV/tarefas, mas não relatórios nem financeiro', () => {
      const ability = factory.createForUser({ id: 'u-wt2', role: 'WAITER' });

      expect(ability.can(Action.Read, 'Order')).toBe(true);
      expect(ability.can(Action.Create, 'Order')).toBe(true);
      expect(ability.can(Action.Read, 'Task')).toBe(true);
      expect(ability.can(Action.Update, 'Task')).toBe(true);
      expect(ability.can(Action.Create, 'Task')).toBe(true);
      expect(ability.can(Action.Delete, 'Task')).toBe(false);
      expect(ability.can(Action.Read, 'Report')).toBe(false);
      expect(ability.can(Action.Read, 'Finance')).toBe(false);
    });
  });

  describe('KITCHEN (matriz da cozinha)', () => {
    it('opera KDS, compras e tarefas — sem criar pedido nem ver financeiro', () => {
      const ability = factory.createForUser({ id: 'u-kt2', role: 'KITCHEN' });

      expect(ability.can(Action.Read, 'PurchaseNote')).toBe(true);
      expect(ability.can(Action.Create, 'PurchaseNote')).toBe(true);
      expect(ability.can(Action.Update, 'PurchaseNote')).toBe(true);
      expect(ability.can(Action.Read, 'Task')).toBe(true);
      expect(ability.can(Action.Update, 'Task')).toBe(true);
      expect(ability.can(Action.Create, 'Order')).toBe(false);
      expect(ability.can(Action.Read, 'Report')).toBe(false);
      expect(ability.can(Action.Delete, 'Task')).toBe(false);
    });
  });

  describe('CLEANING (limpeza/serviços gerais)', () => {
    it('só rotinas: lê e conclui tarefas, nada além disso', () => {
      const ability = factory.createForUser({ id: 'u-cl', role: 'CLEANING' });

      expect(ability.can(Action.Read, 'Task')).toBe(true);
      expect(ability.can(Action.Update, 'Task')).toBe(true);
      expect(ability.can(Action.Create, 'Task')).toBe(true);
      expect(ability.can(Action.Read, 'Order')).toBe(false);
      expect(ability.can(Action.Read, 'Report')).toBe(false);
      expect(ability.can(Action.Manage, 'Employee')).toBe(false);
      expect(ability.can(Action.Delete, 'Task')).toBe(false);
    });
  });

  describe('acúmulo de função via tags', () => {
    it('garçom com tag CLEANING soma as rotinas de limpeza sem perder o salão', () => {
      const ability = factory.createForUser({ id: 'u-wc', role: 'WAITER', tags: '["CLEANING"]' });

      expect(ability.can(Action.Read, 'Task')).toBe(true);
      expect(ability.can(Action.Update, 'Task')).toBe(true);
      expect(ability.can(Action.Create, 'Order')).toBe(true);
      expect(ability.can(Action.Read, 'Report')).toBe(false);
    });

    it('aceita tags como array e ignora lixo', () => {
      const ability = factory.createForUser({ id: 'u-wc2', role: 'KITCHEN', tags: ['cleaning', 'ROOT'] } as any);

      expect(ability.can(Action.Update, 'Task')).toBe(true);
      expect(ability.can(Action.Manage, 'Employee')).toBe(false);
    });

    it('sem tag não soma nada', () => {
      const ability = factory.createForUser({ id: 'u-w3', role: 'WAITER', tags: '[]' });

      expect(ability.can(Action.Update, 'Task')).toBe(true); // do próprio cargo
      expect(ability.can(Action.Read, 'Report')).toBe(false);
    });
  });

  describe('STORE_MANAGER (salão)', () => {
    it('abre/fecha/transfere comandas e atende chamados', () => {
      const ability = factory.createForUser({ id: 'u-gm2', role: 'STORE_MANAGER' });

      expect(ability.can(Action.Create, 'TableSession')).toBe(true);
      expect(ability.can(Action.Update, 'TableSession')).toBe(true);
      expect(ability.can(Action.Update, 'WaiterCall')).toBe(true);
      expect(ability.can(Action.Create, 'Task')).toBe(true);
      expect(ability.can(Action.Delete, 'Task')).toBe(true);
    });
  });
});
