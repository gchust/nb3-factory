import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The File Repository collection behind work-order photos and reports.
 *
 * Field shape is fixed by the Repository: upload generates the uuid id and storage
 * key and supplies the timestamps, so the business form stores only the returned ids
 * in `workOrderFiles`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010004_create_service_files',

  async up({ builder }) {
    await builder.createCollection('serviceFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceFiles');
  },
});

export default migration;
