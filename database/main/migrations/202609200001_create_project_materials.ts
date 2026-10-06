import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Project materials and their attachments.
 *
 * `projectMaterials` is the business record: a required title and the owner
 * who maintains it.
 *
 * `projectFiles` is one table for two things at once: the storage metadata the
 * File plugin needs (`id`, `disk`, `key`, `filename`, `ext`, `mimeType`, `size`,
 * `createdAt`, `updatedAt`, in exactly the shape its `ServerFileRepositoryManager`
 * validates) and the business relation to a material. A file is uploaded before
 * the material it will belong to exists, so `materialId` is nullable: an unbound
 * file is one that has been uploaded but not saved into a material yet, and
 * "removing" an attachment unsets it again instead of destroying the row.
 *
 * Both foreign keys are spelled out here rather than imported, because a
 * migration is history: `ownerId` follows the authentication plugin's `user.id`,
 * a 64 character UUID string, and `materialId` follows this file's own table.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_project_materials',

  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id', { name: 'pk_project_materials' });
      collection.foreignKey('ownerId', {
        references: { collection: 'user', fields: ['id'] },
        name: 'fk_project_materials_owner',
        onDelete: 'cascade',
      });
      collection.index('ownerId', { name: 'idx_project_materials_owner' });
    });

    await builder.createCollection('projectFiles', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('disk', { length: 64, nullable: false });
      collection.string('key', { length: 255, nullable: false });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('ext', {
        length: 32,
        nullable: false,
        defaultValue: '',
      });
      collection.string('mimeType', { length: 128, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.integer('materialId', { nullable: true });
      collection.integer('sort', { nullable: false, defaultValue: 0 });
      collection.primary('id', { name: 'pk_project_files' });
      collection.index(['disk', 'key'], { name: 'idx_project_files_object' });
      collection.index('ownerId', { name: 'idx_project_files_owner' });
      collection.index('materialId', { name: 'idx_project_files_material' });
      collection.foreignKey('ownerId', {
        references: { collection: 'user', fields: ['id'] },
        name: 'fk_project_files_owner',
        onDelete: 'cascade',
      });
      collection.foreignKey('materialId', {
        references: { collection: 'projectMaterials', fields: ['id'] },
        // Removing a material never destroys a file row; the attachment is
        // unbound, which is all the business asks for.
        name: 'fk_project_files_material',
        onDelete: 'set null',
      });
    });
  },

  async down({ builder }) {
    // The referencing table first: `projectFiles.materialId` points at
    // `projectMaterials.id`.
    await builder.dropCollection('projectFiles');
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
