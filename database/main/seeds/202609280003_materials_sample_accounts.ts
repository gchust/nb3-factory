import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two isolated test accounts for the materials assistant:
 *
 * - `materials.manager` holds the `materials-manager` Permission Set (a role
 *   marker assigned by the permission-set seed below) and may read the
 *   manager-only material and edit materials.
 * - `materials.colleague` holds `materials-colleague` and sees only the two
 *   materials whose audience is `all`.
 *
 * Written the same way the authentication plugin writes its initial admin —
 * `user` plus the credential `account` row — so the accounts can sign in
 * through the normal login page. Idempotent by username, so a repeated seed run
 * neither duplicates the accounts nor resets their passwords.
 */
const seed = defineSeed({
  name: '202609280003_materials_sample_accounts',
  async run({ query }) {
    const accounts = [
      {
        username: 'materials.manager',
        name: '资料管理员',
        email: 'materials.manager@example.com',
        password: 'Materials123',
      },
      {
        username: 'materials.colleague',
        name: '普通同事',
        email: 'materials.colleague@example.com',
        password: 'Materials123',
      },
    ] as const;

    for (const account of accounts) {
      const username = account.username.toLowerCase();
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
      const passwordHash = await hashPassword(account.password);

      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          username,
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
