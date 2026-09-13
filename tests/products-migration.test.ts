import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationDefinition,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createImageFiles from '../database/main/migrations/202609130001_create_product_image_files.js';
import createProducts from '../database/main/migrations/202609130002_create_products.js';
import createImages from '../database/main/migrations/202609130003_create_product_images.js';

const migrations = [
  createImageFiles,
  createProducts,
  createImages,
] as readonly {
  name: string;
  up: MigrationDefinition['up'];
  down: MigrationDefinition['down'];
}[];

describe('product gallery migrations', () => {
  let manager: DatabaseManager;
  let directory: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'products-migration-'));
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

  async function up(): Promise<void> {
    for (const migration of migrations) {
      await migration.up({ builder: manager.builder('main') } as never);
    }
  }

  async function columnNames(collection: string): Promise<string[]> {
    const physical = await manager
      .connection('main')
      .collections.getPhysical(collection);
    return (physical?.columns ?? []).map((column) => column.columnName).sort();
  }

  it('exports a name matching every filename and creates the expected schema', async () => {
    expect(createImageFiles.name).toBe(
      '202609130001_create_product_image_files',
    );
    expect(createProducts.name).toBe('202609130002_create_products');
    expect(createImages.name).toBe('202609130003_create_product_images');

    await up();

    expect(await columnNames('product_image_files')).toEqual([
      'created_at',
      'disk',
      'ext',
      'filename',
      'id',
      'key',
      'mime_type',
      'size',
      'updated_at',
    ]);
    expect(await columnNames('products')).toEqual([
      'created_at',
      'description',
      'id',
      'name',
      'updated_at',
    ]);
    expect(await columnNames('product_images')).toEqual([
      'created_at',
      'file_id',
      'id',
      'product_id',
      'sort',
    ]);
  });

  it('reverses cleanly in dependency order', async () => {
    await up();
    expect(await manager.builder('main').hasCollection('products')).toBe(true);

    for (const migration of [...migrations].reverse()) {
      await migration.down({ builder: manager.builder('main') } as never);
    }

    expect(await manager.builder('main').hasCollection('products')).toBe(false);
    expect(await manager.builder('main').hasCollection('product_images')).toBe(
      false,
    );
    expect(
      await manager.builder('main').hasCollection('product_image_files'),
    ).toBe(false);
  });

  it('enforces the file collection shape the File plugin validates', async () => {
    await up();
    const physical = await manager
      .connection('main')
      .collections.getPhysical('product_image_files');
    const id = physical?.columns?.find((column) => column.columnName === 'id');
    expect(id?.nativeType?.toLowerCase()).toContain('char');
    const size = physical?.columns?.find(
      (column) => column.columnName === 'size',
    );
    expect(['integer', 'bigint']).toContain(
      (size?.nativeType ?? '').toLowerCase(),
    );
  });
});
