import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationDefinition,
} from '@nocobase/db';

import retailMigration from '../../database/main/migrations/202609140001_create_retail_tables.js';

/**
 * Builds the context a migrator would pass to `up`/`down`.
 *
 * The retail migration is applied directly rather than through the whole migrations directory:
 * that directory also holds a compatibility migration for a plugin table, which cannot run
 * without the plugin's own migration.
 */
export async function migrationContext(
  manager: DatabaseManager,
): Promise<never> {
  const connection = manager.connection();
  return {
    builder: connection.builder,
    query: connection.query,
    connection: {
      name: connection.name,
      driver: connection.driver,
      dialect: connection.dialect,
      capabilities: connection.capabilities,
      client: () => connection.client(),
    },
  } as never;
}

export function createInMemoryManager(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
    metadataStore: new InMemoryCollectionMetadataStore(),
  });
}

export async function applyMigration(
  manager: DatabaseManager,
  migration: MigrationDefinition,
): Promise<void> {
  await migration.up(await migrationContext(manager));
}

/** Builds a real in-memory SQLite database with the retail schema applied. */
export async function createRetailTestDatabase(): Promise<DatabaseManager> {
  const manager = createInMemoryManager();
  await manager.connect();
  await applyMigration(manager, retailMigration);
  return manager;
}
