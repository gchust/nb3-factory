// @vitest-environment node

import { createDatabaseManager, defineDatabase } from '@nocobase/db';
import type {
  CollectionBuilder,
  DatabaseManager,
  MigrationContext,
  QueryAdapter,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

import itTicketMigration from '../../database/main/migrations/202609300001_create_it_tickets.js';

/**
 * A real, throwaway SQLite database holding only the tables the IT ticket
 * feature touches.
 *
 * The migration is the real one, so a change that would only work against a
 * mock is caught here. The identity and authorization tables the seeds read are
 * recreated in the shape the framework's own migrations leave them, because
 * this application's migrations deliberately do not own those.
 */
export interface ItTicketTestDatabase {
  readonly database: DatabaseManager;
  readonly builder: CollectionBuilder;
  readonly query: QueryAdapter;
  dispose(): Promise<void>;
}

export async function createItTicketTestDatabase(): Promise<ItTicketTestDatabase> {
  const database = createDatabaseManager(
    defineDatabase({
      default: 'main',
      connections: {
        main: sqlite({ filename: ':memory:', schemaManagement: 'managed' }),
      },
    }),
  );
  await database.connect('main');
  const builder = database.builder('main');
  const query = database.query('main');

  const migrationContext = {
    builder,
    query,
    config: { get: () => undefined },
  } as unknown as MigrationContext;
  await itTicketMigration.up(migrationContext);

  await createIdentityTables(builder);

  return {
    database,
    builder,
    query,
    async dispose() {
      await database.destroy();
    },
  };
}

/** The identity and authorization tables the framework owns, in their real shape. */
async function createIdentityTables(builder: CollectionBuilder): Promise<void> {
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 255, primary: true });
    collection.string('name', { length: 255 }).nullable();
    collection.string('username', { length: 255 }).unique();
    collection.string('email', { length: 255 }).unique();
    collection.boolean('emailVerified', { nullable: false }).defaultTo(false);
    collection.datetime('createdAt', { nullable: false });
    collection.datetime('updatedAt', { nullable: false });
  });

  await builder.createCollection('account', (collection) => {
    collection.string('id', { length: 255, primary: true });
    collection.string('accountId', { length: 255, nullable: false });
    collection.string('providerId', { length: 255, nullable: false });
    collection.string('userId', { length: 255, nullable: false });
    collection.string('password', { length: 255 }).nullable();
    collection.datetime('createdAt', { nullable: false });
    collection.datetime('updatedAt', { nullable: false });
  });

  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id', { length: 64, primary: true });
      collection.string('key', { length: 255, nullable: false }).unique();
      collection.string('title', { length: 255 }).nullable();
      collection.json('grants').nullable();
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    },
  );

  await builder.createCollection(
    'authorizationPermissionSetAssignments',
    (collection) => {
      collection.string('id', { length: 255, primary: true });
      collection.string('subjectType', { length: 64, nullable: false });
      collection.string('subjectId', { length: 255, nullable: false });
      collection.string('permissionSetKey', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    },
  );
}
