import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { resolveDatabaseConfig } from '@nocobase/app-server/database';

import coreMigration from '../../database/main/migrations/202609210001_create_compliance_core.js';
import filesMigration from '../../database/main/migrations/202609210002_create_compliance_files.js';
import referenceSeed from '../../database/main/seeds/202609210001_compliance_reference_data.js';
import samplesSeed from '../../database/main/seeds/202609210002_compliance_file_samples.js';

export interface ComplianceTestDatabase {
  manager: DatabaseManager;
  close(): Promise<void>;
}

/**
 * A real SQLite database with the application migrations and seeds applied.
 *
 * The application's own migrations are executed exactly as the CLI would run them, so a test exercises the schema the
 * deployment actually gets. A minimal `user` table stands in for the authentication plugin's table so the service can
 * resolve uploader and reviewer names without booting the whole application.
 */
export async function createComplianceTestDatabase(): Promise<ComplianceTestDatabase> {
  const resolved = await resolveDatabaseConfig({
    default: 'main',
    drivers: {},
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  } as never);
  const manager = createDatabaseManager(resolved as never);
  const connection = await manager.connect('main');
  const builder = manager.builder('main');
  const query = manager.query('main');

  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).primary();
    collection.string('name', { length: 255 }).nullable();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).nullable();
  });
  await query
    .insertInto('user')
    .values([
      { id: 'user-admin', name: 'Administrator', username: 'admin' },
      { id: 'user-proc', name: 'Procurement Specialist', username: 'proc' },
      { id: 'user-quality', name: 'Quality Lead', username: 'quality' },
      { id: 'user-legal', name: 'Legal Counsel', username: 'legal' },
      { id: 'user-contact', name: 'Supplier Contact', username: 'contact' },
    ])
    .execute();

  await coreMigration.up({ builder, query, connection });
  await filesMigration.up({ builder, query, connection });
  await referenceSeed.run({ query, connection });
  await samplesSeed.run({ query, connection });

  return {
    manager,
    async close() {
      await manager.destroy();
    },
  };
}

export async function organizationIdByCode(
  manager: DatabaseManager,
  code: string,
): Promise<number> {
  const row = await manager
    .query('main')
    .selectFrom('procurementOrganizations')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirst();
  if (!row) throw new Error(`Organization ${code} was not seeded.`);
  return Number((row as { id: number }).id);
}

export async function supplierIdByCode(
  manager: DatabaseManager,
  code: string,
): Promise<number> {
  const row = await manager
    .query('main')
    .selectFrom('suppliers')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirst();
  if (!row) throw new Error(`Supplier ${code} was not seeded.`);
  return Number((row as { id: number }).id);
}
