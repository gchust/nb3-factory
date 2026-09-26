import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The application's single business table: one customer memo per row.
 *
 * `name` is required and is the field the list searches on, `note` is optional, and `createdAt` is the only timestamp
 * the product asks for. Nothing here is unique on purpose: one customer may legitimately have several memos, so a
 * constraint on `name` would reject real data.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260001_create_customer_memos',
  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 200, nullable: false });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
