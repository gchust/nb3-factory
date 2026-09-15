import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Join table between an inspection record and the files uploaded as its site photos.
// A file belongs to at most one record so deleting a photo cannot affect siblings.
const migration: MigrationDefinition = defineMigration({
  name: '202609150005_create_inspection_record_photos',

  async up({ builder }) {
    await builder.createCollection('inspectionRecordPhotos', (collection) => {
      collection.increments('id');
      collection.integer('recordId').notNull();
      collection.uuid('fileId').notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_inspection_record_photos' });
      collection.index('recordId', {
        name: 'idx_inspection_record_photos_record',
      });
      collection.unique('fileId', {
        name: 'uq_inspection_record_photos_file',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionRecordPhotos');
  },
});

export default migration;
