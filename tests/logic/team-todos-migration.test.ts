import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createAppMigrator } from '@nocobase/app-server/database';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);

describe('team todos migration', () => {
  let database: DatabaseManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'team-todos-migration-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(tempDir, 'test.sqlite'),
        },
      },
    });
    await database.connect();
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createMigrator() {
    return createAppMigrator({
      database,
      config: {
        directory: migrationsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    });
  }

  it('up creates the team_todos table with the expected schema', async () => {
    const result = await createMigrator().latest();
    expect(result.status).toBe('completed');
    expect(result.executed).toContain('202609090001_create_team_todos');

    const schema = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'team_todos' });
    expect(schema).toBeDefined();

    const columns = new Map(
      schema!.columns.map((column) => [column.columnName, column]),
    );
    expect(columns.get('id')).toMatchObject({
      dataType: 'integer',
      autoIncrement: true,
      nullable: false,
    });
    expect(columns.get('title')).toMatchObject({
      dataType: 'string',
      nullable: false,
    });
    expect(columns.get('description')).toMatchObject({
      dataType: 'text',
      nullable: true,
    });
    expect(columns.get('status')).toMatchObject({
      dataType: 'string',
      nullable: false,
    });
    expect(columns.get('priority')).toMatchObject({
      dataType: 'string',
      nullable: false,
    });
    expect(columns.get('due_date')).toMatchObject({
      dataType: 'text',
      nullable: true,
    });
    expect(columns.get('created_at')).toMatchObject({
      dataType: 'text',
      nullable: false,
    });
    expect(columns.get('updated_at')).toMatchObject({
      dataType: 'text',
      nullable: false,
    });

    const statusIndex = schema!.indexes.find((index) =>
      index.keys.some((key) => key.columnName === 'status'),
    );
    expect(statusIndex).toBeDefined();
  });

  it('down drops the team_todos table', async () => {
    const migrator = createMigrator();
    await migrator.latest();

    const rollback = await migrator.rollback();
    expect(rollback.status).toBe('completed');
    expect(rollback.rolledBack).toContain('202609090001_create_team_todos');

    const schema = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'team_todos' });
    expect(schema).toBeUndefined();
  });
});
