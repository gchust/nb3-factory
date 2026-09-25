import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The application's only business table. `customerName` is required, `notes` is optional, and `createdAt` is written
 * explicitly so a seed can install deterministic example rows instead of relying on the wall clock.
 *
 * Every field is spelled out here rather than derived from a Collection definition or model: an applied migration is
 * immutable history, so what it meant when it ran must not change as the application's code evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260201000001_create_customer_memos',
  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('customerName', { length: 255, nullable: false });
      collection.text('notes', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
