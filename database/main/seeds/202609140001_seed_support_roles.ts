import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * The support desk role model.
 *
 * - `support-agent`       staff: sees every ticket and may work on them.
 * - `support-customer`    every signed-in user by default: sees only their own
 *                         tickets and attachments.
 * - `system-administrator` (created by the Authorization plugin) is extended
 *                         with full access to the support collections.
 *
 * The permission sets are inserted directly into the authorization tables so a
 * fresh installation has a working role model without an administrator having
 * to click through the settings UI first.
 */
const SUPPORT_AGENT = 'support-agent';
const SUPPORT_CUSTOMER = 'support-customer';
const SYSTEM_ADMINISTRATOR = 'system-administrator';

const TICKET_RESOURCE = 'main.support_tickets';
const ATTACHMENT_RESOURCE = 'main.support_attachments';

const ALL_RECORDS = {
  type: 'database',
  fields: { input: '*', output: '*' },
  recordAccess: ['allRecords'],
} as const;

const OWN_RECORDS = {
  type: 'database',
  fields: { input: '*', output: '*' },
  recordAccess: ['recordsIOwn'],
} as const;

const CREATE_RECORD = {
  type: 'database',
  fields: { input: '*', output: '*' },
} as const;

interface PermissionGrantAction {
  readonly action: string;
  readonly policy?: unknown;
}

interface PermissionGrantRecord {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly PermissionGrantAction[];
}

const seed: SeedDefinition = defineSeed({
  name: '202609140001_seed_support_roles',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    await upsertPermissionSet(
      query,
      SUPPORT_AGENT,
      'Support agent',
      agentGrants(),
    );
    await upsertPermissionSet(
      query,
      SUPPORT_CUSTOMER,
      'Support customer',
      customerGrants(),
    );
    await assignPermissionSet(query, 'authenticated', '*', SUPPORT_CUSTOMER);
    await mergePermissionSet(
      query,
      SYSTEM_ADMINISTRATOR,
      administratorGrants(),
    );
  },
});

function agentGrants(): readonly PermissionGrantRecord[] {
  return [
    databaseGrant(TICKET_RESOURCE, [
      { action: 'read', policy: ALL_RECORDS },
      { action: 'create', policy: CREATE_RECORD },
      { action: 'update', policy: ALL_RECORDS },
    ]),
    databaseGrant(ATTACHMENT_RESOURCE, [
      { action: 'read', policy: ALL_RECORDS },
      { action: 'create', policy: CREATE_RECORD },
    ]),
    ...pageGrants(['tickets', 'ticket-detail', 'stats', 'home']),
    {
      resource: { type: 'support.role', id: '*' },
      actions: [{ action: 'staff' }],
    },
    {
      resource: { type: 'support.report', id: '*' },
      actions: [{ action: 'read' }],
    },
  ];
}

function customerGrants(): readonly PermissionGrantRecord[] {
  return [
    databaseGrant(TICKET_RESOURCE, [
      { action: 'read', policy: OWN_RECORDS },
      { action: 'create', policy: CREATE_RECORD },
      { action: 'update', policy: OWN_RECORDS },
    ]),
    databaseGrant(ATTACHMENT_RESOURCE, [
      { action: 'read', policy: OWN_RECORDS },
      { action: 'create', policy: CREATE_RECORD },
    ]),
    ...pageGrants(['tickets', 'ticket-detail', 'home']),
  ];
}

function administratorGrants(): readonly PermissionGrantRecord[] {
  return [
    databaseGrant(TICKET_RESOURCE, [
      { action: 'read', policy: ALL_RECORDS },
      { action: 'create', policy: CREATE_RECORD },
      { action: 'update', policy: ALL_RECORDS },
      { action: 'delete', policy: ALL_RECORDS },
    ]),
    databaseGrant(ATTACHMENT_RESOURCE, [
      { action: 'read', policy: ALL_RECORDS },
      { action: 'create', policy: CREATE_RECORD },
      { action: 'delete', policy: ALL_RECORDS },
    ]),
    {
      resource: { type: 'support.role', id: '*' },
      actions: [{ action: 'staff' }],
    },
    {
      resource: { type: 'support.report', id: '*' },
      actions: [{ action: 'read' }],
    },
  ];
}

function databaseGrant(
  id: string,
  actions: readonly PermissionGrantAction[],
): PermissionGrantRecord {
  return { resource: { type: 'database.collection', id }, actions };
}

function pageGrants(ids: readonly string[]): readonly PermissionGrantRecord[] {
  return ids.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

async function upsertPermissionSet(
  query: QueryAdapter,
  key: string,
  title: string,
  grants: readonly PermissionGrantRecord[],
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', key)
    .executeTakeFirst();
  if (!existing) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key,
        title,
        grants: JSON.stringify(grants),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    return;
  }
  await mergePermissionSet(query, key, grants);
}

async function mergePermissionSet(
  query: QueryAdapter,
  key: string,
  required: readonly PermissionGrantRecord[],
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', key)
    .executeTakeFirst();
  if (!existing) return;

  const current = parseGrants(existing.grants);
  const merged = mergeGrants(current, required);
  if (JSON.stringify(merged) === JSON.stringify(current)) return;

  await query
    .updateTable('authorizationPermissionSets')
    .set({ grants: JSON.stringify(merged), updatedAt: new Date() })
    .where('key', '=', key)
    .execute();
}

async function assignPermissionSet(
  query: QueryAdapter,
  subjectType: string,
  subjectId: string,
  permissionSet: string,
): Promise<void> {
  const id = `${subjectType}:${subjectId}:${permissionSet}`;
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
      subjectType,
      subjectId,
      permissionSetKey: permissionSet,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
}

/** Add grants and actions that are missing; never remove what a user configured. */
function mergeGrants(
  current: readonly PermissionGrantRecord[],
  required: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  const result = current.map((grant) => ({
    ...grant,
    actions: [...grant.actions],
  }));

  for (const needed of required) {
    const index = result.findIndex(
      (grant) =>
        grant.resource.type === needed.resource.type &&
        grant.resource.id === needed.resource.id,
    );
    if (index === -1) {
      result.push({ resource: needed.resource, actions: [...needed.actions] });
      continue;
    }
    const grant = result[index];
    const have = new Set(grant.actions.map(({ action }) => action));
    for (const action of needed.actions) {
      if (!have.has(action.action)) grant.actions.push(action);
    }
  }
  return result;
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'Support role grants must be a valid permission grant array.',
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

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
