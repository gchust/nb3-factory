import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

/**
 * The two jobs the document library defines, persisted as ordinary Permission Sets.
 *
 * The sets are editable afterwards like any other: a seed states the initial configuration for a fresh installation and
 * never overwrites one an administrator has changed. An administrator can grant or revoke actions, change the page
 * grant, or assign a different set to a person.
 *
 * `library.document` is the resource type the library registers at boot; `*` is every document, because which records
 * a person sees is decided per request from ownership, publication and the person's shares.
 */
const MANAGER = 'library-manager';
const READER = 'library-reader';

const PAGE_GRANT = {
  resource: { type: 'page', id: 'documents' },
  actions: [{ action: 'access' }],
};

const MANAGER_DOCUMENT_GRANT = {
  resource: { type: 'library.document', id: '*' },
  actions: [
    { action: 'read' },
    { action: 'create' },
    { action: 'update' },
    { action: 'delete' },
  ],
};

const READER_DOCUMENT_GRANT = {
  resource: { type: 'library.document', id: '*' },
  actions: [{ action: 'read' }],
};

const seed = defineSeed({
  name: '202610100001_library_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    const sets = [
      {
        key: MANAGER,
        title: { key: 'library.permissionSets.manager', ns: 'nb3-factory' },
        grants: [PAGE_GRANT, MANAGER_DOCUMENT_GRANT],
      },
      {
        key: READER,
        title: { key: 'library.permissionSets.reader', ns: 'nb3-factory' },
        grants: [PAGE_GRANT, READER_DOCUMENT_GRANT],
      },
    ];

    for (const permissionSet of sets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      // Preserve an administrator's existing definition on an installation that already has this set.
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

export default seed;
