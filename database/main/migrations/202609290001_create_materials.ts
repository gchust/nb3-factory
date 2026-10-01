import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The document library's one business table.
 *
 * `ownerId` carries the principal's user id and is what the `recordsIOwn` record access reads; there is no foreign
 * key because a material outlives no account and the owner column is compared by value. `published` and
 * `confidential` are the two flags the record access rules and the reader restriction rule are written against.
 *
 * The primary key is a generated string, not an auto-increment integer: a `records` selection (how an administrator
 * shares one document) carries string ids, and a string id is what the authorization layer validates them against.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609290001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.string('id', { length: 36 }).primary();
      collection.string('title', { length: 255, nullable: false });
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId', { name: 'idx_materials_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
