import type { DatabaseManager } from '@nocobase/db';
import { createMigrationContext } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609010001_create_it_asset_tables.js';
import { createTestDatabase } from './helpers/asset-test-db.js';

async function tableNames(database: DatabaseManager): Promise<string[]> {
  const rows = await database
    .query()
    .selectFrom('sqlite_master')
    .select('name')
    .where('type', '=', 'table')
    .execute();
  return rows.map((row) => String(row.name));
}

describe('it asset tables migration', () => {
  it('creates the expected tables on up', async () => {
    const { database } = await createTestDatabase();
    try {
      const names = await tableNames(database);
      expect(names).toContain('it_employees');
      expect(names).toContain('it_assets');
      expect(names).toContain('it_asset_records');
    } finally {
      await database.destroy();
    }
  });

  it('creates the expected columns and constraints on it_assets', async () => {
    const { database, knex } = await createTestDatabase();
    try {
      const info = (await knex.raw('PRAGMA table_info(it_assets)')) as Array<{
        name: string;
        notnull: number;
        pk: number;
      }>;
      const columns = new Map(info.map((column) => [column.name, column]));
      expect(columns.get('id')?.pk).toBe(1);
      expect(columns.get('asset_number')?.notnull).toBe(1);
      expect(columns.get('name')?.notnull).toBe(1);
      expect(columns.get('type')?.notnull).toBe(1);
      expect(columns.get('brand_model')?.notnull).toBe(1);
      expect(columns.get('status')?.notnull).toBe(1);
      expect(columns.get('current_employee_id')?.notnull).toBe(0);
      expect(columns.get('purchased_at')?.notnull).toBe(0);
      expect(columns.get('remark')?.notnull).toBe(0);
      expect(columns.get('created_at')?.notnull).toBe(1);

      const indexes = (await knex.raw(
        'PRAGMA index_list(it_assets)',
      )) as Array<{ name: string; unique: number }>;
      const indexNames = indexes.map((index) => index.name);
      expect(indexNames).toContain('idx_it_assets_asset_number');
      expect(indexNames).toContain('idx_it_assets_type');
      expect(indexNames).toContain('idx_it_assets_status');
      expect(indexNames).toContain('idx_it_assets_current_employee_id');
      const unique = indexes.find(
        (index) => index.name === 'idx_it_assets_asset_number',
      );
      expect(unique?.unique).toBe(1);
    } finally {
      await database.destroy();
    }
  });

  it('creates the expected columns on it_asset_records', async () => {
    const { database, knex } = await createTestDatabase();
    try {
      const info = (await knex.raw(
        'PRAGMA table_info(it_asset_records)',
      )) as Array<{ name: string; notnull: number }>;
      const columns = new Map(info.map((column) => [column.name, column]));
      expect(columns.get('asset_id')?.notnull).toBe(1);
      expect(columns.get('employee_id')?.notnull).toBe(1);
      expect(columns.get('claimed_at')?.notnull).toBe(1);
      expect(columns.get('returned_at')?.notnull).toBe(0);
      expect(columns.get('status')?.notnull).toBe(1);
    } finally {
      await database.destroy();
    }
  });

  it('reverses the schema on down', async () => {
    const { database } = await createTestDatabase();
    try {
      const context = createMigrationContext(database.connection());
      await migration.down?.(context);
      const names = await tableNames(database);
      expect(names).not.toContain('it_asset_records');
      expect(names).not.toContain('it_assets');
      expect(names).not.toContain('it_employees');
    } finally {
      await database.destroy();
    }
  });
});
