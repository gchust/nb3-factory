import { defineMigration } from '@nocobase/db';

/**
 * The document library's own tables. A document is owned by the person who
 * created it; a share is the temporary exception an administrator grants so a
 * reader can see one draft. Both identifiers are real foreign keys, so deleting
 * a user or a document removes the rows that only made sense beside it.
 */
export default defineMigration({
  name: '202610200001_create_library_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').notNull().defaultTo('');
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_documents' });
      collection.index('ownerId', { name: 'idx_documents_owner' });
      collection.index(['published', 'confidential'], {
        name: 'idx_documents_visibility',
      });
      collection.foreignKey('ownerId', {
        name: 'fk_documents_owner',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('documentShares', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('documentId', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_document_shares' });
      collection.unique(['documentId', 'userId'], {
        name: 'uq_document_shares_document_user',
      });
      collection.index('documentId', {
        name: 'idx_document_shares_document',
      });
      collection.index('userId', { name: 'idx_document_shares_user' });
      collection.foreignKey('documentId', {
        name: 'fk_document_shares_document',
        references: { collection: 'documents', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey('userId', {
        name: 'fk_document_shares_user',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documentShares');
    await builder.dropCollection('documents');
  },
});
