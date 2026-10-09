import { defineMigration } from '@nocobase/db';

/**
 * Business table of the internal document library. Physical name is
 * `library_documents`, derived from the camelCase Collection name.
 */
export default defineMigration({
  name: '202610100001_create_library_documents',
  async up({ builder }) {
    await builder.createCollection('libraryDocuments', (collection) => {
      // A string primary key, like the `user` table, so record selections and
      // route parameters address a document the same way everywhere.
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection
        .string('ownerId', { length: 64 })
        .notNull()
        .references({ collection: 'user', field: 'id' });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_library_documents' });
      collection.index('ownerId', { name: 'idx_library_documents_owner' });
      collection.index(['published', 'confidential'], {
        name: 'idx_library_documents_visibility',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('libraryDocuments');
  },
});
