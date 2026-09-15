// @vitest-environment node
import {
  InMemoryCollectionMetadataStore,
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609140001_create_media_library.js';

describe('media library migration', () => {
  let manager: DatabaseManager;

  beforeEach(async () => {
    manager = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
      metadataStore: new InMemoryCollectionMetadataStore(),
    });
    await manager.connect('main');
  });

  afterEach(async () => {
    await manager.destroy();
  });

  async function run(direction: 'up' | 'down'): Promise<void> {
    const connection = manager.connection('main');
    await migration[direction]({
      builder: manager.builder('main'),
      query: manager.query('main'),
      connection,
    });
  }

  async function tables(): Promise<string[]> {
    const inspector = manager.connection('main').schemaInspector;
    const page = await inspector.listPhysicalCollections();
    return page.items.map((item) => item.tableName);
  }

  it('creates both collections with the schema the feature depends on', async () => {
    await run('up');
    const names = await tables();
    expect(names).toContain('media_files');
    expect(names).toContain('media_assets');

    const inspector = manager.connection('main').schemaInspector;
    const files = await inspector.getPhysicalCollection({
      tableName: 'media_files',
    });
    expect(files).toBeDefined();
    const fileColumns = new Map(
      (files?.columns ?? []).map((column) => [column.columnName, column]),
    );
    expect(fileColumns.get('id')?.dataType).toBe('char');
    expect(fileColumns.get('disk')?.nullable).toBe(false);
    expect(fileColumns.get('mime_type')?.dataType).toBe('string');
    expect(fileColumns.get('size')?.dataType).toBe('bigInt');
    expect([...(files?.primaryKey?.columns ?? [])]).toEqual(['id']);

    const assets = await inspector.getPhysicalCollection({
      tableName: 'media_assets',
    });
    expect(assets).toBeDefined();
    const assetColumns = new Map(
      (assets?.columns ?? []).map((column) => [column.columnName, column]),
    );
    for (const name of [
      'id',
      'name',
      'type',
      'tags',
      'status',
      'file_id',
      'filename',
      'mime_type',
      'ext',
      'size',
      'uploader_id',
      'uploader_name',
      'created_at',
      'updated_at',
    ]) {
      expect(
        assetColumns.has(name),
        `media_assets should have a ${name} column`,
      ).toBe(true);
    }
    expect(assetColumns.get('type')?.nullable).toBe(false);
    expect(assetColumns.get('status')?.nullable).toBe(false);
    expect(assetColumns.get('size')?.dataType).toBe('bigInt');
  });

  it('refuses a duplicate file link and a missing value', async () => {
    await run('up');
    const query = manager.query('main');
    const now = new Date();
    const base = {
      name: 'photo',
      type: 'image',
      status: 'available',
      fileId: 'file-1',
      filename: 'photo.png',
      mimeType: 'image/png',
      ext: 'png',
      size: 10,
      createdAt: now,
      updatedAt: now,
    };
    await query.insertInto('mediaAssets').values(base).execute();
    await expect(
      query
        .insertInto('mediaAssets')
        .values({ ...base, fileId: 'file-1' })
        .execute(),
    ).rejects.toBeDefined();
  });

  it('drops both collections on rollback', async () => {
    await run('up');
    await run('down');
    const names = await tables();
    expect(names).not.toContain('media_files');
    expect(names).not.toContain('media_assets');
  });
});
