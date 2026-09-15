import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Contract archive roles.
 *
 * The application models its four roles as Authorization Permission Sets assigned directly to users (or, for the
 * business-owner baseline, to every authenticated user):
 *
 * - `system-administrator` (built in) is extended with unrestricted contract access.
 * - `contracts-legal` maintains every contract, version and attachment.
 * - `contracts-auditor` may read every contract but must never download an attachment.
 * - `contracts-business-owner` is the authenticated default: a signed-up user may create contracts and then read,
 *   update and download only the contracts they own (`recordsIOwn` reads the contract's `ownerId` attribute).
 *
 * The `download` action is deliberately separate from `read`: a read-only auditor can open a contract but has no
 * grant for its scans.
 */
const CONTRACTS_RESOURCE = {
  type: 'database.collection',
  id: 'main.contracts',
};
const SYSTEM_ADMINISTRATOR = 'system-administrator';
/**
 * Page identifiers of the application's own contract routes. Page access is granted per route so a role never gains
 * navigation it was not meant to have — the built-in `default-pages` set only opens the homepage.
 */
const CONTRACT_PAGES = [
  'contracts',
  'contractsStats',
  'contractsDetail',
  'contractsNew',
  'contractsEdit',
];

interface DatabaseActionGrant {
  readonly fields?: {
    readonly input?: '*' | readonly string[];
    readonly output?: '*' | readonly string[];
  };
  readonly recordAccess?: readonly string[];
}

interface PermissionGrantRecord {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

const seed: SeedDefinition = defineSeed({
  name: '202609140010_seed_contract_permissions',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }
    const now = new Date();

    await upsertPermissionSet(query, now, {
      key: 'contracts-legal',
      title: 'Legal',
      grants: [
        databaseGrant({
          read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
          create: { fields: { input: '*' } },
          update: {
            fields: { input: '*', output: '*' },
            recordAccess: ['allRecords'],
          },
          delete: { recordAccess: ['allRecords'] },
          download: {
            fields: { output: ['id', 'ownerId'] },
            recordAccess: ['allRecords'],
          },
        }),
        ...contractPageGrants(),
      ],
    });

    await upsertPermissionSet(query, now, {
      key: 'contracts-auditor',
      title: 'Read-only auditor',
      grants: [
        databaseGrant({
          read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        }),
        ...contractPageGrants(),
      ],
    });

    await upsertPermissionSet(query, now, {
      key: 'contracts-business-owner',
      title: 'Business owner',
      grants: [
        databaseGrant({
          read: { fields: { output: '*' }, recordAccess: ['recordsIOwn'] },
          create: { fields: { input: '*' } },
          update: {
            fields: { input: '*', output: '*' },
            recordAccess: ['recordsIOwn'],
          },
          download: {
            fields: { output: ['id', 'ownerId'] },
            recordAccess: ['recordsIOwn'],
          },
        }),
        ...contractPageGrants(),
      ],
    });

    await assignSubject(query, now, {
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSet: 'contracts-business-owner',
    });

    await extendSystemAdministrator(query, now);
  },
});

interface TableSchemaClient {
  readonly schema: { hasTable(table: string): Promise<boolean> };
}

/** Parse the JSON column whether the driver returned a string or an already-decoded value. */
function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    throw new Error('Permission Set grants must be an array.');
  }
  return parsed as readonly PermissionGrantRecord[];
}

async function upsertPermissionSet(
  query: QueryAdapter,
  now: Date,
  input: {
    readonly key: string;
    readonly title: string;
    readonly grants: readonly PermissionGrantRecord[];
  },
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', input.key)
    .executeTakeFirst();

  if (!existing) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: input.key,
        title: input.title,
        grants: JSON.stringify(input.grants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return;
  }

  if (
    JSON.stringify(parseGrants(existing.grants)) ===
    JSON.stringify(input.grants)
  ) {
    return;
  }
  await query
    .updateTable('authorizationPermissionSets')
    .set({
      title: input.title,
      grants: JSON.stringify(input.grants),
      updatedAt: now,
    })
    .where('key', '=', input.key)
    .execute();
}

async function assignSubject(
  query: QueryAdapter,
  now: Date,
  input: {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly permissionSet: string;
  },
): Promise<void> {
  const id = `${input.subjectType}:${input.subjectId}:${input.permissionSet}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['id'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      permissionSetKey: input.permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

/**
 * Preserve whatever else the built-in administrator set grants and only make sure contract administration is
 * present and current.
 */
async function extendSystemAdministrator(
  query: QueryAdapter,
  now: Date,
): Promise<void> {
  const row = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .executeTakeFirst();
  if (!row) return;

  const grants = [...parseGrants(row.grants)];
  const expected = databaseGrant({
    read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
    create: { fields: { input: '*' } },
    update: {
      fields: { input: '*', output: '*' },
      recordAccess: ['allRecords'],
    },
    delete: { recordAccess: ['allRecords'] },
    download: {
      fields: { output: ['id', 'ownerId'] },
      recordAccess: ['allRecords'],
    },
  });
  const index = grants.findIndex(
    (grant) =>
      grant.resource.type === CONTRACTS_RESOURCE.type &&
      grant.resource.id === CONTRACTS_RESOURCE.id,
  );
  if (index !== -1) {
    if (
      JSON.stringify(grants[index].actions) === JSON.stringify(expected.actions)
    ) {
      return;
    }
    grants[index] = expected;
  } else {
    grants.push(expected);
  }

  await query
    .updateTable('authorizationPermissionSets')
    .set({ grants: JSON.stringify(grants), updatedAt: now })
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .execute();
}

function databaseGrant(
  actions: Readonly<Record<string, DatabaseActionGrant>>,
): PermissionGrantRecord {
  return {
    resource: CONTRACTS_RESOURCE,
    actions: Object.entries(actions).map(([action, config]) => ({
      action,
      policy: { type: 'database', ...config },
    })),
  };
}

/** Pages remain a separate authorization resource; grant only the contract routes this role needs. */
function contractPageGrants(): readonly PermissionGrantRecord[] {
  return CONTRACT_PAGES.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

export default seed;
