import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609200001_create_library_collections.js';
import { createLibraryDatabase } from '../fixtures/library.js';

const LIBRARY_TABLES = [
  'materials',
  'material_files',
  'material_readers',
  'material_borrowings',
] as const;

describe('library collections migration', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createLibraryDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function tables(): Promise<readonly string[]> {
    const rows = await database
      .query()
      .selectFrom('sqlite_master')
      .select('name')
      .where('type', '=', 'table')
      .execute();
    return rows.map((row) => String(row.name));
  }

  async function columns(table: string): Promise<readonly string[]> {
    const rows = await database
      .query()
      .selectFrom('pragma_table_info')
      .select('name')
      .where('arg', '=', table)
      .execute();
    return rows.map((row) => String(row.name));
  }

  it('creates the four library tables with their application columns', async () => {
    const present = await tables();
    for (const table of LIBRARY_TABLES) {
      expect(present).toContain(table);
    }

    expect(await columns('materials')).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'category',
        'summary',
        'owner',
        'borrowable',
        'total_copies',
        'available_copies',
        'visibility',
        'cover_file_id',
      ]),
    );
    expect(await columns('material_files')).toEqual(
      expect.arrayContaining([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mime_type',
        'size',
        'material_id',
        'role',
        'uploader_id',
        'uploader_name',
      ]),
    );
    expect(await columns('material_readers')).toEqual(
      expect.arrayContaining(['material_id', 'user_id']),
    );
    expect(await columns('material_borrowings')).toEqual(
      expect.arrayContaining([
        'material_id',
        'user_id',
        'status',
        'requested_at',
        'borrowed_at',
        'returned_at',
      ]),
    );
  });

  it('reverses cleanly so a rollback leaves no library table behind', async () => {
    const connection = database.connection();
    await migration.down?.({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    const present = await tables();
    for (const table of LIBRARY_TABLES) {
      expect(present).not.toContain(table);
    }
  });
});
