// The seeded dataset is what every acceptance criterion is written against, so it is asserted here rather than inferred
// from the pages: exactly three materials (a published internal one, the owner's draft, a confidential one), exactly two
// test accounts, and no sharing before anyone shares anything. The seeds are regular seeds, so a plain install — this
// fixture, with no `APP_SAMPLE_DATA` — already has them.
// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= 'http://localhost';

const test = createAppTest({ createServer: createStandaloneServer });

test('seeds the three materials the acceptance criteria name, owned by 甲', async ({
  database,
}) => {
  const owner = await database
    .query()
    .selectFrom('user')
    .select('id')
    .where('username', '=', 'material_jia')
    .executeTakeFirst();

  const rows = await database
    .query()
    .selectFrom('materials')
    .select(['title', 'body', 'ownerId', 'published', 'confidential'])
    .execute();

  expect(
    rows.map((row) => ({
      title: row.title,
      published: Boolean(row.published),
      confidential: Boolean(row.confidential),
      ownedByJia: row.ownerId === owner?.id,
      hasBody: typeof row.body === 'string' && row.body !== '',
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        title: '公开资料 P',
        published: true,
        confidential: false,
        ownedByJia: true,
        hasBody: true,
      },
      {
        title: '私有草稿 D',
        published: false,
        confidential: false,
        ownedByJia: true,
        hasBody: true,
      },
      {
        title: '保密资料 C',
        published: true,
        confidential: true,
        ownedByJia: true,
        hasBody: true,
      },
    ]),
  );
  expect(rows).toHaveLength(3);

  // Nothing is shared until an administrator shares it.
  const shares = await database
    .query()
    .selectFrom('material_shares')
    .select('id')
    .execute();
  expect(shares).toHaveLength(0);
});

test('seeds exactly the two test accounts and no others of its own', async ({
  database,
}) => {
  const usernames = (
    await database.query().selectFrom('user').select('username').execute()
  ).map((row) => String(row.username));

  expect(usernames).toEqual(
    expect.arrayContaining(['material_jia', 'material_yi']),
  );
  expect(usernames.filter((name) => name.startsWith('material_'))).toHaveLength(
    2,
  );
});
