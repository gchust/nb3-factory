import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { itTicketPermissionSets } from '../../seed-data/permission-sets.ts';

/**
 * Initial Permission Sets for the IT repair ticket feature. A fresh
 * installation gets a working employee and handler configuration; both remain
 * ordinary editable sets an administrator can change or assign to new
 * colleagues afterwards.
 *
 * Seeds are loaded by Node's own resolver in a source checkout, which does not
 * map a relative `...js` specifier onto a `.ts` file, so the feature module is
 * imported with its `.ts` extension; the build rewrites it to `.js`.
 */
export default defineSeed({
  name: '202609210001_it_tickets_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of itTicketPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;
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
