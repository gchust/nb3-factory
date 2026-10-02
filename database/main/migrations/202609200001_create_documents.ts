import { defineMigration } from '@nocobase/db';

/**
 * The internal document library's only table.
 *
 * `ownerId` is the Authentication user id and carries `recordsIOwn`, so it is a
 * plain string column rather than a relation: the authorization model reads
 * direct fields only, and a relation would put the owner behind traversal.
 */
const migration = defineMigration({
  name: '202609200001_create_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.text('content').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_documents' });
      collection.index('ownerId', { name: 'idx_documents_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
