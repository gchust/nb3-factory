import type { DatabaseConnection } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import contractPermissionSeed from '../../database/main/seeds/202609140010_seed_contract_permissions.js';
import contractSampleSeed from '../../database/main/seeds/202609140011_seed_contract_samples.js';

import {
  contractMigrator,
  contractSeeder,
  createTestDatabase,
  type TestDatabase,
} from './helpers.js';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((database) => database.close()));
});

async function columns(
  connection: DatabaseConnection,
  table: string,
): Promise<Map<string, string>> {
  const physical = await connection.schemaInspector.getPhysicalCollection({
    tableName: table,
  });
  return new Map(
    (physical?.columns ?? []).map((column) => [
      column.columnName,
      column.dataType,
    ]),
  );
}

async function hasTable(
  connection: DatabaseConnection,
  table: string,
): Promise<boolean> {
  return (
    (await connection.schemaInspector.getPhysicalCollection({
      tableName: table,
    })) !== undefined
  );
}

describe('contract migrations', () => {
  it('creates the contract, version and attachment tables', async () => {
    const test = await createTestDatabase();
    open.push(test);

    const result = await contractMigrator(test.database).latest();
    expect(result.executed).toEqual([
      '202609140001_create_contracts',
      '202609140002_create_contract_versions',
      '202609140003_create_contract_attachments',
      '202609140004_default_account_issuer',
    ]);

    const contractColumns = await columns(test.connection, 'contracts');
    expect([...contractColumns.keys()]).toEqual(
      expect.arrayContaining([
        'id',
        'contract_no',
        'name',
        'counterparty',
        'type',
        'signed_date',
        'effective_date',
        'expiry_date',
        'amount',
        'owner_id',
        'owner_name',
        'created_by_id',
        'status',
        'created_at',
        'updated_at',
      ]),
    );
    // SQLite reports a decimal column as a float; the logical type is what matters here.
    expect(['decimal', 'float', 'double']).toContain(
      contractColumns.get('amount'),
    );

    const versionColumns = await columns(test.connection, 'contract_versions');
    expect([...versionColumns.keys()]).toEqual(
      expect.arrayContaining([
        'id',
        'contract_id',
        'version_no',
        'description',
        'uploaded_at',
        'uploaded_by_id',
      ]),
    );

    const attachmentColumns = await columns(
      test.connection,
      'contract_attachments',
    );
    // The File plugin's fixed shape plus the business link columns.
    expect([...attachmentColumns.keys()]).toEqual(
      expect.arrayContaining([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mime_type',
        'size',
        'contract_id',
        'version_id',
        'owner_id',
      ]),
    );
  });

  it('enforces the unique contract number', async () => {
    const test = await createTestDatabase();
    open.push(test);
    await contractMigrator(test.database).latest();

    const insert = {
      id: crypto.randomUUID(),
      contractNo: 'HT-DUP',
      name: 'A',
      counterparty: 'B',
      type: 'sale',
      amount: 1,
      ownerId: 'user-1',
      createdById: 'user-1',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await test.database
      .query()
      .insertInto('contracts')
      .values(insert)
      .execute();
    await expect(
      test.database
        .query()
        .insertInto('contracts')
        .values({ ...insert, id: crypto.randomUUID() })
        .execute(),
    ).rejects.toThrow();
  });

  it('reverses itself in a safe order', async () => {
    const test = await createTestDatabase();
    open.push(test);

    const migrator = contractMigrator(test.database);
    await migrator.latest();
    const rolledBack = await migrator.rollback();
    expect(rolledBack.rolledBack).toEqual([
      '202609140004_default_account_issuer',
      '202609140003_create_contract_attachments',
      '202609140002_create_contract_versions',
      '202609140001_create_contracts',
    ]);

    expect(await hasTable(test.connection, 'contracts')).toBe(false);
    expect(await hasTable(test.connection, 'contract_versions')).toBe(false);
    expect(await hasTable(test.connection, 'contract_attachments')).toBe(false);
  });
});

describe('contract seeds', () => {
  it('inserts sample contracts with versions and is repeatable', async () => {
    const test = await createTestDatabase();
    open.push(test);
    await contractMigrator(test.database).latest();

    const seeder = contractSeeder(test.database);
    const first = await seeder.run();
    expect(first.executed).toContain('202609140011_seed_contract_samples');

    const contracts = await test.database
      .query()
      .selectFrom('contracts')
      .select(['contractNo'])
      .execute();
    expect(contracts).toHaveLength(5);

    const versions = await test.database
      .query()
      .selectFrom('contractVersions')
      .select(['versionNo'])
      .execute();
    expect(versions.length).toBeGreaterThan(0);

    // Running the seed body again must not duplicate rows.
    const context = {
      query: test.database.query(),
      connection: test.connection,
    };
    await contractSampleSeed.run(context);
    await contractPermissionSeed.run(context);

    const after = await test.database
      .query()
      .selectFrom('contracts')
      .select(['contractNo'])
      .execute();
    expect(after).toHaveLength(5);
  });
});
