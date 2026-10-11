import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The internal document library's tables.
 *
 * `documents` is the document itself: `ownerId` names the user responsible for it, `published` and `confidential`
 * drive who may read it. `body` holds the text of the document. A later release can add attachments, versions or
 * approval without touching this one.
 *
 * `documentShares` is the administrator's temporary, per-document opening of one draft to one reader. A row grants
 * that reader read access to that one document regardless of the published flag; removing the row takes the access
 * away again. Confidential documents are never opened through this table — the record access that reads it filters
 * them out — so an accidental row cannot leak one.
 *
 * Both tables are spelled out here rather than imported from a definition, so a later change to a model cannot
 * silently change what this migration already applied to a database.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('ownerId', { name: 'idx_documents_owner_id' });
    });

    await builder.createCollection('documentShares', (collection) => {
      collection.increments('id');
      collection.integer('documentId').notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();

      collection.index('documentId', {
        name: 'idx_document_shares_document_id',
      });
      collection.index('userId', { name: 'idx_document_shares_user_id' });
      collection.unique(['documentId', 'userId'], {
        name: 'uq_document_shares_document_user',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documentShares');
    await builder.dropCollection('documents');
  },
});

export default migration;
