import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609140001_create_access_counters.js';
import seed from '../../database/main/seeds/202609140002_seed_access_counter_home.js';
import {
  createAccessCounterService,
  HOME_COUNTER_KEY,
} from '../../server/providers/access-counter.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('access counter schema', () => {
  let test: TestDatabase;

  beforeEach(async () => {
    test = await createTestDatabase();
  });

  afterEach(async () => {
    await test.destroy();
  });

  it('creates and drops the access_counters table through the migration', async () => {
    const client = await test.connection.client<Knex>();

    await migration.up(test.migrationContext);
    expect(await client.schema.hasTable('access_counters')).toBe(true);

    await migration.down(test.migrationContext);
    expect(await client.schema.hasTable('access_counters')).toBe(false);
  });

  it('stores a count defaulting to zero and enforces a unique key', async () => {
    await migration.up(test.migrationContext);
    const query = test.database.query();

    await query
      .insertInto('accessCounters')
      .values({ key: 'default-check' })
      .execute();
    const row = await query
      .selectFrom('accessCounters')
      .select('count')
      .where('key', '=', 'default-check')
      .executeTakeFirst<{ count: number }>();
    expect(Number(row?.count)).toBe(0);

    await query
      .insertInto('accessCounters')
      .values({ key: 'duplicate-check', count: 1 })
      .execute();
    await expect(
      query
        .insertInto('accessCounters')
        .values({ key: 'duplicate-check', count: 2 })
        .execute(),
    ).rejects.toThrow();
  });

  it('seeds the home counter once and stays idempotent on a repeat run', async () => {
    await migration.up(test.migrationContext);
    const context = {
      query: test.database.query(),
      connection: test.connection,
    };

    await seed.run(context);
    await seed.run(context);

    const rows = await test.database
      .query()
      .selectFrom('accessCounters')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(HOME_COUNTER_KEY);
    expect(Number(rows[0].count)).toBe(0);
  });
});

describe('access counter service', () => {
  let test: TestDatabase;

  beforeEach(async () => {
    test = await createTestDatabase();
    await migration.up(test.migrationContext);
  });

  afterEach(async () => {
    await test.destroy();
  });

  it('increments from zero and persists across service instances', async () => {
    const first = createAccessCounterService(test.database);
    expect(await first.read(HOME_COUNTER_KEY)).toBe(0);
    expect(await first.increment(HOME_COUNTER_KEY)).toBe(1);

    // A second instance stands in for another browser context reading the same database.
    const second = createAccessCounterService(test.database);
    expect(await second.read(HOME_COUNTER_KEY)).toBe(1);
    expect(await second.increment(HOME_COUNTER_KEY)).toBe(2);
    expect(await first.read(HOME_COUNTER_KEY)).toBe(2);
  });

  it('creates the counter row on first increment when no seed has run', async () => {
    const service = createAccessCounterService(test.database);
    expect(await service.increment(HOME_COUNTER_KEY)).toBe(1);
    expect(await service.read(HOME_COUNTER_KEY)).toBe(1);
  });
});
