import {
  encodeAuthorizationTitle,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { defineSeed } from '@nocobase/db';

/**
 * The composite resource `server/service-desk/resources.ts` registers at boot.
 * A seed is immutable history and cannot import that evolving definition, so
 * this file stores the grant values it expands to and owns them from here on.
 */
const SERVICE_DESK_RESOURCE = 'serviceDesk.tickets';

/** The page every service desk user needs to open the application. */
const pageGrant: PermissionGrant = {
  resource: { type: 'page', id: 'service-desk' },
  actions: [{ action: 'access' }],
};

/**
 * Builds the composite grant for one permission set. Each action names one data
 * scope value; the authorization backend expands it against the model declared
 * in code when it checks a request.
 */
function ticketGrant(
  actions: Readonly<Record<string, Readonly<Record<string, string>>>>,
): PermissionGrant {
  return {
    resource: { type: 'composite', id: SERVICE_DESK_RESOURCE },
    actions: Object.entries(actions).map(([action, scopes]) => ({
      action,
      policy: { type: 'composite', scopes },
    })),
  };
}

/** Employees raise tickets and confirm or return the resolution. */
const employee = definePermissionSet('service-employee')
  .title('Employee')
  .grant(
    pageGrant,
    ticketGrant({
      view: { tickets: 'serviceDesk.myTickets' },
      create: { tickets: 'allRecords' },
      confirm: { tickets: 'serviceDesk.myTickets' },
      return: { tickets: 'serviceDesk.myTickets' },
      comment: { tickets: 'serviceDesk.myTickets' },
      dashboard: { tickets: 'serviceDesk.myTickets' },
    }),
  )
  .build();

/** Engineers work the tickets assigned to them. */
const engineer = definePermissionSet('service-engineer')
  .title('Engineer')
  .grant(
    pageGrant,
    ticketGrant({
      view: { tickets: 'serviceDesk.assignedToMe' },
      resolve: { tickets: 'serviceDesk.assignedToMe' },
      comment: { tickets: 'serviceDesk.assignedToMe' },
      dashboard: { tickets: 'serviceDesk.assignedToMe' },
    }),
  )
  .build();

/** The desk sees every ticket, assigns work and keeps the queue moving. */
const desk = definePermissionSet('service-desk')
  .title('Service desk')
  .grant(
    pageGrant,
    ticketGrant({
      view: { tickets: 'allRecords' },
      create: { tickets: 'allRecords' },
      assign: { tickets: 'allRecords' },
      resolve: { tickets: 'allRecords' },
      confirm: { tickets: 'allRecords' },
      return: { tickets: 'allRecords' },
      comment: { tickets: 'allRecords' },
      dashboard: { tickets: 'allRecords' },
    }),
  )
  .build();

/**
 * Installs the service desk's initial permission sets. They are ordinary
 * persisted configuration: an administrator may edit their grants, scopes and
 * assignments afterwards, and this seed preserves whatever is already there.
 */
export default defineSeed({
  name: '202611010002_service_desk_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const permissionSet of [employee, engineer, desk]) {
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
          id: crypto.randomUUID(),
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
