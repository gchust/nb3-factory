import {
  createDatabaseManager,
  createMigrationContext,
  createSeedContext,
  type CollectionBuilder,
  type DatabaseManager,
} from '@nocobase/db';

import itTicketsMigration from '../../database/migrations/202609060001_create_it_tickets.js';
import itServiceDeskSeed from '../../database/seeds/202609060002_seed_it_service_desk.js';

/**
 * In-memory sqlite database with the schema the IT service desk needs:
 * the `user`/`account` tables owned by @nocobase/app-plugin-authentication
 * (recreated here so the tests do not depend on that plugin's migration
 * loader) plus the `itTickets` table from this application's migration.
 */
export async function createDeskDatabase(): Promise<DatabaseManager> {
  const manager = createDatabaseManager({
    connections: {
      default: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
  const connection = await manager.connect();

  const migrationContext = createMigrationContext(connection);
  await createAuthTables(migrationContext.builder);
  await itTicketsMigration.up(migrationContext);

  return manager;
}

export async function seedDeskDatabase(
  manager: DatabaseManager,
): Promise<void> {
  const connection = manager.connection();
  const seedContext = createSeedContext(connection);
  await itServiceDeskSeed.run(seedContext);
}

/** The `user` and `account` tables the seed writes to, mirroring the authentication plugin's migration. */
async function createAuthTables(builder: CollectionBuilder): Promise<void> {
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_user' });
    collection.unique('username', { name: 'uq_user_username' });
    collection.unique('email', { name: 'uq_user_email' });
  });
  await builder.createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('issuer', { length: 255 }).notNull();
    collection.string('accountId', { length: 320 }).notNull();
    collection.string('providerId', { length: 128 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.text('accessToken').nullable();
    collection.text('refreshToken').nullable();
    collection.text('idToken').nullable();
    collection.datetime('accessTokenExpiresAt').nullable();
    collection.datetime('refreshTokenExpiresAt').nullable();
    collection.text('scope').nullable();
    collection.text('password').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_account' });
    collection.unique(['issuer', 'accountId'], {
      name: 'uq_account_issuer_account',
    });
    collection.index('userId', { name: 'idx_account_user' });
  });
}
