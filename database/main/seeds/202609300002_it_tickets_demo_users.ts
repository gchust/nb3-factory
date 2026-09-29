import { hashPassword } from 'better-auth/crypto';

import { IT_DEMO_USERS } from '../../seed-data/it-tickets.ts';

import { defineSeed } from '@nocobase/db';

/**
 * Creates the demonstration accounts for the IT repair feature. It writes the
 * same `user` + `account` rows the Authentication seed writes for the initial
 * administrator, so these accounts sign in through the ordinary login page.
 *
 * A username that already exists is left untouched: an administrator who
 * created or edited that account keeps their version. Fixed ids keep the
 * sample tickets and permission assignments stable across a replayed seed.
 */
export default defineSeed({
  name: '202609300002_it_tickets_demo_users',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const user of IT_DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const passwordHash = await hashPassword(user.password);
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
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
