import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Project materials and their private attachments.
 *
 * `projectMaterialFiles` carries exactly the columns the File Repository contract requires
 * (`id`, `disk`, `key`, `filename`, `ext`, `mimeType`, `size`, `createdAt`, `updatedAt`) plus the two
 * columns this feature adds: the owning user, which is what isolates one user's attachments from
 * another's, and the material an attachment currently belongs to (`null` while it is uploaded but
 * not yet attached, which is what keeps an upload from being lost when the title save fails).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610100001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index(['ownerId'], { name: 'idx_project_materials_owner' });
    });

    await builder.createCollection('projectMaterialFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.integer('materialId').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.foreignKey(['materialId'], {
        name: 'fk_project_material_files_material',
        references: { collection: 'projectMaterials', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.index(['materialId'], {
        name: 'idx_project_material_files_material',
      });
      collection.index(['ownerId'], {
        name: 'idx_project_material_files_owner',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectMaterialFiles');
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
