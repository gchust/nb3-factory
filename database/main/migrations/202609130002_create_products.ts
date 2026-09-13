import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A product gallery entry: its display name and short description. The ordered
 * image set lives in `product_images`, linking back to `product_image_files`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_products',

  async up({ builder }) {
    await builder.createCollection('products', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.text('description', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('products');
  },
});

export default migration;
