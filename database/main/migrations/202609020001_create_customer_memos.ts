import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The single business table behind the customer memo feature.
 *
 * `name` is the only required column, `notes` is free text and optional, and
 * `createdAt` records when the memo was entered. `createdAt` deliberately has
 * no database default: the application sets it from an explicit `new Date()`
 * so the stored value is the same regardless of the database server's clock or
 * time zone.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_customer_memos',

  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.text('notes', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
