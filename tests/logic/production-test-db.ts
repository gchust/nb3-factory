import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';

import productionMigration from '../../database/main/migrations/202609140001_create_production_quality_tables.js';

export interface TestDatabase {
  readonly manager: DatabaseManager;
  readonly connection: DatabaseConnection;
}

/** Fresh in-memory SQLite database with the production/quality schema applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const manager = createDatabaseManager({
    default: 'test',
    connections: {
      test: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  const connection = await manager.connect('test');
  await applyMigration(connection);
  return { manager, connection };
}

export async function applyMigration(
  connection: DatabaseConnection,
): Promise<void> {
  await productionMigration.up({
    builder: connection.builder,
    query: connection.query,
    connection: connection as never,
  });
}

export async function rollbackMigration(
  connection: DatabaseConnection,
): Promise<void> {
  await productionMigration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection: connection as never,
  });
}

export async function hasTable(
  connection: DatabaseConnection,
  table: string,
): Promise<boolean> {
  const client = await connection.client<{
    schema: { hasTable: (name: string) => Promise<boolean> };
  }>();
  return client.schema.hasTable(table);
}
