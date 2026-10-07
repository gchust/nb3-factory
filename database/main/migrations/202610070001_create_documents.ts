import { defineMigration } from '@nocobase/db';

/**
 * Internal document library storage.
 *
 * Every field, index and constraint is spelled out here on purpose: a migration
 * is immutable history and must stay self-contained. The primary key is a uuid
 * so a record an administrator shares by id (Sharing Rules' "specific records")
 * names a string, which is what the authorization layer stores and validates.
 * `ownerId` is a plain string rather than a foreign key: it names the account a
 * seeded demonstration document belongs to, and the Users plugin owns the
 * `user` table's lifecycle.
 */
export default defineMigration({
  name: '202610070001_create_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.uuid('id', { length: 36 }).primary();
      collection.string('title', { length: 200 }).notNull();
      collection.text('body').notNull().defaultTo('');
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt');
      collection.datetime('updatedAt');
      collection.index('ownerId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});
