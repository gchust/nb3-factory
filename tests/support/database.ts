import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  createDatabaseManager,
  defineDatabase,
  type DatabaseManager,
} from '@nocobase/db';

// Vitest runs with the application root as the working directory.
const databaseRoot = resolve(process.cwd(), 'database', 'main');

export const migrationsDirectory = join(databaseRoot, 'migrations');
export const seedsDirectory = join(databaseRoot, 'seeds');

export interface TestDatabase {
  readonly database: DatabaseManager;
  migrate(): Promise<void>;
  rollback(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * A real, throwaway SQLite database with this application's migrations available. A test that only imported the
 * migration file would prove nothing about the schema it produces, so every test here runs against this.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'announcements-test-'));
  const database = createDatabaseManager(
    defineDatabase({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: join(directory, 'test.sqlite') },
      },
    }),
  );

  return {
    database,
    async migrate() {
      await database
        .createMigrator({
          directory: migrationsDirectory,
          packageName: 'app',
        })
        .latest();
    },
    async rollback() {
      await database
        .createMigrator({
          directory: migrationsDirectory,
          packageName: 'app',
        })
        .rollback();
    },
    async cleanup() {
      await database.destroy();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export async function tableExists(
  database: DatabaseManager,
  table: string,
): Promise<boolean> {
  const connection = await database.connect();
  const client = await connection.client<TableSchemaClient>();
  return client.schema.hasTable(table);
}
