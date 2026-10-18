import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

/**
 * The two demonstration accounts for the internal-materials feature: 资料员甲 owns materials, 阅读者乙 only reads.
 *
 * They are installation data rather than sample data on purpose. The permission configuration seed assigns the 资料员
 * and 阅读者 sets to these accounts by username, so an installation that skipped them would ship a permission model
 * nobody holds. The seed never touches an account that already exists, so an administrator's own edits and password
 * changes survive.
 *
 * Kept as a plain literal rather than a shared module: a seed is a point-in-time snapshot, so changing the accounts
 * later means a new seed, not an edit here.
 */
const seed = defineSeed({
  name: '202610070005_materials_test_accounts',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const accounts = [
      {
        username: 'material_jia',
        name: '资料员甲',
        email: 'jia@example.com',
        password: 'jia123456',
      },
      {
        username: 'material_yi',
        name: '阅读者乙',
        email: 'yi@example.com',
        password: 'yi123456',
      },
    ] as const;
    for (const account of accounts) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const userId = crypto.randomUUID();
      const password = await hashPassword(account.password);
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          username: account.username,
          email: account.email,
          emailVerified: true,
          kind: 'person',
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

export default seed;
