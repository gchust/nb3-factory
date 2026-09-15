import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseConnection,
  type MigrationContext,
} from '@nocobase/db';

import recordPhotosMigration from '../../database/main/migrations/202609150005_create_inspection_record_photos.js';
import filesMigration from '../../database/main/migrations/202609150004_create_inspection_files.js';
import recordsMigration from '../../database/main/migrations/202609150003_create_inspection_records.js';
import plansMigration from '../../database/main/migrations/202609150002_create_inspection_plans.js';
import devicesMigration from '../../database/main/migrations/202609150001_create_inspection_devices.js';

const MIGRATIONS = [
  devicesMigration,
  plansMigration,
  recordsMigration,
  filesMigration,
  recordPhotosMigration,
];

export interface InspectionDatabase {
  readonly connection: DatabaseConnection;
  readonly manager: ReturnType<typeof createDatabaseManager>;
  dispose(): Promise<void>;
}

/** A real SQLite database carrying the inspection schema, for integration tests. */
export async function createInspectionDatabase(): Promise<InspectionDatabase> {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nb3-inspection-db-'));
  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'test.sqlite'),
      },
    },
  });
  const connection = await manager.connect('main');
  for (const migration of MIGRATIONS) {
    await migration.up({
      builder: connection.builder,
      query: connection.query,
    } as MigrationContext);
  }
  return {
    connection,
    manager,
    async dispose() {
      await manager.disconnect('main');
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
