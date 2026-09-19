import { defineSeed, type SeedDefinition } from '@nocobase/db';

const PAGE_WILDCARD_GRANT = [
  {
    resource: { type: 'page', id: '*' },
    actions: [{ action: 'access' }],
  },
];

const PERMISSION_SETS = [
  {
    key: 'rental-member',
    title: 'Rental member',
    grants: PAGE_WILDCARD_GRANT,
  },
  {
    key: 'rental-manager',
    title: 'Rental manager',
    grants: PAGE_WILDCARD_GRANT,
  },
  {
    key: 'rental-staff',
    title: 'Rental staff',
    grants: PAGE_WILDCARD_GRANT,
  },
] as const;

/**
 * Registers the application's rental roles and grants every signed-in account
 * access to the application pages.
 *
 * - `rental-member` is assigned to the `authenticated` default subject so a
 *   freshly registered account can open the business pages. It is not a
 *   selectable role in User management because it is a default, not a role.
 * - `rental-manager` and `rental-staff` are assignable in User management.
 *   The rental routes treat `system-administrator` and `rental-manager` as
 *   manager; every other signed-in account is staff.
 *
 * Insert-only so a later administrator edit is never silently overwritten.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609190010_seed_rental_permissions',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    const now = new Date();
    for (const permissionSet of PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: permissionSet.key,
          title: permissionSet.title,
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const defaultAssignment = {
      id: 'authenticated:*:rental-member',
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSetKey: 'rental-member',
    };
    const existingDefault = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', defaultAssignment.id)
      .executeTakeFirst();
    if (!existingDefault) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({ ...defaultAssignment, createdAt: now, updatedAt: now })
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
