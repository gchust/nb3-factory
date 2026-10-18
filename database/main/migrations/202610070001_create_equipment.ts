import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The shared equipment ledger: one row per physical device. `status` stores a stable code
 * (`available` or `borrowed`) and the interface translates it; `notes` is optional.
 *
 * The shape is spelled out here rather than imported from a collection definition, so this already
 * applied migration keeps its meaning as the application evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_equipment',

  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 191 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.text('notes').nullable();

      collection.unique('code', { name: 'uq_equipment_code' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('equipment');
  },
});

export default migration;
