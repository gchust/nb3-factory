import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The two accounts this system is exercised with.
 *
 * They exist so the acceptance can sign in as both sides of the access line:
 * `supervisor` maintains all three materials, `colleague` may read only the two
 * non-confidential ones. They are ordinary credential accounts under the
 * application's authentication plugin; the permission-set seed assigns each its
 * job.
 *
 * This is a fresh-installation seed; it adds missing accounts and leaves an
 * existing account, and anything an administrator changed about it, alone.
 */
const USERS = [
  {
    name: 'Supervisor',
    username: 'supervisor',
    email: 'supervisor@example.com',
    password: 'supervisor123',
  },
  {
    name: 'Colleague',
    username: 'colleague',
    email: 'colleague@example.com',
    password: 'colleague123',
  },
] as const;

const seed = defineSeed({
  name: '202610010003_materials_test_users',
  transaction: true,
  async run({ query }) {
    for (const user of USERS) {
      const username = user.username.toLowerCase();
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      const now = new Date();
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(user.password);

      await query
        .insertInto('user')
        .values({
          id: userId,
          name: user.name,
          username,
          email: user.email.toLowerCase(),
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
