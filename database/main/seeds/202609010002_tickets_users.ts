import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';

/**
 * The two jobs the ticket flow needs, as ordinary user accounts.
 *
 * No new identity system is introduced and no password is invented: these
 * accounts reuse `users.initialAdmin.password`, the configured test credential,
 * the same way the default administrator seed does. Which permission set each
 * account holds is decided by the next seed.
 */

interface SeedAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
}

const ACCOUNTS: readonly SeedAccount[] = [
  {
    username: 'employee1',
    name: 'Employee One',
    email: 'employee1@example.com',
  },
  {
    username: 'employee2',
    name: 'Employee Two',
    email: 'employee2@example.com',
  },
  {
    username: 'handler1',
    name: 'Handler One',
    email: 'handler1@example.com',
  },
];

export default defineSeed({
  name: '202609010002_tickets_users',
  async run({ query, config }) {
    const password = resolveTestPassword(config);
    const now = new Date();

    for (const account of ACCOUNTS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      const userId = randomUUID();
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          username: account.username,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(password),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

function resolveTestPassword(config: { get(path: string): unknown }): string {
  const initialAdmin = config.get('users.initialAdmin');
  if (
    initialAdmin &&
    typeof initialAdmin === 'object' &&
    !Array.isArray(initialAdmin)
  ) {
    const password = (initialAdmin as { password?: unknown }).password;
    if (typeof password === 'string' && password.trim().length > 0) {
      return password;
    }
  }
  return 'admin123';
}
