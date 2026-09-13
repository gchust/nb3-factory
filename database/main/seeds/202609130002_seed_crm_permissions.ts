import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * CRM authorization configuration.
 *
 * Roles are Authorization Permission Sets, so they also appear in the Users
 * page role control and can be reassigned there without a code change:
 *
 * - `sales-manager` sees every customer and opportunity.
 * - `sales-rep` is the authenticated default: every signed-in user, including
 *   one who just registered, can only reach records whose `ownerId` is theirs.
 * - `system-administrator` keeps all-record CRM access.
 *
 * Permission Sets and assignments are written directly because a seed has no
 * application container and the protected `system-administrator` set cannot be
 * changed through the settings HTTP API. Every step is idempotent.
 */
const SYSTEM_ADMINISTRATOR = 'system-administrator';
const SALES_REP = 'sales-rep';
const SALES_MANAGER = 'sales-manager';

const CRM_COLLECTIONS = [
  'main.crmCustomers',
  'main.crmContacts',
  'main.crmOpportunities',
  'main.crmFollowUps',
  'main.crmAttachments',
] as const;

const ALL_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/**
 * The application pages the CRM owns.
 *
 * Before rendering a page the client asks authorization for `page:<route name>`
 * with the `access` action, and the same decision hides the route from the
 * navigation menu. The framework's default pages permission set only grants
 * `home`, so a role that may use the CRM has to be granted every CRM page
 * explicitly; a database grant alone leaves every signed-in sales representative
 * on "Access denied" with no CRM menu entry.
 */
export const CRM_PAGE_ROUTES = [
  'crmCustomers',
  'crmCustomerDetail',
  'crmOpportunities',
  'crmFollowUps',
  'crmFunnel',
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609130002_seed_crm_permissions',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (
      !(await client.schema.hasTable('authorization_permission_sets')) ||
      !(await client.schema.hasTable(
        'authorization_permission_set_assignments',
      ))
    ) {
      return;
    }

    await ensurePermissionSet(query, {
      key: SALES_REP,
      title: 'Sales Representative',
      grants: salesRepGrants(),
    });

    await ensurePermissionSet(query, {
      key: SALES_MANAGER,
      title: 'Sales Manager',
      grants: salesManagerGrants(),
    });

    await ensureAssignment(query, {
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSet: SALES_REP,
    });

    await extendSystemAdministrator(query);
  },
});

interface ColumnValue {
  readonly key: string;
  readonly title: string;
  readonly grants: readonly PermissionGrantRecord[];
}

/**
 * The canonical grants for a sales role: every CRM collection plus every CRM
 * page. Exported so the configuration can be asserted without a database.
 */
function collectionGrants(
  recordAccess: 'recordsIOwn' | 'allRecords',
): PermissionGrantRecord[] {
  return [
    ...CRM_COLLECTIONS.map((resource) =>
      grant(resource, {
        read: { fields: { output: '*' }, recordAccess: [recordAccess] },
        create: { fields: { input: '*', output: '*' } },
        update: {
          fields: { input: '*', output: '*' },
          recordAccess: [recordAccess],
        },
        delete: { recordAccess: [recordAccess] },
      }),
    ),
    ...CRM_PAGE_ROUTES.map(pageGrant),
  ];
}

export function salesRepGrants(): PermissionGrantRecord[] {
  return collectionGrants('recordsIOwn');
}

export function salesManagerGrants(): PermissionGrantRecord[] {
  return collectionGrants('allRecords');
}

async function ensurePermissionSet(
  query: QueryAdapter,
  value: ColumnValue,
): Promise<void> {
  const serialized = JSON.stringify(value.grants);
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', value.key)
    .executeTakeFirst();

  if (!existing) {
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: value.key,
        key: value.key,
        title: value.title,
        grants: serialized,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return;
  }

  // Permission grants are application-managed configuration, so the seed
  // keeps them at the canonical value on every run.
  const current =
    typeof existing.grants === 'string'
      ? existing.grants
      : JSON.stringify(existing.grants);
  if (current === serialized) return;

  await query
    .updateTable('authorizationPermissionSets')
    .set({ grants: serialized, updatedAt: new Date() })
    .where('key', '=', value.key)
    .execute();
}

async function ensureAssignment(
  query: QueryAdapter,
  value: {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly permissionSet: string;
  },
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['id'])
    .where('subjectType', '=', value.subjectType)
    .where('subjectId', '=', value.subjectId)
    .where('permissionSetKey', '=', value.permissionSet)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: `${value.subjectType}:${value.subjectId}:${value.permissionSet}`,
      subjectType: value.subjectType,
      subjectId: value.subjectId,
      permissionSetKey: value.permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function extendSystemAdministrator(query: QueryAdapter): Promise<void> {
  const row = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .executeTakeFirst();
  if (!row) return;

  const grants = parseGrants(row.grants);
  const additions = CRM_COLLECTIONS.map((resource) =>
    grant(resource, {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
      create: { fields: { input: '*', output: '*' } },
      update: {
        fields: { input: '*', output: '*' },
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
  ).filter(
    (addition) =>
      !grants.some(
        (current) =>
          current.resource.type === addition.resource.type &&
          current.resource.id === addition.resource.id,
      ),
  );
  if (additions.length === 0) return;

  await query
    .updateTable('authorizationPermissionSets')
    .set({
      grants: JSON.stringify([...grants, ...additions]),
      updatedAt: new Date(),
    })
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .execute();
}

function grant(
  resource: string,
  actions: Readonly<Record<string, ActionConfig>>,
): PermissionGrantRecord {
  return {
    resource: { type: 'database.collection', id: resource },
    actions: ALL_ACTIONS.filter((action) => actions[action]).map((action) => ({
      action,
      policy: { type: 'database', ...actions[action] },
    })),
  };
}

/** A static page grant: the `pages` authorizer only accepts the `access` action. */
function pageGrant(page: string): PermissionGrantRecord {
  return {
    resource: { type: 'page', id: page },
    actions: [{ action: 'access' }],
  };
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'System administrator grants must be a valid permission grant array.',
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

interface ActionConfig {
  readonly fields?: {
    readonly input?: '*' | readonly string[];
    readonly output?: '*' | readonly string[];
  };
  readonly recordAccess?: readonly string[];
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
