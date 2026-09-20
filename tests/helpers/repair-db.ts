// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type Migrator,
} from '@nocobase/db';
import sqlite, { type SqliteConnectionConfig } from '@nocobase/db-sqlite';

const MIGRATIONS_DIRECTORY = path.resolve('database/main/migrations');

export interface RepairTestDatabase {
  readonly manager: DatabaseManager;
  readonly migrator: Migrator;
  readonly root: string;
  readonly cleanup: () => Promise<void>;
}

/**
 * A real SQLite database with this application's migrations applied.
 *
 * Tests exercise the production migration and the production service against it; nothing is mocked.
 */
export async function createRepairTestDatabase(): Promise<RepairTestDatabase> {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'repair-db-'));
  const manager = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(root, 'database.sqlite'),
      },
    },
  } as Parameters<typeof createDatabaseManager>[0] & {
    drivers: Record<string, unknown>;
  });
  const migrator = manager.createMigrator({
    directory: MIGRATIONS_DIRECTORY,
    packageName: 'property-repair-test',
  });
  await migrator.latest();
  return {
    manager,
    migrator,
    root,
    cleanup: async () => {
      await manager.destroy();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export type RepairConnectionConfig = SqliteConnectionConfig;
