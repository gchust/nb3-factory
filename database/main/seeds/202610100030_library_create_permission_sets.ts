import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

/** A library document as it is reachable through the composite resource. */
const LIBRARY_COMPOSITE = {
  resource: { type: 'composite', id: 'library.documents' },
} as const;

/** The page id declared by the `/library` route in `client/routes.ts`. */
const LIBRARY_PAGE_GRANT = {
  resource: { type: 'page', id: 'library' },
  actions: [{ action: 'access' }],
};

/**
 * 资料员甲's work permissions: own documents are readable, creatable,
 * editable and deletable. The `view` scope is `library.owned`, so the
 * librarian keeps seeing drafts and confidential documents they own.
 */
const EDITOR_GRANT = {
  ...LIBRARY_COMPOSITE,
  actions: [
    {
      action: 'view',
      policy: { type: 'composite', scopes: { documents: 'library.owned' } },
    },
    {
      action: 'create',
      policy: { type: 'composite', scopes: { documents: 'allRecords' } },
    },
    {
      action: 'edit',
      policy: { type: 'composite', scopes: { documents: 'library.owned' } },
    },
    {
      action: 'delete',
      policy: { type: 'composite', scopes: { documents: 'library.owned' } },
    },
  ],
};

/**
 * 阅读者乙's work permissions: published, non-confidential documents only.
 * There is deliberately no `create`, `edit` or `delete` grant, so reading a
 * document never implies permission to change it.
 */
const READER_GRANT = {
  ...LIBRARY_COMPOSITE,
  actions: [
    {
      action: 'view',
      policy: { type: 'composite', scopes: { documents: 'library.published' } },
    },
  ],
};

interface PermissionSetSeed {
  readonly key: string;
  readonly title: string;
  readonly grants: readonly unknown[];
}

const PERMISSION_SETS: readonly PermissionSetSeed[] = [
  {
    key: 'library.editor',
    title: 'library.permissionSets.editor',
    grants: [EDITOR_GRANT, LIBRARY_PAGE_GRANT],
  },
  {
    key: 'library.reader',
    title: 'library.permissionSets.reader',
    grants: [READER_GRANT, LIBRARY_PAGE_GRANT],
  },
];

/**
 * Creates the two library Permission Sets the administrator assigns to people.
 * Existing sets are left untouched so an administrator's later edits survive.
 */
const seed = defineSeed({
  name: '202610100030_library_create_permission_sets',
  async run({ query }) {
    for (const permissionSet of PERMISSION_SETS) {
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
          id: crypto.randomUUID(),
          key: permissionSet.key,
          title: encodeAuthorizationTitle({
            key: permissionSet.title,
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
