import type { Knex } from 'knex';
import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/db';

// The plugin's package.json exports map does not expose its migrations subpath,
// so the file is imported by its on-disk location instead.
import authMigration from '../../node_modules/@nocobase/app-plugin-authentication/dist/database/migrations/202608200001_create_authentication_tables.js';
import permissionSetsMigration from '../../node_modules/@nocobase/app-plugin-authorization/dist/database/migrations/202608210001_create_permission_set_tables.js';
import defaultPagesMigration from '../../node_modules/@nocobase/app-plugin-authorization/dist/database/migrations/202608250002_create_default_pages_permission_set.js';
import rolesMigration from '../../database/migrations/202609070001_create_sales_roles.js';
import customersMigration from '../../database/migrations/202609070002_create_sales_customers.js';
import contactsMigration from '../../database/migrations/202609070003_create_sales_contacts.js';
import leadsMigration from '../../database/migrations/202609070004_create_sales_leads.js';
import opportunitiesMigration from '../../database/migrations/202609070005_create_sales_opportunities.js';
import followUpsMigration from '../../database/migrations/202609070006_create_sales_follow_ups.js';
import filesMigration from '../../database/migrations/202609070007_create_sales_files.js';
import rolesSeed from '../../database/seeds/202609070001_seed_sales_roles.js';

export interface TestDatabase {
  database: DatabaseManager;
  knex: Knex;
}

/**
 * Inserts a user row (the `user` table is created by the authentication
 * migration) and returns its id, so sales records can reference a real owner.
 */
export async function createUser(
  database: DatabaseManager,
  id: string,
  name = id,
): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto('user')
    .values({
      id,
      name,
      username: id,
      email: `${id}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

/**
 * Creates an in-memory SQLite database with the authentication tables (the
 * `user` table the sales foreign keys reference) and every sales migration
 * applied. Pass `{ seed: true }` to also load the preset roles and accounts,
 * and `{ users }` to insert user rows that sales records can reference as
 * owners.
 */
export async function createTestDatabase(
  options: {
    seed?: boolean;
    users?: readonly string[];
    /** Applies the authorization plugin's permission-set tables and the
     * `default-pages` seed, so `setupSalesAuthorization` can run against the
     * database. */
    authorization?: boolean;
  } = {},
): Promise<TestDatabase> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  await database.connect();
  const context = createMigrationContext(database.connection());
  await authMigration.up(context);
  if (options.authorization) {
    await permissionSetsMigration.up(context);
    await defaultPagesMigration.up(context);
  }
  await rolesMigration.up(context);
  await customersMigration.up(context);
  await contactsMigration.up(context);
  await leadsMigration.up(context);
  await opportunitiesMigration.up(context);
  await followUpsMigration.up(context);
  await filesMigration.up(context);
  if (options.seed) {
    await rolesSeed.run(context);
  }
  for (const userId of options.users ?? []) {
    await createUser(database, userId);
  }
  const knex = await database.connection().client<Knex>();
  return { database, knex };
}
