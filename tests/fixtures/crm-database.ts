import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

import migration from '../../database/main/migrations/20260928000001_create_crm_collections.js';
import seed from '../../database/main/seeds/20260928000002_seed_crm_sample_data.js';

/**
 * Shared support for the CRM tests: a real SQLite file, the migration context a
 * migration receiver gets, and the seed context a seed receives.
 *
 * The CRM code runs against a real database, so these tests exercise it the
 * same way: through the builder they call and the rows the repository stores.
 */

export interface CrmTestDatabase {
  readonly manager: DatabaseManager;
  readonly migrationContext: MigrationContext;
  seedContext(): SeedContext;
  dispose(): Promise<void>;
}

export async function createCrmTestDatabase(): Promise<CrmTestDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), 'crm-test-'));
  const manager = createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
      },
    },
  });
  const connection = await manager.connect();
  return {
    manager,
    migrationContext: {
      config: {},
      container: {},
      builder: manager.builder(),
      query: manager.query(),
      repository: (name: string) => manager.repository(name),
      connection,
    } as unknown as MigrationContext,
    seedContext: () =>
      ({
        config: {},
        container: {},
        repository: (name: string) => manager.repository(name),
        query: manager.query(),
        connection,
      }) as unknown as SeedContext,
    async dispose() {
      await manager.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** A connected, migrated database ready for CRM service or route tests. */
export async function createMigratedDatabase(): Promise<CrmTestDatabase> {
  const database = await createCrmTestDatabase();
  await migration.up(database.migrationContext);
  return database;
}

/** A connected, migrated and seeded database carrying the sample data. */
export async function createSeededDatabase(): Promise<CrmTestDatabase> {
  const database = await createMigratedDatabase();
  await seed.run(database.seedContext());
  return database;
}
