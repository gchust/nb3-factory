import {
  encodeAuthorizationTitle,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import { defineSeed, type SeedContext } from '@nocobase/db';

const NAMESPACE = 'nb3-factory';

/**
 * The persisted form of the composite grant `documents.library` expands. It is
 * written out here instead of imported from the server provider because a seed
 * runs from source before the server build exists, and a seed has to remain
 * self-contained once it has been applied. Keep it in step with
 * `server/providers/document-resources.ts`.
 */
const library = { type: 'composite', id: 'documents.library' } as const;
const maintainerGrants = [
  {
    resource: library,
    actions: [
      {
        action: 'view',
        policy: {
          type: 'composite',
          scopes: { documents: 'allRecords' },
        },
      },
      { action: 'create' },
      {
        action: 'edit',
        policy: {
          type: 'composite',
          scopes: { documents: 'recordsIOwn' },
        },
      },
      {
        action: 'share',
        policy: {
          type: 'composite',
          scopes: {
            documents: 'recordsIOwn',
            shares: 'allRecords',
          },
        },
      },
    ],
  },
] satisfies readonly PermissionGrant[];
const readerGrants = [
  {
    resource: library,
    actions: [
      {
        action: 'view',
        policy: {
          type: 'composite',
          scopes: { documents: 'documents.readable' },
        },
      },
    ],
  },
] satisfies readonly PermissionGrant[];

const maintainer = definePermissionSet('document-maintainer')
  .title({
    key: 'documents.permissions.maintainerSet',
    ns: NAMESPACE,
  })
  .grant({
    resource: { type: 'page', id: 'documents.library' },
    actions: [{ action: 'access' }],
  })
  .grant(...maintainerGrants)
  .build();

const reader = definePermissionSet('document-reader')
  .title({
    key: 'documents.permissions.readerSet',
    ns: NAMESPACE,
  })
  .grant({
    resource: { type: 'page', id: 'documents.library' },
    actions: [{ action: 'access' }],
  })
  .grant(...readerGrants)
  .build();

async function insertIfMissing(
  query: SeedContext['query'],
  definition: PermissionSet,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('id')
    .where('key', '=', definition.key)
    .executeTakeFirst();
  if (existing) return;
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key: definition.key,
      title: encodeAuthorizationTitle(definition.title),
      grants: JSON.stringify(definition.grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

/**
 * The two jobs the library starts with. The seed only inserts sets that are
 * absent, so an administrator can later change their titles or grants without
 * the next startup undoing it.
 */
export default defineSeed({
  name: '202610270002_create_document_permission_sets',

  run: async ({ query }) => {
    await insertIfMissing(query, maintainer);
    await insertIfMissing(query, reader);
  },
});
