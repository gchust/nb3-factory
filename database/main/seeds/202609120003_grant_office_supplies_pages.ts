import { defineSeed, type SeedDefinition } from '@nocobase/db';

const DEFAULT_PAGES = 'default-pages';
const OFFICE_SUPPLIES_PAGE = 'office-supplies';

/**
 * The office-supplies page (and its detail child, which inherits its access) is
 * a product page for every signed-in user: administrative staff record stock
 * and employees requisition supplies. Extend the built-in default-pages
 * permission set, which is already assigned to the authenticated principal, so
 * the page stays reachable for any logged-in user without a per-user grant.
 *
 * Idempotent: adds the page grant only when it is missing and never removes or
 * overwrites other grants.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609120003_grant_office_supplies_pages',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    const permissionSet = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', DEFAULT_PAGES)
      .executeTakeFirst();
    if (!permissionSet) return;

    const grants = parseGrants(permissionSet.grants);
    const nextGrants = addPageGrant(grants, OFFICE_SUPPLIES_PAGE);
    if (nextGrants === grants) return;

    await query
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify(nextGrants),
        updatedAt: new Date(),
      })
      .where('key', '=', DEFAULT_PAGES)
      .execute();
  },
});

function addPageGrant(
  grants: readonly PermissionGrantRecord[],
  page: string,
): readonly PermissionGrantRecord[] {
  if (
    grants.some(
      (grant) =>
        grant.resource.type === 'page' &&
        (grant.resource.id === page || grant.resource.id === '*'),
    )
  ) {
    return grants;
  }
  return [
    ...grants,
    {
      resource: { type: 'page', id: page },
      actions: [{ action: 'access' }],
    },
  ];
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'Default pages grants must be a valid permission grant array.',
    );
  }
  return parsed;
}

function isPermissionGrantRecord(
  value: unknown,
): value is PermissionGrantRecord {
  if (!isRecord(value) || !isRecord(value.resource)) return false;
  if (
    typeof value.resource.type !== 'string' ||
    typeof value.resource.id !== 'string' ||
    !Array.isArray(value.actions)
  ) {
    return false;
  }
  return value.actions.every(
    (action) => isRecord(action) && typeof action.action === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
