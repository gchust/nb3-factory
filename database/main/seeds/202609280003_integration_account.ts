import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The single account external integrations sign in with. Its credentials are fixed here because the task does not
 * supply any; they are the documented hand-off for the integration owner. Change the password after first sign-in if
 * this is used beyond the demonstration.
 */
export const INTEGRATION_USER = {
  username: 'integration',
  name: 'External integration',
  email: 'integration@example.com',
  password: 'Integration123!',
} as const;

const seed: SeedDefinition = defineSeed({
  name: '202609280003_integration_account',
  transaction: true,
  async run({ query }) {
    const username = INTEGRATION_USER.username.toLowerCase();
    const existing = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', username)
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const now = new Date();
    const userId = crypto.randomUUID();
    await query
      .insertInto('user')
      .values({
        id: userId,
        name: INTEGRATION_USER.name,
        username,
        email: INTEGRATION_USER.email.toLowerCase(),
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
        password: await hashPassword(INTEGRATION_USER.password),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

export default seed;
