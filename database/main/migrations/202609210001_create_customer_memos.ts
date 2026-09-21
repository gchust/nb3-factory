import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer memos shown on the application's "Customer memos" page.
 *
 * The structure is spelled out here rather than imported from a shared
 * definition: a migration is immutable history, and reading an evolving
 * collection definition would silently change what an already-applied
 * migration means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609210001_create_customer_memos',

  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('customerName', { length: 128, nullable: false });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('customerName');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
