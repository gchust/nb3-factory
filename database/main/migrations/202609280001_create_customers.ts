import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customers are the accounts the sales team sells to. Every contact and
 * opportunity belongs to exactly one customer, so this table is created first.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280001_create_customers',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('industry', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('customers');
  },
});

export default migration;
