import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import { LIBRARY_ACCOUNTS } from '../../../server/library/seed-data.ts';

/**
 * The two demonstration accounts.
 *
 * Idempotent by username: a re-run reuses the account an earlier run created —
 * or one an administrator created by hand — and only inserts the missing
 * credential. It never rewrites a password or a profile an administrator
 * changed, so the seed means "this account exists", not "reset this account".
 */
export default defineSeed({
  name: '202610070002_library_accounts',
  async run({ query }) {
    const now = new Date();

    for (const account of LIBRARY_ACCOUNTS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();

      const userId = existing ? String(existing.id) : account.id;
      if (!existing) {
        await query
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

      const credential = await query
        .selectFrom('account')
        .select('id')
        .where('userId', '=', userId)
        .where('providerId', '=', 'credential')
        .executeTakeFirst();

      if (!credential) {
        await query
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
    }
  },
});
