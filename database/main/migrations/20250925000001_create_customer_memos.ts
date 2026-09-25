import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Structure for the customer memo basic data system.
 *
 * Self-contained on purpose: a migration is immutable history, so every field
 * and index is spelled out here rather than imported from a collection
 * definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20250925000001_create_customer_memos',
  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('customerName', { length: 255, nullable: false });
      collection.text('remark');
      collection.datetime('createdAt', { nullable: false });
      collection.index(['customerName'], {
        name: 'idx_customer_memos_customer_name',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
