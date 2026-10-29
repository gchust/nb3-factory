import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The internal document library and its one-record-at-a-time sharing table.
 *
 * `ownerId` is the responsibility boundary used by the edit and share grants;
 * `ownerName` is a snapshot so a document still reads correctly after a person
 * is renamed. A share is kept after it is revoked (`revokedAt`) so the history
 * of a temporary opening remains auditable, and one row per document/person is
 * reused when the same document is opened again.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610270001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('ownerName', { length: 255 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_documents' });
      collection.index('ownerId', { name: 'idx_documents_owner_id' });
      collection.index('published', { name: 'idx_documents_published' });
      collection.index('confidential', { name: 'idx_documents_confidential' });
    });

    await builder.createCollection('documentShares', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('documentId', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('userName', { length: 255 }).notNull();
      collection.string('sharedById', { length: 64 }).notNull();
      collection.string('sharedByName', { length: 255 }).notNull();
      collection.datetime('expiresAt').nullable();
      collection.datetime('revokedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_document_shares' });
      collection.unique(['documentId', 'userId'], {
        name: 'uq_document_shares_document_user',
      });
      collection.index('documentId', {
        name: 'idx_document_shares_document_id',
      });
      collection.index('userId', { name: 'idx_document_shares_user_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documentShares');
    await builder.dropCollection('documents');
  },
});

export default migration;
