import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The internal document library's only table.
 *
 * Every field is spelled out here rather than taken from a shared declaration:
 * a migration is fixed history, and importing something that keeps evolving
 * would silently change what an already-applied migration means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_library_documents',

  async up({ builder }) {
    await builder.createCollection('libraryDocuments', (collection) => {
      // A text primary key, as every collection in this framework uses: a
      // sharing rule selects records by their string id, so an integer key
      // could not be shared.
      collection.string('id', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.text('content', { nullable: true });
      // The owner is compared in record-access filters, so it is a plain column
      // and not a relation; `ownerName` is denormalized for display so reading a
      // document never needs to join the user table.
      collection.string('ownerId', { length: 255, nullable: false });
      collection.string('ownerName', { length: 255, nullable: true });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
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
