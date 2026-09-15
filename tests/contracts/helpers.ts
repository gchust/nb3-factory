import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

const MIGRATIONS = path.resolve(process.cwd(), 'database/main/migrations');
const SEEDS = path.resolve(process.cwd(), 'database/main/seeds');

export interface TestDatabase {
  readonly database: DatabaseManager;
  readonly directory: string;
  readonly connection: ReturnType<DatabaseManager['connection']>;
  close(): Promise<void>;
}

/**
 * A real SQLite database per test.
 *
 * The migrations and seeds under test need actual schema — a test that only imports the module proves nothing about
 * the tables it produces.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), 'contracts-test-'));
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'test.sqlite'),
      },
    },
  });
  const connection = database.connection('main');
  await connection.connect();
  return {
    database,
    directory,
    connection,
    async close() {
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function contractMigrator(database: DatabaseManager) {
  return database.createMigrator({
    directory: MIGRATIONS,
    packageName: 'test-app',
    connection: 'main',
  });
}

export function contractSeeder(database: DatabaseManager) {
  return database.createSeeder({
    directory: SEEDS,
    packageName: 'test-app',
    connection: 'main',
  });
}
