import path from 'node:path';

import type { DatabaseManager } from '@nocobase/db';
import { createAppPaths } from '@nocobase/app-server/config';
import { createAppDatabaseManager } from '@nocobase/app-server/database';
import { sqliteDriver } from '@nocobase/db-sqlite';

/**
 * Shared setup for the equipment tests. Kept in one module rather than copied
 * into each test file because the point of every copy is the same thing: an
 * empty, real SQLite database built by the application's own migrations.
 *
 * The database is real — a real driver, real DDL, real rows — but lives in
 * process memory, so a test run leaves nothing behind and needs no server.
 */
export const APPLICATION_ROOT = process.cwd();
export const MIGRATIONS_DIRECTORY = path.join(
  APPLICATION_ROOT,
  'database/main/migrations',
);
export const SEEDS_DIRECTORY = path.join(
  APPLICATION_ROOT,
  'database/main/seeds',
);
const PACKAGE_NAME = 'nb3-factory';

/** Creates an empty in-memory connection to the managed `main` connection. */
export function createTestDatabase(): DatabaseManager {
  return createAppDatabaseManager(
    {
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          schemaManagement: 'managed',
        },
      },
    },
    createAppPaths({ rootDir: APPLICATION_ROOT }),
    { sqlite: sqliteDriver },
  );
}

/** Applies every migration that ships with the application. */
export async function applyMigrations(
  database: DatabaseManager,
): Promise<void> {
  const migrator = database.createMigrator({
    directory: MIGRATIONS_DIRECTORY,
    packageName: PACKAGE_NAME,
  });
  await migrator.latest();
}

/**
 * Runs the application's seeds. `tableName` selects the history table, so a
 * second, separate history forces the seed bodies to run again over data that
 * already exists — which is how the tests check that a repeat run is harmless.
 */
export async function runSeeds(
  database: DatabaseManager,
  options: { tableName?: string } = {},
): Promise<void> {
  const seeder = database.createSeeder({
    directory: SEEDS_DIRECTORY,
    packageName: PACKAGE_NAME,
    ...options,
  });
  await seeder.run();
}
