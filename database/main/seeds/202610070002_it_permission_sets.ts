import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

/**
 * Installs the three initial IT service desk permission sets.
 *
 * The grants are written out here, rather than imported from the runtime
 * resource definitions, so this seed stays a self-contained record of the data
 * it inserts. Administrator changes to these permission sets stay untouched:
 * an existing key is never overwritten.
 */
const ticketsPage = {
  resource: { type: 'page', id: 'it.tickets' },
  actions: [{ action: 'access' }],
} as const;

function ticketGrant(scopes: Readonly<Record<string, string>>) {
  return {
    resource: { type: 'composite', id: 'it.tickets' },
    actions: Object.entries(scopes).map(([action, ticket]) => ({
      action,
      policy: { type: 'composite', scopes: { ticket } },
    })),
  };
}

const itEmployee = {
  key: 'it-employee',
  title: 'IT employee',
  grants: [
    ticketsPage,
    ticketGrant({
      view: 'it.tickets.own',
      create: 'it.tickets.own',
      close: 'it.tickets.own',
      return: 'it.tickets.own',
      comment: 'it.tickets.own',
      dashboard: 'it.tickets.own',
    }),
  ],
};

const itEngineer = {
  key: 'it-engineer',
  title: 'IT engineer',
  grants: [
    ticketsPage,
    ticketGrant({
      view: 'it.tickets.assigned',
      progress: 'it.tickets.assigned',
      resolve: 'it.tickets.assigned',
      comment: 'it.tickets.assigned',
      dashboard: 'it.tickets.assigned',
    }),
  ],
};

const itServiceDesk = {
  key: 'it-service-desk',
  title: 'IT service desk',
  grants: [
    ticketsPage,
    ticketGrant({
      view: 'allRecords',
      create: 'allRecords',
      assign: 'allRecords',
      comment: 'allRecords',
      dashboard: 'allRecords',
    }),
  ],
};

const permissionSets = [itEmployee, itEngineer, itServiceDesk];

export default defineSeed({
  name: '202610070002_it_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const permissionSet of permissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: permissionSet.key,
          key: permissionSet.key,
          title: encodeAuthorizationTitle(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
