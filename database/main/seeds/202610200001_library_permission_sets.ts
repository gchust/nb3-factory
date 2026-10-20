import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

/**
 * The two business responsibilities, written out here rather than read from
 * the current resource definition: a seed is immutable history, and a later
 * change to what an action grants must not rewrite what an installation got.
 */
const permissionSets = [
  {
    key: 'library-maintainer',
    title: { key: 'library.roles.maintainer', ns: 'nb3-factory' },
    grants: [
      {
        resource: { type: 'page', id: 'library.documents' },
        actions: [{ action: 'access' }],
      },
      {
        resource: { type: 'composite', id: 'library.documents' },
        actions: [
          {
            action: 'view',
            policy: {
              type: 'composite',
              scopes: { documents: 'library.visible' },
            },
          },
          {
            action: 'create',
            policy: {
              type: 'composite',
              scopes: { documents: 'recordsIOwn' },
            },
          },
          {
            action: 'edit',
            policy: {
              type: 'composite',
              scopes: { documents: 'recordsIOwn' },
            },
          },
          {
            action: 'delete',
            policy: {
              type: 'composite',
              scopes: { documents: 'recordsIOwn' },
            },
          },
        ],
      },
    ],
  },
  {
    key: 'library-reader',
    title: { key: 'library.roles.reader', ns: 'nb3-factory' },
    grants: [
      {
        resource: { type: 'page', id: 'library.documents' },
        actions: [{ action: 'access' }],
      },
      {
        resource: { type: 'composite', id: 'library.documents' },
        actions: [
          {
            action: 'view',
            policy: {
              type: 'composite',
              scopes: { documents: 'library.readable' },
            },
          },
        ],
      },
    ],
  },
] as const;

export default defineSeed({
  name: '202610200001_library_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const set of permissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
