import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The one business table this application owns: a customer memo.
 *
 * A memo is a customer name, an optional free-form note, and the time it was created. `createdAt` is declared without
 * a default on purpose — the create endpoint sets it — so the column means the same thing on every dialect.
 *
 * Immutable history: every field is spelled out here and nothing is imported from a Collection definition that keeps
 * evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280001_create_customer_memos',

  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
