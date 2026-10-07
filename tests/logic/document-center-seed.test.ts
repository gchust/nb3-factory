// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { SeedContext } from '@nocobase/db';
import { expect } from 'vitest';

import seed, {
  seededDepartments,
  seededDocuments,
} from '../../database/main/seeds/20260101000002-seed-document-center.ts';

const databasePackageName = '@nocobase/nb3-factory';
const migrations = [
  {
    packageName: databasePackageName,
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
    extensions: ['.ts'],
  },
];
const seeds = [
  {
    packageName: databasePackageName,
    directory: fileURLToPath(
      new URL('../../database/main/seeds', import.meta.url),
    ),
    extensions: ['.ts'],
  },
];

const test = createDatabaseTest({ migrations, seeds });

interface DocumentRow {
  id: number;
  code: string | null;
  title: string;
  updatedAt: Date;
}

/**
 * Run the seed definition again by hand. The fixture already ran the seed once
 * through its seeder; calling `run` a second time is what proves the seed
 * itself is idempotent rather than the seeder's history table hiding it.
 */
async function runSeedAgain(connection: SeedContext['connection']) {
  await seed.run({
    repository: (name: string) => connection.repository(name),
    connection,
    config: {},
    container: {},
  } as unknown as SeedContext);
}

test('installs the seeded departments and documents', async ({
  connection,
}) => {
  const departments = await connection.repository('departments').findMany();
  expect(departments).toHaveLength(seededDepartments.length);

  const documents = await connection
    .repository<DocumentRow>('documents')
    .findMany();
  expect(documents).toHaveLength(seededDocuments.length);
  expect(documents.map((document) => document.code).sort()).toEqual(
    seededDocuments.map((document) => document.code).sort(),
  );

  const versions = await connection.repository('documentVersions').findMany();
  // One version per document, plus the second version of the travel policy.
  expect(versions).toHaveLength(seededDocuments.length + 1);

  const links = await connection.repository('documentDepartments').findMany();
  const expectedLinks = seededDocuments.reduce(
    (total, document) => total + document.departmentCodes.length,
    0,
  );
  expect(links).toHaveLength(expectedLinks);
});

test('a repeat run reuses rows and leaves an administrator edit in place', async ({
  connection,
}) => {
  const documents = connection.repository<DocumentRow>('documents');
  const before = await documents.findMany();
  const handbook = before.find(
    (document) => document.code === 'employee-handbook',
  );
  expect(handbook).toBeDefined();
  await documents.updateOne({
    filter: { id: handbook!.id },
    values: { title: '管理员修改后的员工手册', updatedAt: new Date() },
  });

  await runSeedAgain(connection);

  const after = await documents.findMany();
  expect(after).toHaveLength(before.length);
  expect(
    after.find((document) => document.code === 'employee-handbook')?.title,
  ).toBe('管理员修改后的员工手册');
  // Reusing the document must not duplicate its version or visibility rows.
  expect(
    await connection.repository('documentVersions').findMany(),
  ).toHaveLength(seededDocuments.length + 1);
});
