import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
  type MigrationContext,
  type MigrationDefinition,
  type QueryAdapter,
} from '@nocobase/db';

import migration from '../../database/main/migrations/202609100001_create_recruiting_tables.js';

const definition = migration as MigrationDefinition;

interface KnexClient {
  raw(sql: string, bindings?: readonly unknown[]): Promise<unknown>;
}

/** Runs a raw SQL statement through the connection's Knex client and returns the rows it produced. */
export async function rawRows(
  connection: DatabaseConnection,
  sql: string,
  bindings?: readonly unknown[],
): Promise<Record<string, unknown>[]> {
  const client = await connection.client<KnexClient>();
  const result = await client.raw(sql, bindings);
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray(Reflect.get(result, 'rows'))
  ) {
    return Reflect.get(result, 'rows') as Record<string, unknown>[];
  }
  return [];
}

export interface RecruitingTestDatabase {
  database: DatabaseManager;
  connection: DatabaseConnection;
  query: QueryAdapter;
  /** Runs the migration's `down` without tearing the connection down, so the schema can be inspected after. */
  rollback: () => Promise<void>;
  teardown: () => Promise<void>;
}

/**
 * Brings up a real, isolated SQLite database with the recruiting schema applied by running the actual migration
 * definition. Tests then exercise the service against the same physical schema the application uses.
 */
export async function createRecruitingTestDatabase(): Promise<RecruitingTestDatabase> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });

  const connection = await database.connection('main').connect();
  const context: MigrationContext = {
    builder: connection.builder,
    query: connection.query,
    connection: {
      name: 'main',
      driver: 'better-sqlite3',
      dialect: 'sqlite',
      capabilities: connection.capabilities,
      client: () => connection.client<unknown>(),
    },
  };

  await definition.up(context);

  // The application reads interviewer display names from the users table owned by the authentication plugin.
  // Tests only need those columns, so a minimal stand-in keeps the schema dependency explicit.
  await rawRows(
    connection,
    'create table if not exists user (id text primary key, name text, email text, username text)',
  );

  return {
    database,
    connection,
    query: connection.query,
    rollback: async () => {
      await definition.down?.(context);
    },
    teardown: async () => {
      await database.destroy();
    },
  };
}
