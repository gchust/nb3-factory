import { defineSeed, type SeedContext } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demo accounts for the IT repair desk, and the role assignment that decides
 * what each one may do. Two colleagues who file tickets and one person who
 * works them.
 *
 * Credentials are intentionally fixed so a reviewer can sign in against a fresh
 * database and see both sides of the workflow. They belong to this seed alone —
 * never to a report, a page, or an environment file. The real application does
 * not depend on these accounts: an administrator grants the same roles to new
 * colleagues in the Users page, and the server reads roles from the permission
 * sets, not from these usernames.
 *
 *   employee1 / Demo@123456   (张伟)   files tickets
 *   employee2 / Demo@123456   (刘洋)   files tickets
 *   handler1  / Demo@123456   (王强)   works tickets
 *
 * `id` is deterministic so the sample-ticket seed can point at a stable
 * colleague without importing anything from this file.
 */

const PASSWORD = 'Demo@123456';

const DEMO_USERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '张伟',
    username: 'employee1',
    email: 'employee1@example.com',
    role: 'tickets-employee',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: '刘洋',
    username: 'employee2',
    email: 'employee2@example.com',
    role: 'tickets-employee',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: '王强',
    username: 'handler1',
    email: 'handler1@example.com',
    role: 'tickets-handler',
  },
] as const;

async function findUser(
  query: SeedContext['query'],
  username: string,
): Promise<{ id: string } | undefined> {
  return query
    .selectFrom('user')
    .select('id')
    .where('username', '=', username)
    .limit(1)
    .executeTakeFirst();
}

async function ensureUser(
  query: SeedContext['query'],
  user: (typeof DEMO_USERS)[number],
): Promise<string> {
  const existing = await findUser(query, user.username);
  if (existing) {
    return String(existing.id);
  }
  const now = new Date();
  const passwordHash = await hashPassword(PASSWORD);
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
      id: `account-${user.id}`,
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return user.id;
}

async function ensureAssignment(
  query: SeedContext['query'],
  userId: string,
  permissionSetKey: string,
): Promise<void> {
  const id = `user:${userId}:${permissionSetKey}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) {
    return;
  }
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

export default defineSeed({
  name: '202610050011_ticket_demo_users',
  async run({ query }) {
    for (const user of DEMO_USERS) {
      const userId = await ensureUser(query, user);
      await ensureAssignment(query, userId, user.role);
    }
  },
});
