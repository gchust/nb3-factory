import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Supplier master data for the procurement domain. Self-contained: it declares
 * every column and index it needs and imports no evolving definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_procurement_suppliers',

  async up({ builder }) {
    await builder.createCollection('procurementSuppliers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('unifiedSocialCreditCode', {
        length: 64,
        nullable: true,
      });
      collection.string('contactName', { length: 128, nullable: true });
      collection.string('contactPhone', { length: 64, nullable: true });
      // material | service | engineering
      collection.string('category', { length: 32, nullable: false });
      // active | disabled
      collection.string('status', { length: 32, nullable: false });
      collection.string('createdById', { length: 64, nullable: true });
      collection.string('createdByName', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('category');
      collection.index('status');
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('procurementSuppliers');
  },
});

export default migration;
