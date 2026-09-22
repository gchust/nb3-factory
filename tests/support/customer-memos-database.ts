import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

/** The application-owned database source the tests exercise. */
export const MEMO_MIGRATIONS_DIRECTORY = path.resolve(
  'database/main/migrations',
);
export const MEMO_SEEDS_DIRECTORY = path.resolve('database/main/seeds');
export const MEMO_PACKAGE_NAME = 'nb3-factory';

/**
 * Creates an isolated directory under `tests/.tmp` for a database file. The
 * caller is responsible for removing it, which the tests do in `afterEach`.
 */
export function createTempDirectory(prefix: string): string {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, prefix));
}

export function removeTempDirectory(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** A real SQLite manager, so the migration and routes run against a database. */
export function createMemoDatabase(root: string): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(root, 'main.sqlite'),
        schemaManagement: 'managed',
      },
    },
  });
}
