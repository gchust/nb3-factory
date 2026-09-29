import { randomUUID } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

import {
  TEST_ACCOUNTS,
  TEST_ACCOUNT_PASSWORD,
} from '../../seed-data/test-accounts.ts';

/**
 * Creates the demonstration accounts if they are absent. Existing accounts with
 * the same email are left untouched, so a re-run changes nothing.
 */
export default defineSeed({
  name: '202609260001_service_test_users',
  transaction: true,
  async run(context) {
    const users = context.repository('user');
    const accounts = context.repository('account');

    for (const account of TEST_ACCOUNTS) {
      const existing = await users.findOne({
        filter: { email: account.email },
      });
      if (existing) {
        continue;
      }
      const id = randomUUID();
      const now = new Date();
      await users.createOne({
        values: {
          id,
          name: account.name,
          username: account.username,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      await accounts.createOne({
        values: {
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: await hashPassword(TEST_ACCOUNT_PASSWORD),
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});
