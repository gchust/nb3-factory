import type { SeedContext } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import sampleSeed from '../../database/main/seeds/202609130002_seed_announcements.js';
import grantSeed from '../../database/main/seeds/202609130003_grant_default_pages_announcements.js';
import { createTestDatabase, type TestDatabase } from '../support/database.js';

interface KnexRawClient {
  raw(sql: string, bindings?: readonly unknown[]): Promise<unknown>;
}

let testDatabase: TestDatabase;

beforeEach(async () => {
  testDatabase = await createTestDatabase();
  await testDatabase.migrate();
});

afterEach(async () => {
  await testDatabase.cleanup();
});

describe('202609130002_seed_announcements', () => {
  it('inserts the samples once and leaves user data alone on a repeat run', async () => {
    const context = await seedContext(testDatabase);
    await sampleSeed.run(context);

    const afterFirst = await testDatabase.database
      .query()
      .selectFrom('announcements')
      .select(['title'])
      .execute();
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst.map((row) => row.title)).toEqual(
      expect.arrayContaining([
        'Welcome to the announcements board',
        'Scheduled maintenance',
      ]),
    );

    await sampleSeed.run(context);

    const afterSecond = await testDatabase.database
      .query()
      .selectFrom('announcements')
      .select(['title'])
      .execute();
    expect(afterSecond).toHaveLength(2);
  });
});

describe('202609130003_grant_default_pages_announcements', () => {
  it('adds the announcements page to default-pages exactly once', async () => {
    await createPermissionSetTable(testDatabase);

    await grantSeed.run(await seedContext(testDatabase));
    const first = await readDefaultPagesGrants(testDatabase);
    expect(countAnnouncementsPageGrant(first)).toBe(1);

    await grantSeed.run(await seedContext(testDatabase));
    const second = await readDefaultPagesGrants(testDatabase);
    expect(countAnnouncementsPageGrant(second)).toBe(1);
  });
});

async function seedContext(testDatabase: TestDatabase): Promise<SeedContext> {
  const connection = await testDatabase.database.connect();
  return { query: testDatabase.database.query(), connection };
}

async function createPermissionSetTable(
  testDatabase: TestDatabase,
): Promise<void> {
  const connection = await testDatabase.database.connect();
  const client = await connection.client<KnexRawClient>();
  await client.raw(
    'create table authorization_permission_sets (id text primary key, key text, title text, grants text, created_at datetime, updated_at datetime)',
  );
  await client.raw(
    'insert into authorization_permission_sets (id, key, title, grants, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    [
      'set-1',
      'default-pages',
      'Default pages',
      JSON.stringify([
        {
          resource: { type: 'page', id: 'home' },
          actions: [{ action: 'access' }],
        },
      ]),
      Date.now(),
      Date.now(),
    ],
  );
}

async function readDefaultPagesGrants(
  testDatabase: TestDatabase,
): Promise<readonly PageGrant[]> {
  const row = await testDatabase.database
    .query()
    .selectFrom('authorizationPermissionSets')
    .select('grants')
    .where('key', '=', 'default-pages')
    .executeTakeFirst();
  if (!row || typeof row.grants !== 'string') {
    throw new Error('The default-pages grant row was not found.');
  }
  const parsed: unknown = JSON.parse(row.grants);
  if (!Array.isArray(parsed)) {
    throw new Error('The default-pages grants were not an array.');
  }
  return parsed as readonly PageGrant[];
}

function countAnnouncementsPageGrant(grants: readonly PageGrant[]): number {
  return grants.filter(
    (grant) =>
      grant.resource.type === 'page' && grant.resource.id === 'announcements',
  ).length;
}

interface PageGrant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}
