import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the internal document library: `documents` (资料) and `documentShares` (管理员临时开放一篇草稿给某个人).
 *
 * The shape is spelled out here so a later change to the business logic cannot change what this migration did.
 * `published` and `confidential` are the two business flags of the task; both are stored as booleans (SQLite keeps
 * them as 0/1, so readers coerce with `Boolean()`). Visibility, sharing and edit rights are enforced in application
 * code (`server/documents/service.ts`), not by composite grants, because record visibility here is ordinary business
 * logic: a published non-confidential document is readable by any signed-in colleague, a draft is readable only by its
 * owner or someone an administrator shared it with, and a confidential document is never readable by anyone but its
 * owner (or an unrestricted administrator).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('ownerName', { length: 255 }).nullable();
      collection.boolean('published').notNull();
      collection.boolean('confidential').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_documents' });
      collection.index('ownerId', { name: 'ix_documents_owner_id' });
      collection.index('published', { name: 'ix_documents_published' });
      collection.index('confidential', { name: 'ix_documents_confidential' });
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
      collection.index('userId', { name: 'ix_document_shares_user_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documentShares');
    await builder.dropCollection('documents');
  },
});

export default migration;
