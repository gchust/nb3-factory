import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// File metadata table consumed by @nocobase/app-plugin-file. The field set is
// fixed by that plugin's Server repository, so it is spelled out here rather
// than imported from an evolving definition.
const migration: MigrationDefinition = defineMigration({
  name: '202609130005_create_delivery_project_files',

  async up({ builder }) {
    await builder.createCollection('deliveryProjectFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryProjectFiles');
  },
});

export default migration;
