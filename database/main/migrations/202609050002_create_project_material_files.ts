import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The attachment collection behind `@nocobase/app-plugin-file`'s File Repository. The nine file columns are fixed by
// that plugin (see its SKILL): `id` a UUID primary key, `disk`, `key`, `filename`, `ext`, `mimeType`, `size` and the
// two timestamps, with `size` an integer/bigInt. A file is uploaded before the material that will own it exists, so
// `materialId` is nullable: the upload stamps only `createdById`, and saving the material links the file afterwards.
// Removing an attachment clears `materialId` (unlink), never deletes the row, so a file is never destroyed as a side
// effect of editing a material. Both scope columns are indexed because every read filters on them.
const migration: MigrationDefinition = defineMigration({
  name: '202609050002_create_project_material_files',
  async up({ builder }) {
    await builder.createCollection('projectMaterialFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.uuid('materialId').nullable();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('createdById', {
        name: 'idx_project_material_files_created_by',
      });
      collection.index('materialId', {
        name: 'idx_project_material_files_material',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectMaterialFiles');
  },
});

export default migration;
