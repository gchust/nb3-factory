import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

const CONTRACT_FILES_MIGRATION = '202609130001_create_contract_files';
const CONTRACTS_MIGRATION = '202609130002_create_contracts';

describe('contract archive migrations', () => {
  let manager: DatabaseManager;
  let directory: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-migration-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(directory, 'database.sqlite'),
        },
      },
    });
    await manager.connect('main');
  });

  afterEach(async () => {
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function migrator() {
    return manager.createMigrator({
      directory: MIGRATIONS_DIR,
      packageName: 'app',
    });
  }

  it('creates both collections with the columns the feature relies on', async () => {
    const result = await migrator().latest();
    expect(result.executed).toEqual(
      expect.arrayContaining([CONTRACT_FILES_MIGRATION, CONTRACTS_MIGRATION]),
    );

    const collections = manager.connection('main').collections;
    const contracts = await collections.getPhysical('contracts');
    expect(contracts).toBeDefined();
    const contractColumns = new Set(
      contracts?.columns.map((column) => column.columnName),
    );
    for (const column of [
      'id',
      'name',
      'counterparty',
      'category',
      'attachment_id',
      'created_at',
      'updated_at',
    ]) {
      expect(contractColumns.has(column), `contracts.${column}`).toBe(true);
    }

    const files = await collections.getPhysical('contract_files');
    expect(files).toBeDefined();
    const fileColumns = new Set(
      files?.columns.map((column) => column.columnName),
    );
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
      expect(fileColumns.has(column), `contract_files.${column}`).toBe(true);
    }
  });

  it('enforces the single-attachment relation with a unique constraint', async () => {
    await migrator().latest();
    const query = manager.query('main');
    await query
      .insertInto('contractFiles')
      .values({
        id: '20000000-0000-4000-8000-000000000001',
        disk: 'local',
        key: 'objects/a.txt',
        filename: 'a.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 1,
        createdAt: '2026-09-13T00:00:00.000',
        updatedAt: '2026-09-13T00:00:00.000',
      })
      .execute();

    const insertContract = (name: string) =>
      query
        .insertInto('contracts')
        .values({
          name,
          counterparty: 'Test Co',
          category: 'procurement',
          attachmentId: '20000000-0000-4000-8000-000000000001',
          createdAt: '2026-09-13T00:00:00.000',
          updatedAt: '2026-09-13T00:00:00.000',
        })
        .execute();

    await insertContract('first');
    await expect(insertContract('second')).rejects.toThrow();
  });

  it('rolls back to a clean schema', async () => {
    await migrator().latest();
    const collections = manager.connection('main').collections;
    expect(await collections.getPhysical('contracts')).toBeDefined();

    const rollback = await migrator().rollback();
    expect(rollback.rolledBack).toEqual(
      expect.arrayContaining([CONTRACTS_MIGRATION, CONTRACT_FILES_MIGRATION]),
    );

    expect(await collections.getPhysical('contracts')).toBeUndefined();
    expect(await collections.getPhysical('contract_files')).toBeUndefined();
  });
});
