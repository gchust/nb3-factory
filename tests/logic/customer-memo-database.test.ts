// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import type { MigrationContext, SeedContext } from '@nocobase/db';

import migration from '../../database/main/migrations/202609020001_create_customer_memos.js';
import seed from '../../database/main/seeds/202609030001_seed_customer_memos.js';
import {
  createTestDatabase,
  type TestDatabase,
} from './support/customer-memo-database.js';

/**
 * The migration only reads `builder`, and the seed only reads `repository`, so
 * the test hands each one exactly those from the real connection. The manager
 * still owns the connection, schema and naming strategy, which is what makes
 * this a real database test rather than a builder mock.
 */
function migrationContext(db: TestDatabase): MigrationContext {
  return { builder: db.connection.builder } as unknown as MigrationContext;
}

function seedContext(db: TestDatabase): SeedContext {
  return {
    repository: (collection: string) => db.connection.repository(collection),
  } as unknown as SeedContext;
}

describe('customer memos schema and seed', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.dispose();
  });

  it('creates the table with the required fields and drops it again', async () => {
    const knex = await db.connection.client<Knex>();

    expect(await knex.schema.hasTable('customer_memos')).toBe(false);

    await migration.up(migrationContext(db));

    expect(await knex.schema.hasTable('customer_memos')).toBe(true);
    const columns = await knex('customer_memos').columnInfo();
    expect(Object.keys(columns).sort()).toEqual([
      'created_at',
      'id',
      'name',
      'notes',
    ]);
    expect(columns.name.nullable).toBe(false);
    expect(columns.created_at.nullable).toBe(false);
    expect(columns.notes.nullable).toBe(true);

    // The name is a real database requirement, not only a form rule.
    await expect(
      knex('customer_memos').insert({ name: null, created_at: new Date() }),
    ).rejects.toThrow();

    await migration.down(migrationContext(db));

    expect(await knex.schema.hasTable('customer_memos')).toBe(false);
  });

  it('seeds three sample records without duplicating them when run again', async () => {
    await migration.up(migrationContext(db));
    const repository = db.connection.repository('customerMemos');

    await seed.run(seedContext(db));
    expect(await repository.count()).toBe(3);

    // The seed's own existence guard, not the seeder's history, is what keeps a
    // second call from adding a second copy of every sample.
    await seed.run(seedContext(db));
    expect(await repository.count()).toBe(3);
  });
});
