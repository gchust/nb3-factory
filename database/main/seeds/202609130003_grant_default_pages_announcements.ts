import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Every authenticated user can open the pages listed in the `default-pages` permission set the authorization plugin
// creates. Reading, creating and posting announcements is a baseline capability of this application, so the
// announcements page is granted alongside `home` rather than left administrator-only.
const DEFAULT_PAGES = 'default-pages';
const PAGE_RESOURCE = 'announcements';

const seed: SeedDefinition = defineSeed({
  name: '202609130003_grant_default_pages_announcements',

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
    const nextGrants = addPageGrant(grants);
    if (nextGrants === grants) return;

    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(nextGrants), updatedAt: new Date() })
      .where('key', '=', DEFAULT_PAGES)
      .execute();
  },
});

// Adds the announcements page to the grant list only when it is missing, so a repeat run changes nothing.
function addPageGrant(
  grants: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  const hasGrant = grants.some(
    (grant) =>
      grant.resource.type === 'page' &&
      (grant.resource.id === PAGE_RESOURCE || grant.resource.id === '*') &&
      grant.actions.some(({ action }) => action === 'access'),
  );
  if (hasGrant) return grants;

  return [
    ...grants,
    {
      resource: { type: 'page', id: PAGE_RESOURCE },
      actions: [{ action: 'access' }],
    },
  ];
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'The default-pages grants must be a valid permission grant array.',
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
