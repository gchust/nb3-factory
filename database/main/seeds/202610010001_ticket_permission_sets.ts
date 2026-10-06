import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import {
  ticketEmployee,
  ticketHandler,
} from '../../seed-data/tickets-permission-sets';

/**
 * Persist the two ticket jobs so an administrator can assign them from the
 * Users page. An existing definition is left untouched: after installation the
 * backend owns these rows and administrators may edit them.
 */
export default defineSeed({
  name: '202610010001_ticket_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of [ticketEmployee, ticketHandler]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;
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
