import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import {
  DEMO_PASSWORD,
  demoAccounts,
  type DemoAccount,
} from '../../seed-data/accounts.ts';

/**
 * Creates the demonstration accounts, each with a credential (password) login.
 * Idempotent: an account whose username or email already exists is left alone,
 * so a deployment that renamed or replaced it keeps its own version.
 */
function emailFor(account: DemoAccount): string {
  return account.email.toLowerCase();
}

const seed = defineSeed({
  name: '202609100010_service_demo_accounts',
  async run({ query }) {
    const now = new Date();
    for (const account of demoAccounts) {
      const username = account.username.toLowerCase();
      const email = emailFor(account);
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (existing) continue;

      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(DEMO_PASSWORD);
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
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
