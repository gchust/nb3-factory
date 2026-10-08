import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The business table of the internal document library.
 *
 * Self-contained by design: every field, index and constraint this feature
 * relies on is declared here rather than imported from a live declaration, so
 * an already-applied migration keeps meaning what it meant.
 *
 * `ownerId` is deliberately a plain string column holding a `user.id`; record
 * access resolves ownership by comparing it with the session principal, so no
 * relation metadata is required. `id` is a string primary key because record
 * selections and Sharing Rules address records by string identifier, and the
 * authorization layer validates those identifiers against the field's type.
 * `createdAt`/`updatedAt` are ordinary columns: the repository does not fill
 * timestamps for a non-managed collection, so the server routes set them
 * explicitly.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64, nullable: false }).primary();
      collection.string('code', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.text('body', { nullable: true });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code', { name: 'uq_documents_code' });
      collection.index('ownerId', { name: 'idx_documents_owner' });
      collection.index('published', { name: 'idx_documents_published' });
      collection.index('confidential', { name: 'idx_documents_confidential' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
