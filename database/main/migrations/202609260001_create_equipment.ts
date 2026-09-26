import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment ledger: every device that can be lent out.
 *
 * `assetNo` is the business identifier used on the ledger and in the borrow
 * records, so it is unique. Timestamps are written by the application service
 * rather than the database, so both columns are declared non-null and every
 * write sets them explicitly.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260001_create_equipment',
  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('assetNo', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('category', { length: 64, nullable: false });
      collection.text('notes', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('assetNo');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('equipment');
  },
});

export default migration;
