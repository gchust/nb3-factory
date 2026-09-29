import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The two demonstration accounts the library ships with: 资料员甲 (`jia`) maintains documents, 阅读者乙 (`yier`)
 * reads them. The platform's own administrator is created by the authentication plugin and is left untouched.
 *
 * The password is a fixed demonstration credential, not a production secret; both accounts are ordinary users with no
 * superuser access and are granted nothing here — their permission sets are assigned by the following seed. Usernames
 * are at least three characters, which is the minimum the authentication plugin's username sign-in enforces.
 */
const DEMO_PASSWORD = 'demo1234';

const ACCOUNTS = [
  { username: 'jia', name: '资料员甲', email: 'jia@example.com' },
  { username: 'yier', name: '阅读者乙', email: 'yier@example.com' },
] as const;

export default defineSeed({
  name: '202609290001_library_accounts',
  transaction: true,
  async run({ query }) {
    const password = await hashPassword(DEMO_PASSWORD);
    const now = new Date();

    for (const account of ACCOUNTS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) continue;

      const userId = crypto.randomUUID();
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
          password,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
