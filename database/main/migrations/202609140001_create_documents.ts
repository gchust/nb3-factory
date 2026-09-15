import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The document ledger for the engineering drawing and technical document library.
 *
 * The table doubles as the file collection consumed by `@nocobase/app-plugin-file`, so the first block of columns
 * is the fixed file metadata contract that plugin requires. The second block carries the business ledger that a
 * data clerk fills in after a batch upload. Extra business columns are nullable because an upload writes only the
 * file metadata; the business values are applied by the application's own route immediately afterwards.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      // Fixed file metadata contract. Names and types are dictated by the file plugin and mapping is unsupported.
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      // Business ledger, nullable because upload accepts no business values.
      collection.string('drawingNumber', { length: 128 }).nullable();
      collection.string('name', { length: 255 }).nullable();
      collection.string('discipline', { length: 32 }).nullable();
      collection.string('version', { length: 32 }).nullable();
      collection.string('status', { length: 16 }).nullable();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.string('uploadedByName', { length: 255 }).nullable();
      collection.datetime('uploadedAt').nullable();

      collection.index('discipline');
      collection.index('status');
      collection.index('drawingNumber');
      collection.index('name');
      collection.index('uploadedById');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
