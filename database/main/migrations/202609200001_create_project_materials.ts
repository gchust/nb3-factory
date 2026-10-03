import { defineMigration } from '@nocobase/db';

/**
 * Project materials and their private attachments.
 *
 * `projectMaterials` is the business record a project lead curates: a required
 * title and nothing else the first version needs.
 *
 * `projectAttachments` is a file Collection owned by this application. It
 * carries the columns `@nocobase/app-plugin-file` requires of any Collection it
 * uploads into (id/disk/key/filename/ext/mimeType/size/createdAt/updatedAt) plus
 * the two that make a file part of one material and let the application enforce
 * ownership: `ownerId` and a nullable `materialId` with a `sort`.
 *
 * `materialId` is nullable on purpose: a file is uploaded before the material is
 * saved, so the link is established when the material is saved and cleared when
 * the attachment is removed from it. The file row is never deleted for a detach.
 *
 * Everything is spelled out here rather than imported from the application's
 * current Collection metadata, because a migration has to keep meaning what it
 * meant when it ran.
 */
export default defineMigration({
  name: '202609200001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_materials' });
      collection.index('ownerId', { name: 'idx_project_materials_owner' });
    });

    await builder.createCollection('projectAttachments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 512 }).notNull();
      collection.string('ext', { length: 32 }).notNull().defaultTo('');
      collection.string('mimeType', { length: 255 }).notNull();
      collection.integer('size').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('materialId', { length: 64 }).nullable();
      collection.integer('sort').notNull().defaultTo(0);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_attachments' });
      collection.index('ownerId', { name: 'idx_project_attachments_owner' });
      collection.index('materialId', {
        name: 'idx_project_attachments_material',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectAttachments');
    await builder.dropCollection('projectMaterials');
  },
});
