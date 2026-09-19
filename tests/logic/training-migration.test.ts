import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_training_tables.js';
import fileMigration from '../../database/main/migrations/202609190003_create_training_files.js';
import type { MigrationContext } from '@nocobase/db';

const TRAINING_TABLES = [
  'training_courses',
  'training_sessions',
  'training_enrollments',
  'training_assignments',
  'training_submissions',
  'training_submission_reviews',
  'training_files',
  'training_materials',
  'training_submission_files',
  'training_review_files',
];

describe('training schema migration', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  function context(): MigrationContext {
    const connection = database.connection();
    return {
      builder: connection.builder,
      query: connection.query,
      connection: {
        name: connection.name,
        driver: connection.driver,
        dialect: connection.dialect,
        capabilities: connection.capabilities,
        client: connection.client.bind(connection),
      },
    };
  }

  async function tableNames(): Promise<string[]> {
    const page = await database
      .connection()
      .schemaInspector.listPhysicalCollections();
    return page.items.map((item) => item.tableName);
  }

  it('creates every training table with the declared columns', async () => {
    await migration.up(context());
    await fileMigration.up(context());

    const names = await tableNames();
    for (const table of TRAINING_TABLES) {
      expect(names).toContain(table);
    }

    const schema = await database
      .connection()
      .schemaInspector.getPhysicalCollection({
        tableName: 'training_submissions',
      });
    expect(schema).toBeDefined();
    const columns = schema?.columns.map((column) => column.columnName) ?? [];
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'assignment_id',
        'student_id',
        'attempt',
        'content',
        'status',
        'is_late',
        'submitted_at',
        'score',
        'feedback',
        'reviewed_by_id',
        'reviewed_at',
      ]),
    );
    expect(schema?.primaryKey?.columns).toEqual(['id']);
    expect(
      schema?.indexes.some(
        (index) =>
          index.unique &&
          index.keys.map((key) => key.columnName).join(',') ===
            'assignment_id,student_id,attempt',
      ),
    ).toBe(true);
  });

  it('creates the file and attachment tables the File Repository needs', async () => {
    await migration.up(context());
    await fileMigration.up(context());

    const files = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'training_files' });
    expect(files).toBeDefined();
    const fileColumns = files?.columns.map((column) => column.columnName) ?? [];
    // The File Repository contract: every one of these columns must exist.
    expect(fileColumns).toEqual(
      expect.arrayContaining([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mime_type',
        'size',
        'uploaded_by_id',
        'created_at',
        'updated_at',
      ]),
    );

    for (const table of [
      'training_materials',
      'training_submission_files',
      'training_review_files',
    ]) {
      const link = await database
        .connection()
        .schemaInspector.getPhysicalCollection({ tableName: table });
      expect(link?.columns.map((column) => column.columnName)).toEqual(
        expect.arrayContaining(['id', 'file_id', 'created_at', 'updated_at']),
      );
    }
  });

  it('drops every training table on rollback', async () => {
    await migration.up(context());
    await fileMigration.up(context());
    await fileMigration.down(context());
    await migration.down(context());

    const names = await tableNames();
    for (const table of TRAINING_TABLES) {
      expect(names).not.toContain(table);
    }
  });
});
