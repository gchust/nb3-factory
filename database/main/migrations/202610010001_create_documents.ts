import { defineMigration } from '@nocobase/db';

/**
 * The knowledge documents the "资料助手" answers from. Only a title and a body
 * are maintained, plus a stable string key so seeds, permission selections and
 * citations stay deterministic across installations.
 *
 * The table is deliberately small: the record range of a document is decided by
 * the permission configuration, not by an extra visibility column, so the
 * business data stays exactly what the product says it is.
 */
const migration = defineMigration({
  name: '202610010001_create_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('content').notNull();
      collection.primary('id', { name: 'pk_documents' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
