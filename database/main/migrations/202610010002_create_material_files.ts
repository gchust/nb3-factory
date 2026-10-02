import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/db';

// Attachment metadata for a project material. The columns mirror the file
// plugin's file Collection contract exactly, so the plugin's Repository and byte
// route can serve these rows, plus two application columns:
//
// - `createdById` records who uploaded the object. `materialId` is nullable, so
//   a file can exist before the material that will own it is saved — that is
//   what lets a failed save keep its uploads instead of asking for them again.
// - `materialId` links the file to a material once the material is saved.
const migration: MigrationDefinition = defineMigration({
  name: '202610010002_create_material_files',
  async up({ builder }) {
    await builder.createCollection('materialFiles', (collection) => {
      collection.uuid('id').notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection
        .string('materialId', { length: 36 })
        .nullable()
        .index({ name: 'idx_material_files_material' });
      collection.primary('id', { name: 'pk_material_files' });
      collection.index('createdById', {
        name: 'idx_material_files_created_by',
      });
      collection.index('key', { name: 'idx_material_files_key' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materialFiles');
  },
});

export default migration;