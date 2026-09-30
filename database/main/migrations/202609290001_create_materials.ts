import { defineMigration } from '@nocobase/db';

/**
 * Project materials and their private attachments.
 *
 * `materials` carries the required title and the owning user. `materialAttachments` is a File Collection in the
 * sense of `@nocobase/app-plugin-file`: it must expose the file columns the file repository validates
 * (`id, disk, key, filename, ext, mimeType, size, createdAt, updatedAt`) and the bytes live on the `local` disk.
 *
 * The application adds `ownerId` (the isolation boundary) and the optional `materialId` link. An attachment is
 * uploaded before it belongs to a material, so `materialId` starts null and is set when the material is saved;
 * removing an attachment from a material clears the link again. No relation field is declared on `materials`
 * because the application always queries attachments by `materialId`.
 */
export default defineMigration({
  name: '202609290001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_materials' });
      collection.index('ownerId', { name: 'idx_materials_owner' });
    });

    await builder.createCollection('materialAttachments', (collection) => {
      collection.uuid('id').notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.integer('materialId').nullable();
      collection.primary('id', { name: 'pk_material_attachments' });
      collection.index('ownerId', {
        name: 'idx_material_attachments_owner',
      });
      collection.index('materialId', {
        name: 'idx_material_attachments_material',
      });
      collection.foreignKey('materialId', {
        references: { collection: 'materials', fields: ['id'] },
        name: 'fk_material_attachments_material',
        onDelete: 'set null',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materialAttachments');
    await builder.dropCollection('materials');
  },
});
