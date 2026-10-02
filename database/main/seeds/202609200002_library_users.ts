import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/** The two fixture accounts the library demonstration needs; see the documents seed. */
const EDITOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const READER_USER_ID = '22222222-2222-4222-8222-222222222222';
const DEMO_PASSWORD = 'Library2026!';

/**
 * 资料员甲 (clerk.a) and 阅读者乙 (reader.b).
 *
 * These are the two people the library permission model is demonstrated with.
 * The account rows are written the same way Authentication's own default-admin
 * seed writes them, because Better Auth owns the `user` and `account` tables.
 */
const seed = defineSeed({
  name: '202609200002_library_users',
  async run({ query }) {
    const account = async (
      id: string,
      name: string,
      username: string,
      email: string,
    ): Promise<void> => {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) return;

      const now = new Date();
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id,
          name,
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
          id: `account-${id}`,
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };

    await account(EDITOR_USER_ID, '资料员甲', 'clerk.a', 'clerk.a@example.com');
    await account(
      READER_USER_ID,
      '阅读者乙',
      'reader.b',
      'reader.b@example.com',
    );
  },
});

export default seed;
