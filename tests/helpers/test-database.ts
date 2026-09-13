import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

export const MIGRATIONS_DIRECTORY = join(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

export interface TestDatabase {
  readonly directory: string;
  readonly filename: string;
  readonly manager: DatabaseManager;
  dispose(): Promise<void>;
}

/** Creates an isolated on-disk SQLite database for a single test file. */
export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'expense-claims-'));
  const filename = join(directory, 'test.sqlite');
  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', driver: 'better-sqlite3', filename },
    },
  });

  return {
    directory,
    filename,
    manager,
    async dispose() {
      await manager.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Applies this application's own migrations to the test connection. */
export async function migrate(
  manager: DatabaseManager,
): Promise<readonly string[]> {
  const migrator = manager.createMigrator({
    directory: MIGRATIONS_DIRECTORY,
    packageName: 'nb3-factory-test',
    connection: 'main',
  });
  const result = await migrator.latest();
  return result.executed;
}

/** Minimal shape of the underlying Knex client used for schema inspection. */
export interface SchemaClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}
