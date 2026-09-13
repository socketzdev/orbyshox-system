import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
}

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: any) {
    const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

    switch(user.role) {
      case 'SUPER_ADMIN':
        can(Action.Manage, 'all');
        break;
      case 'SUPPORT_MANAGER':
        can(Action.Manage, 'Ticket');
        can(Action.Read, 'Tenant');
        cannot(Action.Manage, 'Billing');
        cannot(Action.Manage, 'Plan');
        cannot(Action.Manage, 'Settings');
        break;
      case 'SUPPORT_AGENT':
        can(Action.Read, 'Ticket');
        can(Action.Update, 'Ticket', { assigneeId: user.id });
        can(Action.Read, 'Tenant');
        break;
      case 'FINANCE':
        can(Action.Manage, 'Billing');
        can(Action.Manage, 'Invoice');
        can(Action.Manage, 'Subscription');
        can(Action.Read, 'Tenant');
        cannot(Action.Manage, 'Settings');
        cannot(Action.Manage, 'Staff');
        break;
      case 'DEV':
        can(Action.Manage, 'Settings');
        can(Action.Manage, 'Integration');
        can(Action.Read, 'AuditLog');
        cannot(Action.Manage, 'Billing');
        break;
    }

    return build();
  }
}
