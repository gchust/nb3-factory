import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';

export interface TestDatabase {
  readonly database: DatabaseManager;
  readonly connection: DatabaseConnection;
  /** The context a migration's `up`/`down` receives, backed by this real database. */
  readonly migrationContext: MigrationContext;
  destroy(): Promise<void>;
}

/**
 * A real in-memory SQLite database with the application's naming strategy.
 *
 * Schema behavior is only meaningful against a database that actually applies it, so migration and service tests run
 * here rather than against a mock.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const database = createDatabaseManager({
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  const connection = await database.connect('main');

  return {
    database,
    connection,
    migrationContext: {
      builder: database.builder(),
      query: database.query(),
      connection,
    },
    destroy: () => database.destroy(),
  };
}
