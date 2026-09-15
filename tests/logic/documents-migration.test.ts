import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Vitest runs with the application root as its working directory.
const migrationsDirectory = path.resolve(
  process.cwd(),
  'database/main/migrations',
);
const authenticationMigrationsDirectory = path.resolve(
  process.cwd(),
  'node_modules/@nocobase/app-plugin-authentication/dist/database/migrations',
);

const DOCUMENT_COLUMNS = [
  'id',
  'disk',
  'key',
  'filename',
  'ext',
  'mime_type',
  'size',
  'created_at',
  'updated_at',
  'drawing_number',
  'name',
  'discipline',
  'version',
  'status',
  'uploaded_by_id',
  'uploaded_by_name',
  'uploaded_at',
];

describe('documents migration', () => {
  let directory: string;
  let manager: DatabaseManager | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'nb3-documents-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: path.join(directory, 'test.sqlite'),
          schemaManagement: 'managed',
        },
      },
    });
  });

  afterEach(async () => {
    await manager?.destroy();
    manager = undefined;
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the file metadata and ledger columns, then reverses them', async () => {
    const migrator = manager!.createMigrator({
      connection: 'main',
      sources: [
        { packageName: 'app', directory: migrationsDirectory },
        {
          packageName: '@nocobase/app-plugin-authentication',
          directory: authenticationMigrationsDirectory,
        },
      ],
    });

    const result = await migrator.latest();
    expect(result.executed).toContain('202609140001_create_documents');

    const inspector = manager!.connection('main').schemaInspector;
    const created = await inspector.getPhysicalCollection({
      tableName: 'documents',
    });
    expect(created).toBeDefined();
    const columnNames = (created?.columns ?? []).map(
      (column) => column.columnName,
    );
    for (const column of DOCUMENT_COLUMNS) {
      expect(columnNames).toContain(column);
    }
    // The file plugin requires size to be an integer-family column.
    const size = created?.columns.find(
      (column) => column.columnName === 'size',
    );
    expect(size?.dataType).toBe('bigInt');
    expect(size?.nullable).toBe(false);
    const discipline = created?.columns.find(
      (column) => column.columnName === 'discipline',
    );
    expect(discipline?.nullable).toBe(true);
    expect(created?.primaryKey?.columns).toEqual(['id']);
    const indexNames = (created?.indexes ?? []).map((index) => index.name);
    expect(indexNames).toContain('idx_documents_discipline');

    // The compatibility migration keeps the column NOT NULL while defaulting the value Better Auth omits.
    const account = await inspector.getPhysicalCollection({
      tableName: 'account',
    });
    const issuer = account?.columns.find(
      (column) => column.columnName === 'issuer',
    );
    expect(issuer?.nullable).toBe(false);
    expect(issuer?.default?.value).toBe('local:credential');

    const rollback = await migrator.rollback();
    expect(rollback.rolledBack).toContain('202609140001_create_documents');

    const after = await inspector.getPhysicalCollection({
      tableName: 'documents',
    });
    expect(after).toBeUndefined();
  });
});
