import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import { admin, maintainer, requester } from './seed-data/permission-sets.ts';

const permissionSets = [admin, maintainer, requester];

// Initial configuration only. An existing set with the same key is left
// untouched, so an administrator's later edits survive every upgrade.
const seed = defineSeed({
  name: '202610160002_create_ticket_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of permissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
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
          revision: 'initial',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
