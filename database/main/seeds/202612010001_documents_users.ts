import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import { DEMO_PASSWORD, DEMO_USERS } from '../../seed-data/documents.ts';

/** Creates the two fictional business accounts used by the document library. */
export default defineSeed({
  name: '202612010001_documents_users',

  run: async (context) => {
    const { query } = context;
    for (const user of Object.values(DEMO_USERS)) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      const now = new Date();
      const id = randomUUID();
      await context.repository('user').createOne({
        values: {
          id,
          name: user.name,
          username: user.username,
          email: user.email,
          emailVerified: false,
          kind: 'person',
          createdAt: now,
          updatedAt: now,
        },
      });
      await context.repository('account').createOne({
        values: {
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: await hashPassword(DEMO_PASSWORD),
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});
