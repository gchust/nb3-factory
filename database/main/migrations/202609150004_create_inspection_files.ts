import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// File collection consumed by @nocobase/app-plugin-file. The field set is fixed by
// the plugin; the application owns where the records are linked from.
const migration: MigrationDefinition = defineMigration({
  name: '202609150004_create_inspection_files',

  async up({ builder }) {
    await builder.createCollection('inspectionFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionFiles');
  },
});

export default migration;
