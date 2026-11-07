import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The document library's only business table. `ownerId` points at `user.id` without a relation so that removing an
 * account never cascades into the documents that person wrote. Visibility rules are deliberately not encoded here:
 * they are permission configuration and application checks, not schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_library_documents',

  async up({ builder }) {
    await builder.createCollection('libraryDocuments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('body').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
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

export default migration;
