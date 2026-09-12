import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import seedDefinition, {
  contractSeedRows,
  extractDriveLocation,
  resolveDriveLocalObjectsDir,
} from '../database/main/seeds/202609090004_seed_contracts.js';
import type { SeedDefinition } from '@nocobase/db';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

describe('contract seed disk-root helpers', () => {
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

  it('parses a JSON-form drive.location from a config fragment', () => {
    expect(
      extractDriveLocation(
        'database:\n  dialect: sqlite\ndrive: { "default": "local", "disks": { "local": { "location": "/data/store" } } }\n',
      ),
    ).toBe('/data/store');
  });

  it('parses a block-style default disk location', () => {
    expect(
      extractDriveLocation(
        'drive:\n  default: local\n  disks:\n    local:\n      location: /custom/objects\n',
      ),
    ).toBe('/custom/objects');
  });

  it('returns undefined for config text without a drive section', () => {
    expect(extractDriveLocation('port: 3000\n')).toBeUndefined();
    expect(extractDriveLocation('')).toBeUndefined();
  });
});

describe('contract seed', () => {
  let manager: DatabaseManager;
  let directory: string;
  let previousConfigFile: string | undefined;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-seed-'));
    previousConfigFile = process.env.APP_CONFIG_FILE;
    // Keep the seed from reading the workspace config if one appears later.
    process.env.APP_CONFIG_FILE = path.join(directory, 'no-such-config.yml');
    fs.mkdirSync(path.join(directory, 'storage'), { recursive: true });
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(directory, 'storage', 'database.sqlite'),
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

  it('is re-runnable: a second run adds no rows and no extra objects', async () => {
    await runSeed();

    const contracts = await count('contracts');
    const files = await count('contractFiles');
    const links = await count('contractAttachments');
    expect(contracts).toBe(contractSeedRows().length);
    expect(files).toBeGreaterThanOrEqual(links);

    const objectsDir = path.join(directory, 'storage', 'objects');
    const before = fs.readdirSync(objectsDir).sort();

    await runSeed(); // idempotent second run

    expect(await count('contracts')).toBe(contracts);
    expect(await count('contractFiles')).toBe(files);
    expect(await count('contractAttachments')).toBe(links);
    expect(fs.readdirSync(objectsDir).sort()).toEqual(before);
  });

  it('writes real deterministic attachment bytes for every seeded file link', async () => {
    await runSeed();

    const query = manager.query('main');
    const attachmentRows = await query
      .selectFrom('contractAttachments')
      .select(['contractId', 'fileId'])
      .orderBy('contractId', 'asc')
      .execute();
    expect(attachmentRows).toHaveLength(6);

    for (const row of attachmentRows) {
      const link = row as { contractId: number; fileId: string };
      const file = await query
        .selectFrom('contractFiles')
        .selectAll()
        .where('id', '=', link.fileId)
        .executeTakeFirst();
      expect(file, `file ${link.fileId} exists`).toBeDefined();
      const objectPath = path.join(
        directory,
        'storage',
        String((file as { key: string }).key),
      );
      const bytes = fs.readFileSync(objectPath);
      expect(bytes.length).toBeGreaterThan(10);
      expect(bytes.toString('utf8').trim().length).toBeGreaterThan(0);
    }
  });

  it('stores contracts across every status in camelCase logical columns', async () => {
    await runSeed();
    const rows = await manager
      .query('main')
      .selectFrom('contracts')
      .selectAll()
      .orderBy('contractNo', 'asc')
      .execute();
    const statuses = new Set(
      rows.map((row) => (row as { status: string }).status),
    );
    expect(statuses).toEqual(
      new Set(['active', 'draft', 'expired', 'terminated']),
    );
    for (const row of rows) {
      const contract = row as { contractNo: string; amount: number };
      expect(typeof contract.contractNo).toBe('string');
      expect(contract.amount).toBeGreaterThan(0);
    }
  });
});
