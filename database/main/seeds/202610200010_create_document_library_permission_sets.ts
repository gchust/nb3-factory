import { defineSeed } from '@nocobase/db';

/**
 * The two roles the document library recognizes, stored as Permission Sets so an administrator assigns them from the
 * Users page like any other role.
 *
 * `document-editor` may create documents and maintain their own; `document-reader` may read what the library shows
 * them but change nothing. The sets carry no grants: who may read which document is business logic in the document
 * service, and writing is gated on the set's key. Keeping the sets empty also keeps them out of the page- and
 * field-grant validation an evolving collection definition would invalidate.
 *
 * This is required data, not sample data: the application's roles must exist on every install, so the seed is not
 * declared `sample: true`.
 */
const EDITOR = 'document-editor';
const READER = 'document-reader';

const seed = defineSeed({
  name: '202610200010_create_document_library_permission_sets',
  async run({ query }) {
    const now = new Date();
    for (const [key, title] of [
      [EDITOR, '资料维护者'],
      [READER, '资料阅读者'],
    ] as const) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key,
          // The column stores the title JSON-encoded, exactly as the Permission Sets store writes it: the value is a
          // JSON string here, and `encodeAuthorizationTitle` would produce the same bytes.
          title: JSON.stringify(title),
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
