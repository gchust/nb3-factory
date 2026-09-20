import { defineSeed, type SeedDefinition } from '@nocobase/db';

const PERMISSION_SET_KEY = 'library-access';
/** Route names declared in `client/routes.ts`; each becomes a `page:<name>` access check. */
const LIBRARY_PAGES = [
  'library',
  'library-detail',
  'my-borrowings',
  'borrowings-admin',
] as const;

/**
 * Grants signed-in members access to the library pages.
 *
 * Every top-level application route has an implicit `page:<name> / access` check, and the built-in
 * `default-pages` set only covers `home`. Without this, only an administrator could open the pages
 * at all. Boundary rules (who may read which material, who may manage borrowings) stay in the
 * server routes and are not expressed here.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609200010_grant_library_page_access',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    const now = new Date();
    const existing = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', PERMISSION_SET_KEY)
      .executeTakeFirst();

    if (!existing) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: PERMISSION_SET_KEY,
          title: '资料库访问',
          grants: JSON.stringify(
            LIBRARY_PAGES.map((page) => ({
              resource: { type: 'page', id: page },
              actions: [{ action: 'access' }],
            })),
          ),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignmentId = `authenticated:*:${PERMISSION_SET_KEY}`;
    const assignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!assignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: PERMISSION_SET_KEY,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
