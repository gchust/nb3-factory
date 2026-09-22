// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import {
  createMemoDatabase,
  createTempDirectory,
  MEMO_MIGRATIONS_DIRECTORY,
  MEMO_PACKAGE_NAME,
  MEMO_SEEDS_DIRECTORY,
  removeTempDirectory,
} from '../support/customer-memos-database.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    removeTempDirectory(root);
  }
});

async function migratedDatabase() {
  const root = createTempDirectory('customer-memos-database-');
  roots.push(root);
  const manager = createMemoDatabase(root);
  const migration = await manager
    .createMigrator({
      directory: MEMO_MIGRATIONS_DIRECTORY,
      packageName: MEMO_PACKAGE_NAME,
    })
    .latest();
  return { manager, migration };
}

describe('customer memos migration', () => {
  it('creates the memo table and a matching rollback', async () => {
    const { manager, migration } = await migratedDatabase();

    expect(migration.executed).toContain('202609230001_create_customer_memos');
    expect(await manager.builder().hasCollection('customerMemos')).toBe(true);
    expect(
      await manager.query().selectFrom('customerMemos').selectAll().execute(),
    ).toEqual([]);

    await manager
      .createMigrator({
        directory: MEMO_MIGRATIONS_DIRECTORY,
        packageName: MEMO_PACKAGE_NAME,
      })
      .rollback();
    expect(await manager.builder().hasCollection('customerMemos')).toBe(false);
  });
});

describe('customer memos seed', () => {
  it('adds the sample memos without duplicating a row that already exists', async () => {
    const { manager } = await migratedDatabase();
    await manager
      .query()
      .insertInto('customerMemos')
      .values({
        customerName: '北京华信科技有限公司',
        content: '已确认续约意向，下季度跟进合同细节。',
        createdAt: new Date('2026-09-10T01:30:00.000Z'),
      })
      .execute();

    await manager
      .createSeeder({
        directory: MEMO_SEEDS_DIRECTORY,
        packageName: MEMO_PACKAGE_NAME,
      })
      .run();

    const rows = await manager
      .query()
      .selectFrom('customerMemos')
      .select(['id', 'customerName', 'content'])
      .execute();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.customerName)).size).toBe(3);
  });

  it('records the seed so a second run executes nothing', async () => {
    const { manager } = await migratedDatabase();
    const seeder = manager.createSeeder({
      directory: MEMO_SEEDS_DIRECTORY,
      packageName: MEMO_PACKAGE_NAME,
    });

    const first = await seeder.run();
    expect(first.executed).toContain('202609230002_seed_customer_memos');

    const second = await seeder.run();
    expect(second.executed).not.toContain('202609230002_seed_customer_memos');

    const rows = await manager
      .query()
      .selectFrom('customerMemos')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(3);
  });
});
