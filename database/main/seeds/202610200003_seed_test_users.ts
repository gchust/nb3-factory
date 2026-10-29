import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';

/**
 * Two ordinary accounts for a mixed Chinese/English team. They have no administrator permission set; the device ledger
 * only requires a signed-in user.
 *
 * This is install data for this application rather than optional sample data: the task asks for two ordinary test
 * users, and an installation without them cannot demonstrate the shared ledger. The seed looks each account up by its
 * fixed email before inserting, so a second run does nothing and a changed password is never reset.
 *
 * The password is intentionally a documented development password. Deployments that keep these accounts must change
 * it (or remove the accounts) as part of their own account policy.
 */
const testUsers = [
  {
    name: '王芳',
    username: 'wangfang',
    email: 'wangfang@example.com',
  },
  {
    name: 'Alex Chen',
    username: 'alexchen',
    email: 'alex.chen@example.com',
  },
] as const;

const INITIAL_PASSWORD = 'Device123!';

export default defineSeed({
  name: '202610200003_seed_test_users',

  async run({ query }) {
    for (const testUser of testUsers) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', testUser.email)
        .limit(1)
        .executeTakeFirst();
      if (existing) continue;

      // Better Auth stores credentials on the account, not the user. Hashing is the same operation its credential
      // sign-in performs, so the seeded account can sign in through the normal form.
      const userId = randomUUID();
      const password = await hashPassword(INITIAL_PASSWORD);
      const now = new Date();

      await query
        .insertInto('user')
        .values({
          id: userId,
          name: testUser.name,
          username: testUser.username,
          email: testUser.email,
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
          password,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
