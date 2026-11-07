import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The device ledger: the small set of facts the business keeps about a device. `code` is the identifier people use
 * when they talk about a device, so it is unique. `name` and `code` are user-entered data and are never translated.
 *
 * The shape is spelled out here rather than importing an evolving Collection definition: a migration is immutable
 * history, and a later field belongs in a new migration.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060002_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection.string('status', { length: 16 }).notNull().defaultTo('available');
      collection.text('notes').nullable();

      collection.primary('id', { name: 'pk_devices' });
      collection.unique('code', { name: 'uq_devices_code' });
      collection.index('status', { name: 'ix_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
