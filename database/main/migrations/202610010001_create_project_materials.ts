import { defineMigration } from '@nocobase/db';

/**
 * Project materials and their attachments.
 *
 * `projectMaterials` is application-owned business data: a title and an owner.
 * `projectMaterialFiles` carries the columns the File plugin requires of a file
 * Collection (see `FILE_COLUMNS` in `@nocobase/app-plugin-file`) plus the two
 * application columns that make an upload belong to a person and, once saved,
 * to a material. `materialId` is nullable because an uploaded file exists
 * before the material it will be attached to, and is set to `null` again when
 * the user removes it from a material — detaching never deletes bytes.
 */
const migration = defineMigration({
  name: '202610010001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.uuid('id').primary();
      collection.string('title', { length: 255, nullable: false });
      collection.string('ownerId', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId', {
        name: 'project_materials_owner_idx',
      });
    });

    await builder.createCollection('projectMaterialFiles', (collection) => {
      collection.uuid('id').primary();
      collection.string('disk', { length: 255, nullable: false });
      collection.string('key', { length: 1000, nullable: false });
      collection.string('filename', { length: 500, nullable: false });
      collection.string('ext', { length: 32 });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.string('ownerId', { length: 255, nullable: false });
      collection.uuid('materialId');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId', {
        name: 'project_material_files_owner_idx',
      });
      collection.index('materialId', {
        name: 'project_material_files_material_idx',
      });
      collection.foreignKey('materialId', {
        name: 'project_material_files_material_fk',
        references: {
          collection: 'projectMaterials',
          fields: ['id'],
        },
        onDelete: 'set null',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectMaterialFiles');
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
