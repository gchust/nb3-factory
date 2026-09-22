import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type Migrator,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

import {
  createFieldVisitService,
  type FieldVisitService,
} from '../../server/providers/field-visits.js';

export interface FieldVisitsTestDatabase {
  readonly manager: DatabaseManager;
  readonly migrator: Migrator;
  readonly service: FieldVisitService;
  readonly directory: string;
  close(): Promise<void>;
}

/**
 * A real SQLite database with this application's migrations applied.
 *
 * Using the real migration directory, not the migration module directly, keeps the test honest about the schema that
 * actually ships.
 */
export async function createFieldVisitsTestDatabase(): Promise<FieldVisitsTestDatabase> {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, 'field-visits-db-'));

  const manager = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'main.sqlite'),
        schemaManagement: 'managed',
      },
    },
  });

  const migrator = manager.createMigrator({
    directory: path.resolve('database/main/migrations'),
    packageName: 'test-app',
  });
  await migrator.latest();

  return {
    manager,
    migrator,
    service: createFieldVisitService(manager),
    directory,
    close: () => manager.destroy(),
  };
}
