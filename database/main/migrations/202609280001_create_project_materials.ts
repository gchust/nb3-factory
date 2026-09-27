import { defineMigration } from '@nocobase/db';

/**
 * Creates the two tables behind "项目资料与私有附件": the material (title)
 * and the attachment (file metadata) it owns.
 *
 * The file table is spelled out to exactly the columns
 * `@nocobase/app-plugin-file` requires of a file Collection
 * (`FILE_COLUMNS`: id, disk, key, filename, ext, mimeType, size, createdAt,
 * updatedAt), plus the two application columns that carry ownership and the
 * business link. `id` accepts a server-generated UUID and is the sole primary
 * key, which the plugin's `validateCollection()` checks at upload time.
 *
 * `ownerId` is on the file row as well as the material row: an upload happens
 * before the material exists, and the uploader has to be able to preview their
 * own unattached file. `materialId` is nullable because an uploaded file is
 * detached until the material is saved.
 *
 * The shape is written here rather than derived from a Collection definition,
 * so a later change to that definition cannot silently change what this
 * already-applied migration did. A change is a new migration.
 */
const migration = defineMigration({
  name: '202609280001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.string('id', { length: 36 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_materials' });
      collection.index('ownerId', { name: 'idx_project_materials_owner' });
    });

    await builder.createCollection('projectMaterialFiles', (collection) => {
      collection.string('id', { length: 36 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 512 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.integer('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('materialId', { length: 36 }).nullable();
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
    // Files first: the business link points from the file row to the material.
    await builder.dropCollection('projectMaterialFiles');
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
