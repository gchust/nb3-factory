import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The temporary shares an administrator grants on one document.
 *
 * A row means "this document is open to this person while the row exists"; revoking the share deletes the row, which is
 * what makes a grant temporary. The table deliberately has no foreign key to `documents` or `user`: the reading rules
 * live in `server/library/`, and deleting an account or a document must not be blocked by a leftover share.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610100002_create_document_shares',

  async up({ builder }) {
    await builder.createCollection('documentShares', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('documentId', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_document_shares' });
      // One share per document and person: granting the same share twice is the same share.
      collection.unique(['documentId', 'userId'], {
        name: 'uq_document_shares_document_user',
      });
      collection.index('userId', { name: 'idx_document_shares_user' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documentShares');
  },
});

export default migration;
