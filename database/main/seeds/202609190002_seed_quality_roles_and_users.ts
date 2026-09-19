import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Application roles and trial accounts for the quality inspection system.
 *
 * Roles are Authorization Permission Sets assigned directly to users; the
 * application resolves them at request time and enforces the business rules
 * itself. The page grants let each role open the pages it needs in the browser.
 *
 * Fixed ids keep the sample business data reproducible: the batch/task seed
 * references these accounts by id.
 */

export const QUALITY_SUPERVISOR_ROLE = 'quality-supervisor';
export const INSPECTOR_ROLE = 'inspector';
export const PRODUCTION_LEAD_ROLE = 'production-lead';
export const TRIAL_PASSWORD = 'Quality-2026';

export const TRIAL_USERS = {
  supervisor: {
    id: 'qcuser00000000000000000000000001',
    name: '质检主管 王敏',
    username: 'qc.supervisor',
    email: 'qc.supervisor@example.invalid',
  },
  inspector: {
    id: 'qcuser00000000000000000000000002',
    name: '检验员 李强',
    username: 'qc.inspector',
    email: 'qc.inspector@example.invalid',
  },
  inspectorTwo: {
    id: 'qcuser00000000000000000000000003',
    name: '检验员 陈静',
    username: 'qc.inspector2',
    email: 'qc.inspector2@example.invalid',
  },
  productionLead: {
    id: 'qcuser00000000000000000000000004',
    name: '生产负责人 赵磊',
    username: 'prod.lead',
    email: 'prod.lead@example.invalid',
  },
} as const;

const HOME_PAGE = 'home';
const SUPERVISOR_PAGES = [
  HOME_PAGE,
  'quality-batches',
  'quality-tasks',
  'quality-results',
  'quality-rectifications',
  'quality-stats',
];
const INSPECTOR_PAGES = [
  HOME_PAGE,
  'quality-batches',
  'quality-my-inspections',
  'quality-results',
];
const PRODUCTION_LEAD_PAGES = [
  HOME_PAGE,
  'quality-batches',
  'quality-results',
  'quality-rectifications',
];

const seed: SeedDefinition = defineSeed({
  name: '202609190002_seed_quality_roles_and_users',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (
      !(await client.schema.hasTable('user')) ||
      !(await client.schema.hasTable('authorization_permission_sets')) ||
      !(await client.schema.hasTable(
        'authorization_permission_set_assignments',
      ))
    ) {
      return;
    }

    await ensureUser(query, TRIAL_USERS.supervisor);
    await ensureUser(query, TRIAL_USERS.inspector);
    await ensureUser(query, TRIAL_USERS.inspectorTwo);
    await ensureUser(query, TRIAL_USERS.productionLead);

    await ensurePermissionSet(
      query,
      QUALITY_SUPERVISOR_ROLE,
      '质检主管',
      SUPERVISOR_PAGES,
    );
    await ensurePermissionSet(query, INSPECTOR_ROLE, '检验员', INSPECTOR_PAGES);
    await ensurePermissionSet(
      query,
      PRODUCTION_LEAD_ROLE,
      '生产负责人',
      PRODUCTION_LEAD_PAGES,
    );

    await ensureAssignment(
      query,
      TRIAL_USERS.supervisor.id,
      QUALITY_SUPERVISOR_ROLE,
    );
    await ensureAssignment(query, TRIAL_USERS.inspector.id, INSPECTOR_ROLE);
    await ensureAssignment(query, TRIAL_USERS.inspectorTwo.id, INSPECTOR_ROLE);
    await ensureAssignment(
      query,
      TRIAL_USERS.productionLead.id,
      PRODUCTION_LEAD_ROLE,
    );
  },
});

type SeedQuery = SeedContext['query'];

async function ensureUser(
  query: SeedQuery,
  user: {
    readonly id: string;
    readonly name: string;
    readonly username: string;
    readonly email: string;
  },
): Promise<void> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
  await query
    .insertInto('user')
    .values({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: `${user.id}-credential`,
      issuer: 'local:credential',
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: await hashPassword(TRIAL_PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function ensurePermissionSet(
  query: SeedQuery,
  key: string,
  title: string,
  pages: readonly string[],
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
      grants: JSON.stringify(
        pages.map((page) => ({
          resource: { type: 'page', id: page },
          actions: [{ action: 'access' }],
        })),
      ),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function ensureAssignment(
  query: SeedQuery,
  userId: string,
  permissionSetKey: string,
): Promise<void> {
  const id = `user:${userId}:${permissionSetKey}`;
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
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
