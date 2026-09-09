import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createAppMigrator,
  createAppSeeder,
} from '@nocobase/app-server/database';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);
const seedsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/seeds',
);

describe('team todos seed', () => {
  let database: DatabaseManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'team-todos-seed-'));
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

    await createAppMigrator({
      database,
      config: {
        directory: migrationsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    }).latest();
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createSeeder() {
    return createAppSeeder({
      database,
      config: {
        directory: seedsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    });
  }

  async function countTodos(): Promise<number> {
    const row = await database
      .query()
      .selectFrom('teamTodos')
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  it('seeds six todos covering every status and priority', async () => {
    const result = await createSeeder().run();
    expect(result.status).toBe('completed');
    expect(result.executed).toContain('202609090002_seed_team_todos');
    expect(await countTodos()).toBe(6);

    const rows = await database
      .query()
      .selectFrom('teamTodos')
      .selectAll()
      .execute();
    const statuses = new Set(rows.map((row) => String(row.status)));
    const priorities = new Set(rows.map((row) => String(row.priority)));
    expect(statuses).toEqual(new Set(['pending', 'inProgress', 'completed']));
    expect(priorities).toEqual(new Set(['normal', 'urgent']));

    for (const status of statuses) {
      const count = rows.filter((row) => row.status === status).length;
      expect(count).toBe(2);
    }
  });

  it('is idempotent: a second run inserts nothing new', async () => {
    await createSeeder().run();
    const result = await createSeeder().run();
    expect(result.status).toBe('completed');
    expect(await countTodos()).toBe(6);
  });

  it('does not duplicate records that already exist with the same titles', async () => {
    await createSeeder().run();

    // Remove two records and clear the seed history so the seeder re-runs;
    // the title-existence guard must still prevent duplicates.
    await database
      .query()
      .deleteFrom('teamTodos')
      .where('id', '=', 1)
      .execute();
    await database
      .query()
      .deleteFrom('teamTodos')
      .where('id', '=', 2)
      .execute();
    await database
      .query()
      .deleteFrom('__nocobase_seeds')
      .where('name', '=', '202609090002_seed_team_todos')
      .execute();

    const result = await createSeeder().run();
    expect(result.status).toBe('completed');
    expect(await countTodos()).toBe(6);
  });
});
