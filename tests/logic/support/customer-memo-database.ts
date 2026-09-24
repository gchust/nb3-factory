// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';

export interface TestDatabase {
  readonly database: DatabaseManager;
  readonly connection: DatabaseConnection;
  /** Tears the pools down and removes the temporary directory. */
  dispose(): Promise<void>;
}

/**
 * A real sqlite database in a throwaway directory.
 *
 * The customer memo feature has no meaning without a database, so its tests
 * exercise the migration, the seed and the service against one rather than
 * against a mock. Each test gets its own file so migrations never leak between
 * them, and the whole directory is removed on `dispose`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), 'customer-memos-'));
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
      }),
    },
  });
  const connection = await database.connect('main');
  return {
    database,
    connection,
    async dispose() {
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
