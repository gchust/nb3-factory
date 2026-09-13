import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import seedDefinition, {
  extractDriveLocation,
  productSeedRows,
  resolveDriveLocalObjectsDir,
} from '../database/main/seeds/202609130004_seed_products.js';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe('product seed disk-root helpers', () => {
  it('puts a storage-named database into the storage directory itself', () => {
    expect(resolveDriveLocalObjectsDir('/app/storage/database.sqlite')).toBe(
      '/app/storage',
    );
  });

  it('falls back to storage/private for databases anywhere else', () => {
    expect(resolveDriveLocalObjectsDir('/app/data/database.sqlite')).toBe(
      '/app/data/storage/private',
    );
  });

  it('parses an inline JSON drive section', () => {
    expect(
      extractDriveLocation(
        'database: {}\ndrive: {"default":"local","disks":{"local":{"driver":"fs","location":"/data/objects"}}}\n',
      ),
    ).toBe('/data/objects');
  });

  it('parses a block-style drive section', () => {
    expect(
      extractDriveLocation(
        'drive:\n  default: local\n  disks:\n    local:\n      location: /custom/objects\n',
      ),
    ).toBe('/custom/objects');
    expect(extractDriveLocation('port: 3000\n')).toBeUndefined();
  });
});

describe('product seed', () => {
  let manager: DatabaseManager;
  let directory: string;
  let previousConfigFile: string | undefined;
  let objectsDir: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'products-seed-'));
    previousConfigFile = process.env.APP_CONFIG_FILE;
    objectsDir = path.join(directory, 'storage', 'private');
    const configFile = path.join(directory, 'verify.yml');
    fs.writeFileSync(
      configFile,
      `drive: ${JSON.stringify({
        default: 'local',
        disks: { local: { driver: 'fs', location: objectsDir } },
      })}\n`,
    );
    process.env.APP_CONFIG_FILE = configFile;

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
    await manager
      .createMigrator({ directory: MIGRATIONS_DIR, packageName: 'app' })
      .latest();
  });

  afterEach(async () => {
    if (previousConfigFile === undefined) {
      delete process.env.APP_CONFIG_FILE;
    } else {
      process.env.APP_CONFIG_FILE = previousConfigFile;
    }
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function runSeed(): Promise<void> {
    const context = {
      query: manager.query('main'),
      connection: manager.connection(
        'main',
      ) as unknown as SeedContext['connection'],
    } satisfies SeedContext;
    return (seedDefinition as SeedDefinition).run(context);
  }

  async function count(table: string): Promise<number> {
    const rows = await manager
      .query('main')
      .selectFrom(table as never)
      .selectAll()
      .execute();
    return rows.length;
  }

  it('writes rows, links and real PNG objects into the configured disk', async () => {
    await runSeed();

    expect(await count('products')).toBe(productSeedRows().length);
    const files = await count('productImageFiles');
    expect(files).toBe(
      productSeedRows().reduce((total, row) => total + row.images.length, 0),
    );
    expect(await count('productImages')).toBe(files);

    const objects = fs.readdirSync(path.join(objectsDir, 'objects'));
    expect(objects.sort()).toEqual(
      productSeedRows()
        .flatMap((row) => row.images.map((image) => `${image.fileId}.png`))
        .sort(),
    );
    for (const object of objects) {
      const bytes = fs.readFileSync(path.join(objectsDir, 'objects', object));
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    }
  });

  it('is re-runnable: a second run adds no rows and no extra objects', async () => {
    await runSeed();
    const before = {
      products: await count('products'),
      files: await count('productImageFiles'),
      links: await count('productImages'),
      objects: fs.readdirSync(path.join(objectsDir, 'objects')).sort(),
    };

    await runSeed();

    expect(await count('products')).toBe(before.products);
    expect(await count('productImageFiles')).toBe(before.files);
    expect(await count('productImages')).toBe(before.links);
    expect(fs.readdirSync(path.join(objectsDir, 'objects')).sort()).toEqual(
      before.objects,
    );
  });

  it('preserves upload order so the first image is the thumbnail', async () => {
    await runSeed();
    const links = await manager
      .query('main')
      .selectFrom('productImages')
      .select(['productId', 'fileId', 'sort'])
      .orderBy('sort', 'asc')
      .execute();
    const firstProduct = links.filter((link) => Number(link.productId) === 1);
    expect(firstProduct.map((link) => link.sort)).toEqual([0, 1]);
  });
});
