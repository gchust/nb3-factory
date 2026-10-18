import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import {
  documentsEditor,
  documentsReader,
} from '../../seed-data/permission-sets.ts';

/**
 * Initial business permission configuration for a fresh installation: the two job permission sets the document
 * library is designed around. This is editable configuration, not code ownership — once it is written, an
 * administrator may change or remove it and this seed never runs again.
 */
const seed = defineSeed({
  name: '202611010002_documents_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of [documentsEditor, documentsReader]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
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

export default seed;
