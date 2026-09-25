import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import {
  SERVICE_REQUEST_TEST_PASSWORD,
  SERVICE_REQUEST_TEST_USERS,
} from '../../seed-data/service-request-fixtures.ts';

/**
 * Two accounts for exercising the acceptance flow: one creates and accepts a
 * request, the other is the assignee who receives the in-app message. Either
 * account can do either job, so a single person can walk the whole flow.
 *
 * Idempotent by username: if the account already exists (including one an
 * administrator has since changed), the seed leaves it alone.
 */
const seed = defineSeed({
  name: '202610100002_service_request_test_users',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const fixture of SERVICE_REQUEST_TEST_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', fixture.username)
        .executeTakeFirst();
      if (existing) continue;

      const passwordHash = await hashPassword(SERVICE_REQUEST_TEST_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: fixture.id,
          name: fixture.name,
          username: fixture.username,
          email: fixture.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          accountId: fixture.id,
          providerId: 'credential',
          userId: fixture.id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
