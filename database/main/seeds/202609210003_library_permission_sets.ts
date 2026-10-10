import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

/**
 * Persists the two library Permission Sets and assigns them:
 *
 * - `library-editor` to `资料员甲`: open the library, read what is shared, and
 *   maintain only their own documents.
 * - `library-reader` to `阅读者乙`: open the library and read only.
 *
 * The administrator keeps the `root` set, which bypasses grants entirely, so
 * no assignment is written for it.
 *
 * The grants are spelled out here rather than built from the runtime resource
 * declarations on purpose: seeds are run both from source (under Node's native
 * TypeScript loader, which resolves only the specifiers that literally exist
 * on disk) and from the compiled output, and a seed is a snapshot that must
 * not change meaning when another file does. Keep it self-contained.
 */

const LIBRARY_RESOURCE_ID = 'library.documents';
const LIBRARY_DOCUMENTS_COLLECTION = 'libraryDocuments';
const LIBRARY_EDITOR_PERMISSION_SET = 'library-editor';
const LIBRARY_READER_PERMISSION_SET = 'library-reader';
const LIBRARY_EDITOR_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const LIBRARY_READER_ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';

interface PermissionSetSeed {
  readonly key: string;
  readonly title: { readonly key: string; readonly ns: string };
  readonly grants: readonly unknown[];
}

const permissionSet = (
  scopes: readonly { action: string; scope: string }[],
): readonly unknown[] => [
  {
    resource: { type: 'page', id: LIBRARY_RESOURCE_ID },
    actions: [{ action: 'access' }],
  },
  {
    resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
    actions: scopes.map(({ action, scope }) => ({
      action,
      policy: {
        type: 'composite',
        scopes: { [LIBRARY_DOCUMENTS_COLLECTION]: scope },
      },
    })),
  },
];

const LIBRARY_PERMISSION_SETS: readonly PermissionSetSeed[] = [
  {
    key: LIBRARY_EDITOR_PERMISSION_SET,
    title: { key: 'library.permissionSet.editor', ns: 'nb3-factory' },
    grants: permissionSet([
      { action: 'view', scope: 'library.visible' },
      { action: 'create', scope: 'library.owned' },
      { action: 'edit', scope: 'library.owned' },
      { action: 'delete', scope: 'library.owned' },
    ]),
  },
  {
    key: LIBRARY_READER_PERMISSION_SET,
    title: { key: 'library.permissionSet.reader', ns: 'nb3-factory' },
    grants: permissionSet([{ action: 'view', scope: 'library.visible' }]),
  },
];

interface LibraryPermissionSetAssignment {
  readonly subjectId: string;
  readonly permissionSetKey: string;
}

const seed = defineSeed({
  name: '202609210003_library_permission_sets',
  async run({ query }) {
    const now = new Date();

    for (const set of LIBRARY_PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignments: readonly LibraryPermissionSetAssignment[] = [
      {
        subjectId: LIBRARY_EDITOR_ACCOUNT_ID,
        permissionSetKey: LIBRARY_EDITOR_PERMISSION_SET,
      },
      {
        subjectId: LIBRARY_READER_ACCOUNT_ID,
        permissionSetKey: LIBRARY_READER_PERMISSION_SET,
      },
    ];

    for (const assignment of assignments) {
      const id = `user:${assignment.subjectId}:${assignment.permissionSetKey}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
          subjectType: 'user',
          subjectId: assignment.subjectId,
          permissionSetKey: assignment.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
