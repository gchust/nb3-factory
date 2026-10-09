import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

interface TestUser {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

/**
 * The two business accounts the library feature is demonstrated with:
 * 资料员甲 (librarian) owns the library documents and may maintain them,
 * 阅读者乙 (reader) may only read what is shared with them. The administrator
 * keeps the account the authorization default-administrator seed created.
 */
const TEST_USERS: readonly TestUser[] = [
  {
    username: 'librarian',
    name: '资料员甲',
    email: 'librarian@example.com',
    password: 'librarian123',
  },
  {
    username: 'reader',
    name: '阅读者乙',
    email: 'reader@example.com',
    password: 'reader123',
  },
];

/**
 * Creates the two test accounts, idempotently. Passwords are hashed the way the
 * authentication plugin's own administrator seed hashes them, so the accounts
 * sign in through the standard credential provider.
 */
const seed = defineSeed({
  name: '202610100010_library_create_test_users',
  async run({ query }) {
    for (const user of TEST_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
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
