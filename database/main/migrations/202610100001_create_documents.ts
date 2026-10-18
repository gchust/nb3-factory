import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The library's `documents` table: one internal reference document.
 *
 * `published` and `confidential` are the two business flags the reading rules are built from, and `ownerId` is the
 * person responsible for the document. Nothing here references the `user` table through a foreign key: ownership and
 * authorization are decided in code (see `server/library/`), so the table stays a plain record store and deleting an
 * account never breaks a document.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610100001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_documents' });
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
