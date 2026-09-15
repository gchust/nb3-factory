import { defineSeed, type SeedDefinition } from '@nocobase/db';

// The media library distinguishes four roles. Two of them are permission sets this seed creates
// so an administrator can assign them from the Users page; `system-administrator` already exists
// and an ordinary user is simply an authenticated account without a restricting role.
//
// The seed is idempotent: it inserts a missing permission set and only appends the page grants a
// set is missing. Running it again leaves the stored rows unchanged.
const MEDIA_MANAGER = 'media-manager';
const MEDIA_MEMBER = 'media-member';
const MEDIA_GUEST = 'media-guest';
const DEFAULT_PAGES = 'default-pages';

const MEDIA_PAGE_GRANTS: readonly PermissionGrantRecord[] = [
  pageGrant('media-assets'),
  pageGrant('media-stats'),
];

const MEDIA_ROLES = [
  { key: MEDIA_MANAGER, title: 'Media manager' },
  { key: MEDIA_MEMBER, title: 'Member' },
  { key: MEDIA_GUEST, title: 'Guest' },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609140002_seed_media_roles',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    const now = new Date();
    for (const role of MEDIA_ROLES) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', role.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: role.key,
          title: role.title,
          grants: JSON.stringify(MEDIA_PAGE_GRANTS),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // Every authenticated account needs the page access checked by the media routes. The default
    // pages permission set is assigned to `authenticated:*` by the authorization plugin, so adding
    // the grants here keeps guests and ordinary users able to reach the pages while the server
    // still enforces what each may do.
    const defaultPages = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', DEFAULT_PAGES)
      .executeTakeFirst();
    if (!defaultPages) return;

    const grants = parseGrants(defaultPages.grants);
    const merged = addMissingGrants(grants, MEDIA_PAGE_GRANTS);
    if (merged === grants) return;

    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(merged), updatedAt: now })
      .where('key', '=', DEFAULT_PAGES)
      .execute();
  },
});

function pageGrant(id: string): PermissionGrantRecord {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

function addMissingGrants(
  grants: readonly PermissionGrantRecord[],
  additions: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  let next = grants;
  let changed = false;
  for (const addition of additions) {
    const index = next.findIndex(
      (grant) =>
        grant.resource.type === addition.resource.type &&
        grant.resource.id === addition.resource.id,
    );
    if (index === -1) {
      next = [...next, addition];
      changed = true;
      continue;
    }
    const grant = next[index];
    const existingActions = new Set(grant.actions.map(({ action }) => action));
    const missing = addition.actions.filter(
      ({ action }) => !existingActions.has(action),
    );
    if (missing.length === 0) continue;
    next = next.map((current, currentIndex) =>
      currentIndex === index
        ? { ...current, actions: [...current.actions, ...missing] }
        : current,
    );
    changed = true;
  }
  return changed ? next : grants;
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      `${DEFAULT_PAGES} grants must be a valid permission grant array.`,
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
