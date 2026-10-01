import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

/**
 * Installs the two IT support Permission Sets an administrator assigns to a
 * colleague.
 *
 * The grants are written out here rather than imported from `server/`, because
 * a Seed is a snapshot of history: it has to keep meaning the same thing even
 * after the servers' builders move on, and it is loaded directly by Node in a
 * test where a relative `.js` import into the source tree does not resolve.
 * The ids and action names match `server/it-support/constants.ts` and the
 * composite resource registered in `server/it-support/resources.ts`.
 */

const EMPLOYEE_PERMISSION_SET = 'it-employee';
const PROCESSOR_PERMISSION_SET = 'it-processor';

const PAGE_ACCESS_GRANT: PermissionGrant = {
  resource: { type: 'page', id: 'it.tickets' },
  actions: [{ action: 'access' }],
};

function ticketsGrant(
  actions: readonly { action: string; scope: string }[],
): PermissionGrant {
  return {
    resource: { type: 'composite', id: 'it.tickets' },
    actions: actions.map(({ action, scope }) => ({
      action,
      policy: { type: 'composite', scopes: { tickets: scope } },
    })),
  };
}

const PERMISSION_SETS = [
  {
    key: EMPLOYEE_PERMISSION_SET,
    titleKey: 'itSupport.permissionSet.employee',
    grants: [
      PAGE_ACCESS_GRANT,
      // Submit tickets and read back only one's own.
      ticketsGrant([
        { action: 'view', scope: 'it.ownTickets' },
        { action: 'create', scope: 'it.ownTickets' },
      ]),
    ],
  },
  {
    key: PROCESSOR_PERMISSION_SET,
    titleKey: 'itSupport.permissionSet.processor',
    grants: [
      PAGE_ACCESS_GRANT,
      // Read every ticket and drive it through `start` and `complete`.
      ticketsGrant([
        { action: 'view', scope: 'allRecords' },
        { action: 'start', scope: 'allRecords' },
        { action: 'complete', scope: 'allRecords' },
      ]),
    ],
  },
] as const;

const seed = defineSeed({
  name: '202609280002_it_support_permission_sets',
  async run({ query }) {
    const now = new Date();

    for (const permissionSet of PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: permissionSet.key,
          title: encodeAuthorizationTitle({
            key: permissionSet.titleKey,
            ns: 'nb3-factory',
          }),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
