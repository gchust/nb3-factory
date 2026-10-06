// @vitest-environment node
import path from 'node:path';

import {
  createDatabaseTest,
  describeMigration,
} from '@nocobase/app-testing/server';
import type { SeedContext } from '@nocobase/db';
import { expect } from 'vitest';

import documentsSeed from '../../database/main/seeds/202610060002_documents.ts';

const migrations = [
  {
    packageName: 'app',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
] as const;

/** The schema the documents migration leaves, checked after `up` and after it is reapplied. */
describeMigration('202610060001_create_documents', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    const documents = expectCollection('documents');
    await documents.toExist();
    await documents.toHaveField('id');
    await documents.toHaveField('title', { nullable: false, length: 200 });
    await documents.toHaveField('body', { nullable: false });
    await documents.toHaveField('accessLevel', { nullable: false });
    await documents.toHaveField('createdAt', { nullable: false });
    await documents.toHaveField('updatedAt', { nullable: false });
    await documents.toHaveIndex(['title'], { unique: true });
    await documents.toHaveIndex(['accessLevel']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('documents').not.toExist();
  },
});

interface SeedRow {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly accessLevel: string;
}

const test = createDatabaseTest({ migrations });

/**
 * The seed is not run through the Seeder here: the Seeder skips a seed whose checksum is already in
 * its history, so it cannot show what happens when the same titles are inserted again. Calling the
 * definition's own `run` with a real query adapter exercises that idempotency directly.
 */
function runDocumentsSeed(query: SeedContext['query']): Promise<void> {
  return documentsSeed.run({ query } as SeedContext);
}

async function readDocuments(connection: {
  query: SeedContext['query'];
}): Promise<SeedRow[]> {
  return (await connection.query
    .selectFrom('documents')
    .select(['id', 'title', 'body', 'accessLevel'])
    .orderBy('id')
    .execute()) as SeedRow[];
}

test('seeds the three documents and leaves a later edit untouched', async ({
  connection,
}) => {
  await runDocumentsSeed(connection.query);
  const first = await readDocuments(connection);
  expect(first).toHaveLength(3);
  expect(first.map((row) => row.accessLevel).sort()).toEqual([
    'staff',
    'staff',
    'supervisor',
  ]);
  expect(first.map((row) => row.title)).toEqual(
    expect.arrayContaining([
      '蓝鹭设备报修电话',
      '蓝鹭设备常规巡检间隔',
      '保密项目内部代号',
    ]),
  );

  // A supervisor edits a body, then the seed runs again: the edited row must survive.
  await connection.query
    .updateTable('documents')
    .set({ body: '蓝鹭设备常规巡检间隔为 60 天。' })
    .where('title', '=', '蓝鹭设备常规巡检间隔')
    .execute();
  await runDocumentsSeed(connection.query);

  const second = await readDocuments(connection);
  expect(second).toHaveLength(3);
  expect(second.find((row) => row.title === '蓝鹭设备常规巡检间隔')?.body).toBe(
    '蓝鹭设备常规巡检间隔为 60 天。',
  );
});
