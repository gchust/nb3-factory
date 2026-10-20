import { defineMigration, type MigrationDefinition } from '@nocobase/db';

interface PermissionAction {
  action: string;
  [field: string]: unknown;
}

interface PermissionGrant {
  resource: { type: string; id: string };
  actions: PermissionAction[];
  [field: string]: unknown;
}

interface PermissionSetRow {
  id: string;
  key: string;
  grants: PermissionGrant[] | null;
  updatedAt: Date;
  [field: string]: unknown;
}

const TICKET_GRANT = { type: 'composite', id: 'helpdesk.tickets' } as const;
const REQUESTER_ACTIONS = ['reopen', 'close'] as const;

/**
 * Adds the requester's confirmation actions to the built-in employee job on an
 * installation whose permission set was created before the closure flow
 * existed. A fresh installation receives the same grants from the seed; this
 * migration only appends the two missing actions so later administrator edits
 * remain intact.
 *
 * The permission-set Collections belong to the authorization plugin, so an
 * installation that does not register it has nothing to grant: the migration
 * reports success without writing instead of failing the whole upgrade run on
 * a Collection it cannot reach.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_grant_requester_close_reopen',

  async up(context) {
    if (!(await context.builder.hasCollection('authorizationPermissionSets'))) {
      return;
    }
    const sets =
      context.repository<PermissionSetRow>('authorizationPermissionSets');
    const employee = await sets.findOne({ filter: { key: 'employee' } });
    if (!employee?.grants) return;

    let changed = false;
    const grants = employee.grants.map((grant) => {
      if (
        grant.resource?.type !== TICKET_GRANT.type ||
        grant.resource?.id !== TICKET_GRANT.id
      ) {
        return grant;
      }
      const actions = [...grant.actions];
      for (const action of REQUESTER_ACTIONS) {
        if (actions.some((item) => item.action === action)) continue;
        actions.push({
          action,
          policy: {
            type: 'composite',
            scopes: { ticket: 'helpdesk.ownTickets' },
          },
        });
        changed = true;
      }
      return { ...grant, actions };
    });

    if (!changed) return;
    await sets.updateOne({
      filter: { id: employee.id },
      values: { grants, updatedAt: new Date() },
    });
  },

  async down(context) {
    if (!(await context.builder.hasCollection('authorizationPermissionSets'))) {
      return;
    }
    const sets =
      context.repository<PermissionSetRow>('authorizationPermissionSets');
    const employee = await sets.findOne({ filter: { key: 'employee' } });
    if (!employee?.grants) return;

    let changed = false;
    const grants = employee.grants.map((grant) => {
      if (
        grant.resource?.type !== TICKET_GRANT.type ||
        grant.resource?.id !== TICKET_GRANT.id
      ) {
        return grant;
      }
      const actions = grant.actions.filter(
        (item) => !REQUESTER_ACTIONS.includes(item.action as never),
      );
      if (actions.length !== grant.actions.length) changed = true;
      return { ...grant, actions };
    });

    if (!changed) return;
    await sets.updateOne({
      filter: { id: employee.id },
      values: { grants, updatedAt: new Date() },
    });
  },
});

export default migration;
