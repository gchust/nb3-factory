import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer memos are notes a signed-in user keeps about a customer.
 *
 * The table is self-contained: the migration spells out every field so that a
 * later change to application code cannot silently alter what this migration
 * means once it has been applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609230001_create_customer_memos',
  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('customerName', { length: 128, nullable: false });
      collection.text('content', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
