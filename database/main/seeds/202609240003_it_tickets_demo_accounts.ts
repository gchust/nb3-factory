import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import {
  DEMO_PASSWORD,
  demoAccounts,
} from '../../seed-data/it-tickets-demo.ts';

/**
 * Creates the demonstration accounts.
 *
 * This is sample data. It is kept in its own seed, separate from the
 * permission-set seed that a real installation needs, so a production database
 * can be provisioned without these people.
 */
const seed = defineSeed({
  name: '202609240003_it_tickets_demo_accounts',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const account of demoAccounts) {
      const username = account.username.toLowerCase();
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          username,
          email: account.email.toLowerCase(),
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
