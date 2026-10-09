import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

// Two fictional archivists for the sample data. They are ordinary members: the built-in `member` permission set is
// already assigned to every authenticated subject, so a signed-in account reaches the materials page without any
// additional grant, and the per-owner isolation is enforced by the material routes, not by a permission set.
//
// Idempotent by username, so `db apply` re-runs harmlessly and never overwrites an account whose password a user has
// since changed. The credential row mirrors exactly what the authentication plugin's own default-admin seed writes,
// because Better Auth reads `user` plus the `credential` `account` row and verifies the hash it stores.
const accounts = [
  {
    username: 'materiala',
    name: '资料员甲',
    email: 'materiala@example.com',
    password: 'MaterialA123!',
  },
  {
    username: 'materialb',
    name: '资料员乙',
    email: 'materialb@example.com',
    password: 'MaterialB123!',
  },
] as const;

const seed = defineSeed({
  name: '202609050003_project_materials_test_accounts',
  async run({ query }) {
    for (const account of accounts) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .limit(1)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(account.password);

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
