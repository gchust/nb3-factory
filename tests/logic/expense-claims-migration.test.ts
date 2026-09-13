import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  migrate,
  MIGRATIONS_DIRECTORY,
  type SchemaClient,
  type TestDatabase,
} from '../helpers/test-database.js';

const MIGRATION_NAME = '202609130001_create_expense_claims';

describe('expense claims migration', () => {
  let database: TestDatabase;

  beforeAll(() => {
    database = createTestDatabase();
  });

  afterAll(async () => {
    await database.dispose();
  });

  it('creates the claim, file, and link tables on up', async () => {
    const executed = await migrate(database.manager);
    expect(executed).toContain(MIGRATION_NAME);

    const client = await database.manager
      .connection('main')
      .client<SchemaClient>();

    expect(await client.schema.hasTable('expense_claims')).toBe(true);
    expect(await client.schema.hasTable('expense_claim_files')).toBe(true);
    expect(await client.schema.hasTable('expense_claim_attachments')).toBe(
      true,
    );

    for (const column of [
      'reason',
      'amount',
      'expense_date',
      'created_at',
      'updated_at',
    ]) {
      expect(await client.schema.hasColumn('expense_claims', column)).toBe(
        true,
      );
    }

    for (const column of [
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mime_type',
      'size',
      'created_at',
      'updated_at',
    ]) {
      expect(await client.schema.hasColumn('expense_claim_files', column)).toBe(
        true,
      );
    }

    for (const column of [
      'expense_claim_id',
      'file_id',
      'sort',
      'created_at',
    ]) {
      expect(
        await client.schema.hasColumn('expense_claim_attachments', column),
      ).toBe(true);
    }
  });

  it('reverses the schema on down', async () => {
    const migrator = database.manager.createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: 'nb3-factory-test',
      connection: 'main',
    });
    await migrator.rollback();

    const client = await database.manager
      .connection('main')
      .client<SchemaClient>();

    expect(await client.schema.hasTable('expense_claims')).toBe(false);
    expect(await client.schema.hasTable('expense_claim_files')).toBe(false);
    expect(await client.schema.hasTable('expense_claim_attachments')).toBe(
      false,
    );
  });
});
