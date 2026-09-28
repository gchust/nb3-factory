import { defineMigration } from '@nocobase/db';

/**
 * Creates the document library's two tables.
 *
 * `documents` is the library itself: a title and body, an owner, and the two
 * flags that decide who may read it. `documentShares` is a temporary grant of
 * one document to one account; it is a plain table rather than a relation
 * because the read scope is resolved with a filter, and a share is revoked by
 * deleting its row. `ownerId` and `userId` deliberately carry no foreign key: a
 * hard dependency on the authentication tables would tie this application's
 * migration order to a plugin's, and the application never deletes an account
 * without first removing the rows that point at it.
 */
export default defineMigration({
  name: '202609280001_create_library',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_documents' });
      collection.index('ownerId', { name: 'idx_documents_owner' });
      collection.index('published', { name: 'idx_documents_published' });
      collection.index('confidential', { name: 'idx_documents_confidential' });
    });

    await builder.createCollection('documentShares', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('documentId', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_document_shares' });
      collection.unique(['documentId', 'userId'], {
        name: 'uq_document_shares_document_user',
      });
      collection.index('userId', { name: 'idx_document_shares_user' });
      collection.index('documentId', { name: 'idx_document_shares_document' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documentShares');
    await builder.dropCollection('documents');
  },
});
