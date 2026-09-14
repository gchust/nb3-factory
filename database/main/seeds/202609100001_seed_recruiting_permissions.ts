import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Recruiting roles as Authorization Permission Sets, plus the page-access grants that make each role's pages visible.
 *
 * `system-administrator` is the built-in administrator set; this seed appends the recruiting grants to it so the
 * administrator can manage the whole system. `interviewer` is assigned to the `authenticated` subject, so anyone who
 * registers through the Sign up page starts with the interviewer role and can immediately be assigned interviews.
 * The `recruiting-manager` and `archive-viewer` sets are assigned to individual users from the Users settings page.
 */

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const RECRUITING_MANAGER = 'recruiting-manager';
const INTERVIEWER = 'interviewer';
const ARCHIVE_VIEWER = 'archive-viewer';

const COLLECTIONS = [
  'recruitingRequisitions',
  'recruitingCandidates',
  'recruitingInterviews',
  'recruitingEvaluations',
  'recruitingOffers',
] as const;

const ALL_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

interface GrantAction {
  readonly action: string;
  readonly policy?: unknown;
}

interface GrantRecord {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly GrantAction[];
}

interface PermissionSetRecord {
  readonly key: string;
  readonly title: string;
  readonly grants: readonly GrantRecord[];
}

interface Subject {
  readonly type: string;
  readonly id: string;
}

/** Every database action granting full record access to a collection. */
function allRecordsActions(actions: readonly string[]): readonly GrantAction[] {
  return actions.map((action) => ({
    action,
    policy: {
      type: 'database',
      fields: { input: '*', output: '*' },
      recordAccess: ['allRecords'],
    },
  }));
}

/** Reads only the records the caller owns — used for interviews assigned to the caller. */
function ownRecordsActions(actions: readonly string[]): readonly GrantAction[] {
  return actions.map((action) => ({
    action,
    policy: {
      type: 'database',
      fields: { input: '*', output: '*' },
      recordAccess: ['recordsIOwn'],
    },
  }));
}

function databaseGrants(
  collections: readonly string[],
  actions: readonly string[] = ALL_ACTIONS,
): readonly GrantRecord[] {
  return collections.map((name) => ({
    resource: { type: 'database.collection', id: `main.${name}` },
    actions: allRecordsActions(actions),
  }));
}

function pageGrant(id: string): GrantRecord {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

function permissionSets(): readonly PermissionSetRecord[] {
  return [
    {
      key: RECRUITING_MANAGER,
      title: 'Recruiting manager',
      grants: [
        pageGrant('dashboard'),
        pageGrant('requisitions'),
        pageGrant('candidates'),
        pageGrant('candidateDetail'),
        pageGrant('interviews'),
        pageGrant('offers'),
        ...databaseGrants(COLLECTIONS),
      ],
    },
    {
      key: INTERVIEWER,
      title: 'Interviewer',
      grants: [
        pageGrant('interviews'),
        {
          resource: {
            type: 'database.collection',
            id: 'main.recruitingInterviews',
          },
          actions: ownRecordsActions(['read']),
        },
        {
          resource: {
            type: 'database.collection',
            id: 'main.recruitingEvaluations',
          },
          actions: [
            {
              action: 'create',
              policy: {
                type: 'database',
                fields: { input: '*', output: '*' },
              },
            },
            {
              action: 'read',
              policy: {
                type: 'database',
                fields: { input: '*', output: '*' },
                recordAccess: ['allRecords'],
              },
            },
            {
              action: 'update',
              policy: {
                type: 'database',
                fields: { input: '*', output: '*' },
                recordAccess: ['recordsICreated'],
              },
            },
          ],
        },
      ],
    },
    {
      key: ARCHIVE_VIEWER,
      title: 'Archive viewer',
      grants: [
        pageGrant('candidates'),
        pageGrant('candidateDetail'),
        ...databaseGrants(
          ['recruitingCandidates', 'recruitingRequisitions'],
          ['read'],
        ),
      ],
    },
  ];
}

const seed: SeedDefinition = defineSeed({
  name: '202609100001_seed_recruiting_permissions',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    const now = new Date();
    for (const definition of permissionSets()) {
      await upsertPermissionSet(query, definition, now);
    }

    // Append recruiting grants to the built-in administrator set without disturbing its existing grants.
    const administrator = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', SYSTEM_ADMINISTRATOR)
      .executeTakeFirst();
    if (administrator) {
      const current = parseGrants(administrator.grants);
      const merged = mergeGrants(current, databaseGrants(COLLECTIONS));
      if (merged !== current) {
        await query
          .updateTable('authorizationPermissionSets')
          .set({ grants: JSON.stringify(merged), updatedAt: now })
          .where('key', '=', SYSTEM_ADMINISTRATOR)
          .execute();
      }
    }

    // Default role for anyone who signs up: interviewer.
    await assign(query, { type: 'authenticated', id: '*' }, INTERVIEWER, now);
  },
});

async function upsertPermissionSet(
  query: QueryAdapter,
  definition: PermissionSetRecord,
  now: Date,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', definition.key)
    .executeTakeFirst();

  const grants = JSON.stringify(definition.grants);
  if (!existing) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: definition.key,
        title: definition.title,
        grants,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return;
  }

  if (existing.grants !== grants) {
    await query
      .updateTable('authorizationPermissionSets')
      .set({ title: definition.title, grants, updatedAt: now })
      .where('key', '=', definition.key)
      .execute();
  }
}

async function assign(
  query: QueryAdapter,
  subject: Subject,
  permissionSet: string,
  now: Date,
): Promise<void> {
  const id = `${subject.type}:${subject.id}:${permissionSet}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType: subject.type,
      subjectId: subject.id,
      permissionSetKey: permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

function mergeGrants(
  current: readonly GrantRecord[],
  additions: readonly GrantRecord[],
): readonly GrantRecord[] {
  const key = (grant: GrantRecord) =>
    `${grant.resource.type}\u0000${grant.resource.id}`;
  const byResource = new Map(current.map((grant) => [key(grant), grant]));
  let changed = false;

  for (const addition of additions) {
    const existing = byResource.get(key(addition));
    if (!existing) {
      byResource.set(key(addition), addition);
      changed = true;
      continue;
    }
    const actions = new Set(existing.actions.map(({ action }) => action));
    const missing = addition.actions.filter(
      ({ action }) => !actions.has(action),
    );
    if (missing.length === 0) continue;
    byResource.set(key(addition), {
      ...existing,
      actions: [...existing.actions, ...missing],
    });
    changed = true;
  }

  return changed ? [...byResource.values()] : current;
}

function parseGrants(value: unknown): readonly GrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    throw new Error('Permission set grants must be an array.');
  }
  return parsed as readonly GrantRecord[];
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
