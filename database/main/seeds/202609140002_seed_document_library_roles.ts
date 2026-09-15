import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Installs the document library's roles as Permission Sets and gives every signed-in user the read-only baseline.
 *
 * The application exposes Authorization Permission Sets as direct roles in the Users page, so `archivist` and
 * `engineer` appear there as assignable roles. `visitor` is assigned to the `authenticated` subject instead: a user
 * who registers through the sign-up page can immediately browse the ledger, and an administrator adds the engineer
 * or archivist role when someone needs to download or upload. The system administrator set receives the same
 * document actions so an administrator can always manage the ledger.
 *
 * Seeds run on every startup, so every write here is idempotent: a set is created only when it is missing (leaving
 * administrator edits alone), and the administrator's grant is extended only with actions it does not have yet.
 */
const VISITOR = 'visitor';
const ENGINEER = 'engineer';
const ARCHIVIST = 'archivist';
const SYSTEM_ADMINISTRATOR = 'system-administrator';

const DOCUMENT_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'download',
] as const;
const PAGE_IDS = ['documents', 'document-stats'] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609140002_seed_document_library_roles',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    await ensurePermissionSet(
      query,
      VISITOR,
      'Visitor (read-only) / 访客只读',
      visitorGrants(),
    );
    await ensurePermissionSet(
      query,
      ENGINEER,
      'Engineer / 工程师',
      engineerGrants(),
    );
    await ensurePermissionSet(
      query,
      ARCHIVIST,
      'Archivist / 资料员',
      archivistGrants(),
    );
    await ensureAssignment(query, VISITOR, 'authenticated', '*');
    await extendSystemAdministrator(query);
  },
});

function visitorGrants(): readonly PermissionGrantRecord[] {
  return [...pageGrants(), documentGrant(['read'])];
}

function engineerGrants(): readonly PermissionGrantRecord[] {
  return [...pageGrants(), documentGrant(['read', 'download'])];
}

function archivistGrants(): readonly PermissionGrantRecord[] {
  return [...pageGrants(), documentGrant([...DOCUMENT_ACTIONS])];
}

function pageGrants(): readonly PermissionGrantRecord[] {
  return PAGE_IDS.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

/**
 * A database grant needs an explicit policy, otherwise the database authorizer cannot derive record access and
 * denies the action. `allRecords` is the whole ledger; the roles differ only in which actions they hold.
 */
function documentGrant(actions: readonly string[]): PermissionGrantRecord {
  return {
    resource: { type: 'database.collection', id: 'main.documents' },
    actions: actions.map((action) => ({
      action,
      policy: {
        type: 'database',
        fields: { input: '*', output: '*' },
        recordAccess: ['allRecords'],
      },
    })),
  };
}

async function ensurePermissionSet(
  query: SeedContext['query'],
  key: string,
  title: string,
  grants: readonly PermissionGrantRecord[],
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
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

async function ensureAssignment(
  query: SeedContext['query'],
  permissionSet: string,
  subjectType: string,
  subjectId: string,
): Promise<void> {
  const id = `${subjectType}:${subjectId}:${permissionSet}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType,
      subjectId,
      permissionSetKey: permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function extendSystemAdministrator(
  query: SeedContext['query'],
): Promise<void> {
  const permissionSet = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .executeTakeFirst();
  if (!permissionSet) return;

  const grants = parseGrants(permissionSet.grants);
  const nextGrants = addDocumentGrant(grants);
  if (nextGrants === grants) return;

  await query
    .updateTable('authorizationPermissionSets')
    .set({ grants: JSON.stringify(nextGrants), updatedAt: new Date() })
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .execute();
}

function addDocumentGrant(
  grants: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  const index = grants.findIndex(
    (grant) =>
      grant.resource.type === 'database.collection' &&
      grant.resource.id === 'main.documents',
  );
  const desired = documentGrant([...DOCUMENT_ACTIONS]);
  if (index === -1) {
    return [...grants, desired];
  }

  const grant = grants[index];
  const existingActions = new Set(grant.actions.map(({ action }) => action));
  const missing = desired.actions.filter(
    ({ action }) => !existingActions.has(action),
  );
  if (missing.length === 0) return grants;

  return grants.map((current, currentIndex) =>
    currentIndex === index
      ? { ...current, actions: [...current.actions, ...missing] }
      : current,
  );
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'Permission set grants must be a valid permission grant array.',
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
