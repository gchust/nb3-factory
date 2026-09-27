import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The two sample accounts the requirement names: 资料员甲 (the manager) and
 * 阅读者乙 (the reader). They own nothing and hold no permission set here; the
 * permission-set seed assigns that, so the two concerns stay separate.
 *
 * A fresh installation needs a way to sign in as each role, so the passwords
 * are fixed and stated in the README. Re-running is a no-op.
 */
const SAMPLE_ACCOUNTS = [
  {
    username: 'manager.a',
    name: '资料员甲',
    email: 'manager.a@example.com',
    password: 'Library123!',
  },
  {
    username: 'reader.b',
    name: '阅读者乙',
    email: 'reader.b@example.com',
    password: 'Library123!',
  },
] as const;

const seed = defineSeed({
  name: '202609280002_library_create_users',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const account of SAMPLE_ACCOUNTS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
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
