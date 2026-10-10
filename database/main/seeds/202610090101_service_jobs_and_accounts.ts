import { hashPassword } from 'better-auth/crypto';
import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * Job data and demo accounts for the after-sales service system.
 *
 * Everything here is find-or-create against a natural key, so re-running the
 * seed changes nothing and never overwrites an account the installation has
 * since edited. Accounts and permission-set assignments are written with the
 * raw query, the way the authentication and authorization plugins write their
 * own installation data; business rows go through the Collection repository.
 */

interface GroupRow {
  id: number;
  code: string;
  name: string;
}

interface DemoAccount {
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly permissionSet: string;
}

/** Shared initial password for the delivered demo accounts. */
const DEMO_PASSWORD = 'Service@123';

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    username: 'service_supervisor',
    email: 'service.supervisor@example.com',
    name: 'Service Supervisor',
    permissionSet: 'service.supervisor',
  },
  {
    username: 'service_engineer_1',
    email: 'engineer.one@example.com',
    name: 'Engineer One',
    permissionSet: 'service.engineer',
  },
  {
    username: 'service_engineer_2',
    email: 'engineer.two@example.com',
    name: 'Engineer Two',
    permissionSet: 'service.engineer',
  },
  {
    username: 'service_observer',
    email: 'observer@example.com',
    name: 'Read-only Observer',
    permissionSet: 'service.observer',
  },
  {
    username: 'service_integrator',
    email: 'platform.api@example.com',
    name: 'Platform Integration',
    permissionSet: 'service.integrator',
  },
];

const SERVICE_GROUPS = [
  {
    code: 'group-a',
    name: '甲组 (Team A)',
    description: 'Primary equipment after-sales group.',
  },
  {
    code: 'group-b',
    name: '乙组 (Team B)',
    description: 'Secondary equipment after-sales group.',
  },
];

async function ensureGroup(
  context: SeedContext,
  group: (typeof SERVICE_GROUPS)[number],
): Promise<GroupRow> {
  const groups = context.repository<GroupRow>('service_groups');
  const existing = await groups.findOne({ filter: { code: group.code } });
  if (existing) {
    return existing;
  }
  const now = new Date();
  const created = await groups.createOne({
    values: {
      code: group.code,
      name: group.name,
      description: group.description,
      createdAt: now,
      updatedAt: now,
    } as never,
  });
  return created.record;
}

/**
 * Finds the account by email, or creates it with the shared demo password.
 * `username` is filled in for an account that exists but has none, because the
 * sign-in page accepts either identifier.
 */
async function ensureUser(
  context: SeedContext,
  account: DemoAccount,
): Promise<string> {
  const email = account.email.toLowerCase();
  const existing = await context.query
    .selectFrom('user')
    .select(['id', 'username'])
    .where('email', '=', email)
    .limit(1)
    .executeTakeFirst();
  if (existing) {
    if (!existing.username) {
      await context.query
        .updateTable('user')
        .set({ username: account.username, updatedAt: new Date() })
        .where('id', '=', String(existing.id))
        .execute();
    }
    return String(existing.id);
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  await context.query
    .insertInto('user')
    .values({
      id: userId,
      name: account.name,
      username: account.username,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await context.query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(DEMO_PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

async function hasPermissionSet(
  context: SeedContext,
  key: string,
): Promise<boolean> {
  const row = await context.query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst();
  return Boolean(row);
}

async function ensureAssignment(
  context: SeedContext,
  userId: string,
  permissionSetKey: string,
): Promise<void> {
  const assignmentId = `user:${userId}:${permissionSetKey}`;
  const existing = await context.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', assignmentId)
    .executeTakeFirst();
  if (existing) {
    return;
  }
  const now = new Date();
  await context.query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: assignmentId,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

const seed = defineSeed({
  name: '202610090101_service_jobs_and_accounts',
  async run(context) {
    for (const group of SERVICE_GROUPS) {
      await ensureGroup(context, group);
    }

    for (const account of DEMO_ACCOUNTS) {
      const userId = await ensureUser(context, account);
      // The permission sets seed runs first; if an installation removed the set,
      // the account stays without access rather than receiving an invented one.
      if (!(await hasPermissionSet(context, account.permissionSet))) {
        continue;
      }
      await ensureAssignment(context, userId, account.permissionSet);
    }
  },
});

export default seed;
