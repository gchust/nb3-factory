import { defineMigration } from '@nocobase/db';

/**
 * Uploaded attachment metadata.
 *
 * The column set (id, disk, key, filename, ext, mimeType, size, createdAt,
 * updatedAt) is the contract the file plugin validates before it stores or
 * serves a file, so it is spelled out here rather than composed from the
 * plugin: a migration is immutable history and may not depend on code that
 * keeps evolving.
 *
 * `materialId` is a plain nullable column, not a relation. An upload happens
 * before any material exists — the file is committed on its own, and saving
 * the material only binds it — so an attachment must be able to live with no
 * material. Binding and unbinding are therefore a value on this column, while
 * the bytes are never touched.
 *
 * This collection may not be extended with the plugin's file columns in any
 * other place; keep it in step with `FILE_COLUMNS` if the contract changes.
 */
export default defineMigration({
  name: '202610120002_create_material_files',
  async up({ builder }) {
    await builder.createCollection('material_files', (collection) => {
      collection.uuid('id').notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 1024 }).notNull();
      collection.string('filename', { length: 1024 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.uuid('materialId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_material_files' });
      collection.unique('key', { name: 'uq_material_files_key' });
      collection.index('ownerId', { name: 'idx_material_files_owner' });
      collection.index('materialId', { name: 'idx_material_files_material' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('material_files');
  },
});
