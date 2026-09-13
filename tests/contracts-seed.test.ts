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
  contractSeedRows,
} from '../database/main/seeds/202609130003_seed_contracts.js';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

describe('contract seed', () => {
  let manager: DatabaseManager;
  let directory: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-seed-'));
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

  async function rows(): Promise<
    {
      readonly name: string;
      readonly category: string;
      readonly attachmentId: string | null;
    }[]
  > {
    return (await manager
      .query('main')
      .selectFrom('contracts')
      .selectAll()
      .orderBy('id', 'asc')
      .execute()) as never;
  }

  it('inserts one representative contract per category', async () => {
    await runSeed();
    const seeded = await rows();
    expect(seeded).toHaveLength(contractSeedRows().length);
    expect(new Set(seeded.map((row) => row.category))).toEqual(
      new Set(['procurement', 'sales', 'service']),
    );
    for (const row of seeded) {
      expect(row.attachmentId).toBeNull();
    }
  });

  it('is idempotent: a second run adds no rows', async () => {
    await runSeed();
    const before = await rows();
    await runSeed();
    const after = await rows();
    expect(after).toEqual(before);
  });

  it('does not duplicate a contract a user created with the same name', async () => {
    const [first] = contractSeedRows();
    await manager
      .query('main')
      .insertInto('contracts')
      .values({
        name: first!.name,
        counterparty: '用户自己创建的公司',
        category: 'service',
        attachmentId: null,
        createdAt: '2026-09-13T10:00:00.000',
        updatedAt: '2026-09-13T10:00:00.000',
      })
      .execute();

    await runSeed();
    const seeded = await rows();
    const sameName = seeded.filter((row) => row.name === first!.name);
    expect(sameName).toHaveLength(1);
    // The pre-existing row is preserved untouched.
    expect(seeded.find((row) => row.name === first!.name)?.category).toBe(
      'service',
    );
  });
});
