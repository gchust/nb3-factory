import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Storage metadata for IT attachments (asset invoices/photos and work-order repair photos).
 *
 * The column set is fixed by the file repository contract: upload generates the id, key, size and
 * timestamps, so every column here is required and carries no business-supplied value. The table is
 * self-contained on purpose — the file repository never reads a shared collection definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_it_files',

  async up({ builder }) {
    await builder.createCollection('it_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('key', { name: 'idx_it_files_key' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('it_files');
  },
});

export default migration;
