import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Links a product (one) to its image rows in `product_image_files` (many).
 * `sort` preserves the upload order so the first image is a stable thumbnail.
 * `fileId` is unique, so one uploaded file can never belong to two products.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130003_create_product_images',

  async up({ builder }) {
    await builder.createCollection('product_images', (collection) => {
      collection.increments('id');
      collection.integer('productId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.integer('sort', { nullable: false, defaultValue: 0 });
      collection.datetime('createdAt', { nullable: false });
      collection.index('productId');
      collection.unique('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('product_images');
  },
});

export default migration;
