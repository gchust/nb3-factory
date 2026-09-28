import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import { LIBRARY_ACCOUNTS } from '../../seed-data/accounts.ts';

/**
 * Creates the two fictional accounts the library demonstration uses.
 *
 * The seed is idempotent by username and by email: it never adds a second row
 * for an account, and it never touches a password an administrator has since
 * changed. Runs after the authentication plugin's schema migration and before
 * the permission-set seed, which assigns the roles by looking these up.
 */
export default defineSeed({
  name: '202609280002_library_seed_accounts',
  transaction: true,
  async run({ query }) {
    for (const account of LIBRARY_ACCOUNTS) {
      const username = account.username.toLowerCase();
      const email = account.email.toLowerCase();

      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      const now = new Date();
      const userId = crypto.randomUUID();
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          username,
          email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(account.password),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
