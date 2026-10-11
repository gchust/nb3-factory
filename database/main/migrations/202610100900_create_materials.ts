import { defineMigration } from '@nocobase/db';

/**
 * 项目资料与私有附件 (materials and their private attachments).
 *
 * `materials` is application-owned: a title and the owner who created it. `material_files` is a file Collection the
 * `@nocobase/app-plugin-file` Repository writes through, so it must carry the columns that plugin validates
 * (`disk`, `key`, `filename`, `ext`, `mimeType`, `size`, `createdAt`, `updatedAt`) plus an `id` that is the sole
 * primary key. `ownerId` and `materialId` are application columns: the first scopes a file to its uploader, the
 * second links it to a material while it is attached.
 */
export default defineMigration({
  name: '202610100900_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId', { name: 'idx_materials_owner' });
    });

    await builder.createCollection('material_files', (collection) => {
      collection.uuid('id').notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.string('key', { length: 255 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('ext', { length: 32 }).nullable();
      collection.string('mimeType', { length: 255 }).nullable();
      collection.integer('size').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.integer('materialId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_material_files' });
      collection.index('ownerId', { name: 'idx_material_files_owner' });
      collection.index('materialId', { name: 'idx_material_files_material' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('material_files');
    await builder.dropCollection('materials');
  },
});
