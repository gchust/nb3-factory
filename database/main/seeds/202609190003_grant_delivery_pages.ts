import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Pages are reachable by every signed-in user; row-level access is enforced by
 * the delivery API, not by hiding a page. Without this grant the client route
 * guard would answer `Access denied` for a new member before the page could
 * show the (correctly empty) list.
 */
const PERMISSION_SET_KEY = 'delivery-pages';
const AUTHENTICATED_ASSIGNMENT_ID = `authenticated:*:${PERMISSION_SET_KEY}`;

const seed: SeedDefinition = defineSeed({
  name: '202609190003_grant_delivery_pages',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
    if (
      !(await client.schema.hasTable(
        'authorization_permission_set_assignments',
      ))
    ) {
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
          title: 'Delivery pages',
          grants: JSON.stringify([
            {
              resource: { type: 'page', id: '*' },
              actions: [{ action: 'access' }],
            },
          ]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', AUTHENTICATED_ASSIGNMENT_ID)
      .executeTakeFirst();
    if (!assignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: AUTHENTICATED_ASSIGNMENT_ID,
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
