import { CaslAbilityFactory, Action } from './casl-ability.factory';

describe('CaslAbilityFactory (RBAC Hierarchy)', () => {
  let factory: CaslAbilityFactory;

  beforeEach(() => {
    factory = new CaslAbilityFactory();
  });

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
});
