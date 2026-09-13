import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Fixed, reproducible baseline for the procurement permission model.
 *
 * Three roles are provisioned as permission sets so an administrator can assign
 * them from the Users page:
 *   - procurement-employee : every signed-in user (the authenticated baseline)
 *   - procurement-buyer    : supplier, order and receipt maintenance
 *   - procurement-manager  : purchase-request approval
 * The protected `system-administrator` set already covers everything.
 *
 * The seed is idempotent: it creates a missing set and updates grants and the
 * authenticated baseline assignment to the fixed values below on every run.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609130101_seed_procurement_roles',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    await upsertPermissionSet(query, 'procurement-manager', '采购主管', [
      ...pageGrants([
        'home',
        'procurementRequests',
        'procurementApprovals',
        'procurementStatistics',
      ]),
    ]);
    await upsertPermissionSet(query, 'procurement-buyer', '采购员', [
      ...pageGrants([
        'home',
        'procurementSuppliers',
        'procurementRequests',
        'procurementOrders',
        'procurementStatistics',
      ]),
    ]);
    await upsertPermissionSet(query, 'procurement-employee', '普通员工', [
      ...pageGrants(['home', 'procurementRequests', 'procurementStatistics']),
    ]);

    await upsertAssignment(query, 'authenticated:*:procurement-employee', {
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSetKey: 'procurement-employee',
    });
  },
});

function pageGrants(ids: readonly string[]): PermissionGrantRecord[] {
  return ids.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

async function upsertPermissionSet(
  query: SeedContext['query'],
  key: string,
  title: string,
  grants: readonly PermissionGrantRecord[],
): Promise<void> {
  const now = new Date();
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst();
  if (existing) {
    await query
      .updateTable('authorizationPermissionSets')
      .set({ title, grants: JSON.stringify(grants), updatedAt: now })
      .where('key', '=', key)
      .execute();
    return;
  }
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key,
      title,
      grants: JSON.stringify(grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function upsertAssignment(
  query: SeedContext['query'],
  id: string,
  assignment: {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly permissionSetKey: string;
  },
): Promise<void> {
  const now = new Date();
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({ ...assignment, id, createdAt: now, updatedAt: now })
    .execute();
}

interface PermissionGrantRecord {
  readonly resource: {
    readonly type: string;
    readonly id: string;
  };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
