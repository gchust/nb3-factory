import type { Knex } from 'knex';
import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/db';

import assetMigration from '../../database/migrations/202609010001_create_it_asset_tables.js';
import assetSeed from '../../database/seeds/202609010002_seed_it_asset_data.js';

export interface TestDatabase {
  database: DatabaseManager;
  knex: Knex;
}

/**
 * Creates an in-memory SQLite database with the authentication tables and the
 * IT asset schema applied. Pass `{ seed: true }` to also load the sample data.
 */
export async function createTestDatabase(
  options: { seed?: boolean } = {},
): Promise<TestDatabase> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  await database.connect();
  const context = createMigrationContext(database.connection());
  await assetMigration.up(context);
  if (options.seed) {
    await assetSeed.run(context);
  }
  const knex = await database.connection().client<Knex>();
  return { database, knex };
}
