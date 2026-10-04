import { defineMigration } from '@nocobase/db';

/**
 * Customers the sales team manages.
 *
 * The shape is spelled out here rather than derived from any model so a later
 * change cannot silently redefine what this migration already applied. New
 * columns arrive in a new migration.
 *
 * `name` is required; `industry` is optional. Timestamps are written by the
 * application on create and update rather than by a column default, so every
 * dialect stores the same value.
 */
const migration = defineMigration({
  name: '202610050001_create_sales_customers',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull();
      collection.string('industry', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customers');
  },
});

export default migration;
