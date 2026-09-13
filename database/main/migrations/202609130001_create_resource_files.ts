import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The attachment store for the resource centre. The field set is fixed by the File plugin's
// repository contract: uploads generate the id and storage key and validate `size`, so the
// columns are spelled out here rather than imported from any evolving definition.
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_resource_files',

  async up({ builder }) {
    await builder.createCollection('resource_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('resource_files');
  },
});

export default migration;
