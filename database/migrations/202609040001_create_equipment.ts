import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The office equipment ledger. Status is managed by the borrowing workflow
 * (available -> borrowed -> available, with a repair side-track owned by
 * maintainers), so this table only ever stores one of the three canonical
 * values and never derives them.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609040001_create_equipment',
  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('assetNumber', { length: 64, nullable: false });
      collection.string('category', { length: 64, nullable: false });
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('available');
      collection.text('description', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['assetNumber']);
      collection.index(['status']);
      collection.index(['category']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('equipment');
  },
});

export default migration;
