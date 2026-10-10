import { defineMigration } from '@nocobase/db';

/**
 * Project materials and the files attached to them.
 *
 * `projectMaterialFiles` is the file Collection the File plugin's upload path
 * writes into: its columns are the plugin's FILE_COLUMNS contract (`id` is a
 * server-generated UUID and the sole primary key) plus `ownerId`, which the
 * upload route stamps from the authenticated user, and a nullable `materialId`
 * that links a file to a material. A file with `materialId = null` is an upload
 * that was never saved, or one detached by an edit.
 *
 * The link is a plain column rather than a foreign key on purpose: unlinking a
 * file (setting `materialId` to null) and deleting a material are independent
 * writes, and a cascade would either remove the attachment metadata behind the
 * user's back or require an ordering this feature does not need.
 */
export default defineMigration({
  name: '202610100001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId', {
        name: 'idx_project_materials_owner',
      });
    });
    await builder.createCollection('projectMaterialFiles', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.integer('materialId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_material_files' });
      collection.index('ownerId', {
        name: 'idx_project_material_files_owner',
      });
      collection.index('materialId', {
        name: 'idx_project_material_files_material',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectMaterialFiles');
    await builder.dropCollection('projectMaterials');
  },
});
