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
import {
  ProductError,
  ProductsService,
  type ProductsServiceDependencies,
} from '../server/providers/products.js';

const TIMESTAMP = '2026-09-13T00:00:00.000';

describe('ProductsService', () => {
  let manager: DatabaseManager;
  let directory: string;
  let deletedKeys: string[];
  let service: ProductsService;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'products-service-'));
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
    for (const migration of [
      createImageFiles,
      createProducts,
      createImages,
    ] as readonly {
      up: MigrationDefinition['up'];
    }[]) {
      await migration.up({ builder: manager.builder('main') } as never);
    }

    deletedKeys = [];
    const files = {
      getUrl: (record: { id: string; ext: string }) =>
        `/uploads/product-images/${record.id}${record.ext ? `.${record.ext}` : ''}`,
    };
    const drive = {
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- mirrors the drive manager API
      use: () => ({
        delete: async (key: string) => {
          deletedKeys.push(key);
        },
      }),
    };
    service = new ProductsService({
      query: manager.query('main'),
      transaction: (fn) => manager.transaction(fn),
      files,
      drive,
      urlFor: (record) => `/main${files.getUrl(record)}`,
    } as unknown as ProductsServiceDependencies);
  });

  afterEach(async () => {
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function insertFile(id: string, filename: string): Promise<void> {
    await manager
      .query('main')
      .insertInto('productImageFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.png`,
        filename,
        ext: 'png',
        mimeType: 'image/png',
        size: 100,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      })
      .execute();
  }

  it('creates a product and keeps the submitted image order', async () => {
    await insertFile('file-a', 'a.png');
    await insertFile('file-b', 'b.png');

    const created = await service.create({
      name: '  Demo product  ',
      description: '  A demo  ',
      imageFileIds: ['file-b', 'file-a'],
    });

    expect(created.name).toBe('Demo product');
    expect(created.description).toBe('A demo');
    expect(created.images.map((image) => image.id)).toEqual([
      'file-b',
      'file-a',
    ]);
    // The first image carries a usable content URL for the list thumbnail.
    expect(created.images[0]?.contentUrl).toBe(
      '/main/uploads/product-images/file-b.png',
    );
  });

  it('rejects an unknown image without persisting the product', async () => {
    await expect(
      service.create({ name: 'Broken', imageFileIds: ['missing'] }),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMAGE_NOT_FOUND' });

    const rows = await manager.query('main').selectFrom('products').execute();
    expect(rows).toHaveLength(0);
  });

  it('rejects an image already linked to another product', async () => {
    await insertFile('file-a', 'a.png');
    await service.create({ name: 'Owner', imageFileIds: ['file-a'] });

    await expect(
      service.create({ name: 'Other', imageFileIds: ['file-a'] }),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMAGE_IN_USE' });
  });

  it('requires a product name', async () => {
    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(
      ProductError,
    );
  });

  it('drops removed images and deletes their records and objects', async () => {
    await insertFile('file-a', 'a.png');
    await insertFile('file-b', 'b.png');
    const created = await service.create({
      name: 'Two images',
      imageFileIds: ['file-a', 'file-b'],
    });

    const updated = await service.update(created.id, {
      name: 'One image',
      imageFileIds: ['file-b'],
    });

    expect(updated.images.map((image) => image.id)).toEqual(['file-b']);
    const remaining = await manager
      .query('main')
      .selectFrom('productImageFiles')
      .select(['id'])
      .execute();
    expect(remaining.map((row) => row.id)).toEqual(['file-b']);
    expect(deletedKeys).toEqual(['objects/file-a.png']);
  });

  it('lists products with their images', async () => {
    await insertFile('file-a', 'a.png');
    await service.create({ name: 'First', imageFileIds: ['file-a'] });
    await service.create({ name: 'Second' });

    const products = await service.list();
    expect(products.map((product) => product.name)).toEqual([
      'First',
      'Second',
    ]);
    expect(products[0]?.images).toHaveLength(1);
    expect(products[1]?.images).toHaveLength(0);
  });

  it('reports a missing product on get', async () => {
    await expect(service.get(999)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });
});
