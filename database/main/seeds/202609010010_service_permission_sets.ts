import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import { servicePermissionSets } from '../../seed-data/permission-sets.ts';

/**
 * Installs the initial service permission sets. An existing set is left
 * untouched: an administrator may have edited its grants since installation.
 */
export default defineSeed({
  name: '202609010010_service_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const permissionSet of servicePermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
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
