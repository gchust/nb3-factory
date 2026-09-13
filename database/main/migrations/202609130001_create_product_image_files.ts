import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Table backing the `productImages` File plugin repository.
 *
 * The File plugin validates this exact shape before serving any upload, so the
 * fixed columns (`id` as a server-generated UUID primary key, `disk`, `key`,
 * `filename`, `ext`, `mimeType`, `size`, `createdAt`, `updatedAt`) must be
 * spelled out here rather than derived from an evolving definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_product_image_files',

  async up({ builder }) {
    await builder.createCollection('product_image_files', (collection) => {
      collection.uuid('id', { nullable: false }).primary();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.integer('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('product_image_files');
  },
});

export default migration;
