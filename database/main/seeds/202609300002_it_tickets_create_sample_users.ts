import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

// Kept inline on purpose. A seed file is loaded by its own path at runtime, so a
// relative import into `server/` would have to resolve `.js` to `.ts` in
// development and would break there. `it-tickets-seeds.test.ts` cross-checks
// these against the server's constants, so the two cannot drift silently.
const SAMPLE_HANDLER_USERNAME = 'it-handler';
const SAMPLE_EMPLOYEE_USERNAMES = ['it-employee-1', 'it-employee-2'] as const;

/**
 * The accounts the IT ticket sample data needs: two employees and one handler.
 *
 * Fixed, reproducible identities. The password comes from the configured
 * initial administrator password so a factory-provisioned application can sign
 * in with the same credential it already knows.
 */
const SAMPLE_ACCOUNTS = [
  {
    username: SAMPLE_HANDLER_USERNAME,
    name: 'IT Handler',
    email: 'it-handler@example.com',
  },
  ...SAMPLE_EMPLOYEE_USERNAMES.map((username, index) => ({
    username,
    name: `Employee ${index + 1}`,
    email: `${username}@example.com`,
  })),
];

const seed: SeedDefinition = defineSeed({
  name: '202609300002_it_tickets_create_sample_users',
  async run({ query, config }) {
    const initialAdmin = config.get('users.initialAdmin');
    const password =
      initialAdmin &&
      typeof initialAdmin === 'object' &&
      !Array.isArray(initialAdmin) &&
      typeof (initialAdmin as { password?: unknown }).password === 'string' &&
      (initialAdmin as { password: string }).password.trim().length > 0
        ? (initialAdmin as { password: string }).password
        : 'admin123';
    const passwordHash = await hashPassword(password);
    const now = new Date();

    for (const account of SAMPLE_ACCOUNTS) {
      const username = account.username.toLowerCase();
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const userId = crypto.randomUUID();
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
