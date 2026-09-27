import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customers are the owning record for both contacts and opportunities, so this
 * collection is created first and dropped last.
 *
 * `name` is required and indexed by the list query; `industry` is optional.
 * Names are not unique: the business asked only for a required name, and a
 * uniqueness rule would turn a repeated name into a server error.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260301000001_create_customers',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('industry', { length: 120, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('customers');
  },
});

export default migration;
