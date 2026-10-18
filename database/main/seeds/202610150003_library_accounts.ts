import { defineSeed, type SeedContext } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * 资料员甲 and 阅读者乙, as installation data.
 *
 * They are required rather than sample data: the requirement names them, the
 * reader's confidentiality Restriction Rule is assigned to 乙 by user id, and
 * this application's installation path runs seeds but never sample data.
 *
 * The two Permission Sets it assigns are the ones
 * `202610150002_library_permission_sets` creates, which runs first because
 * seeds are ordered by filename. They are assigned by inserting into the
 * authorization assignment table directly, the same way that seed writes its
 * sets: an installation seed runs while only providers are registered, before
 * the authorization service and the application's role scopes exist.
 *
 * Accounts are written through the same tables and the same password hash the
 * authentication plugin's own initial-admin seed uses (`better-auth/crypto`),
 * because a database task resolves no plugin service — only the connection's
 * `query` and `repository`.
 *
 * Everything here is idempotent by username: a re-run reuses the account an
 * earlier run created — or one an administrator created by hand — and only
 * inserts the missing credential. It never rewrites a password or a profile an
 * administrator changed, so the seed means "this account exists", not "reset
 * this account".
 */

/** 资料员甲: maintains documents. */
export const MAINTAINER = {
  id: 'a1000000-0000-4000-8000-000000000001',
  username: 'jia',
  name: '资料员甲',
  email: 'jia@example.com',
  password: 'Jia12345678',
  permissionSet: 'library.maintainer',
} as const;

/** 阅读者乙: reads published documents. Its username is at least the three characters the sign-in route accepts. */
export const READER = {
  id: 'b2000000-0000-4000-8000-000000000002',
  username: 'duzhe',
  name: '阅读者乙',
  email: 'duzhe@example.com',
  password: 'Duzhe12345678',
  permissionSet: 'library.reader',
} as const;

const ACCOUNTS = [MAINTAINER, READER];

const seed = defineSeed({
  name: '202610150003_library_accounts',
  transaction: false,
  async run(context: SeedContext): Promise<void> {
    for (const account of ACCOUNTS) {
      const id = await ensureAccount(context, account);
      await assignPermissionSet(context, id, account.permissionSet);
    }
  },
});

/** Creates the account if its username is free, and returns its user id. */
async function ensureAccount(
  context: SeedContext,
  account: (typeof ACCOUNTS)[number],
): Promise<string> {
  const existing = await context.query
    .selectFrom('user')
    .select('id')
    .where('username', '=', account.username)
    .executeTakeFirst();

  const userId = existing ? String(existing.id) : account.id;
  const now = new Date();

  if (!existing) {
    await context.query
      .insertInto('user')
      .values({
        id: userId,
        name: account.name,
        username: account.username.toLowerCase(),
        email: account.email.toLowerCase(),
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const credential = await context.query
    .selectFrom('account')
    .select('id')
    .where('userId', '=', userId)
    .where('providerId', '=', 'credential')
    .executeTakeFirst();

  if (!credential) {
    await context.query
      .insertInto('account')
      .values({
        id: `${userId}-credential`,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword(account.password),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  return userId;
}

/**
 * Gives the account one Permission Set through the assignment table the Users
 * page reads direct roles from, unless that exact assignment already exists.
 */
async function assignPermissionSet(
  context: SeedContext,
  userId: string,
  permissionSet: string,
): Promise<void> {
  const existing = await context.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('subjectType', '=', 'user')
    .where('subjectId', '=', userId)
    .where('permissionSetKey', '=', permissionSet)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
  await context.query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: `user:${userId}:${permissionSet}`,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey: permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export default seed;
