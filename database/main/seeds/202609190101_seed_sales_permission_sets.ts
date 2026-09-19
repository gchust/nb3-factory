import { defineSeed, type SeedDefinition } from '@nocobase/db';
import type { DatabaseConnection } from '@nocobase/db';

/**
 * Application roles for the sales system.
 *
 * The app uses the Authorization plugin's Permission Sets as its roles:
 *
 * - `sales-representative` is the baseline every signed-in user receives (an
 *   `authenticated/*` assignment), so a freshly registered account is a
 *   salesperson who sees only their own customers.
 * - `sales-manager` is assignable — an administrator can grant it on the Users
 *   page — and the server treats it, like `system-administrator`, as "see and
 *   manage every customer".
 *
 * The page grants are what make the business pages reachable. App pages
 * without a page ancestor are checked as `page:<route name>/access`, so a role
 * that lacks them would be sent to "Access denied" even though the API would
 * answer.
 */
const SALES_MANAGER = 'sales-manager';
const SALES_REPRESENTATIVE = 'sales-representative';
const AUTHENTICATED_SUBJECT = { type: 'authenticated', id: '*' } as const;

const PAGE_KEYS = [
  'home',
  'dashboard',
  'customers',
  'customer-detail',
  'opportunities',
  'opportunity-detail',
  'followups',
  'followup-detail',
] as const;

const pageGrants = PAGE_KEYS.map((id) => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
}));

const seed: SeedDefinition = defineSeed({
  name: '202609190101_seed_sales_permission_sets',

  async run({ query, connection }) {
    if (!(await tableExists(connection, 'authorization_permission_sets'))) {
      return;
    }

    await ensurePermissionSet(query, {
      key: SALES_MANAGER,
      title: 'Sales manager',
      grants: pageGrants,
    });
    await ensurePermissionSet(query, {
      key: SALES_REPRESENTATIVE,
      title: 'Sales representative',
      grants: pageGrants,
    });
    await ensureAssignment(query, SALES_REPRESENTATIVE, AUTHENTICATED_SUBJECT);
  },
});

interface PermissionSetInput {
  readonly key: string;
  readonly title: string;
  readonly grants: readonly unknown[];
}

async function ensurePermissionSet(
  query: DatabaseConnection['query'],
  input: PermissionSetInput,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', input.key)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
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
}

interface AssignmentSubject {
  readonly type: string;
  readonly id: string;
}

async function ensureAssignment(
  query: DatabaseConnection['query'],
  permissionSet: string,
  subject: AssignmentSubject,
): Promise<void> {
  const id = `${subject.type}:${subject.id}:${permissionSet}`;
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
      subjectType: subject.type,
      subjectId: subject.id,
      permissionSetKey: permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function tableExists(
  connection: ClientProvider,
  table: string,
): Promise<boolean> {
  // `hasTable` is raw driver metadata, so it needs the physical snake_case name
  // rather than the logical camelCase collection name the query adapter accepts.
  const client = await connection.client<TableSchemaClient>();
  return client.schema.hasTable(table);
}

interface ClientProvider {
  client<T = unknown>(name?: string): Promise<T>;
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
