import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the device ledger: one row per device, with the code an operator uses to identify it.
 *
 * The shape is spelled out here rather than derived from an evolving definition, so a later change to the service
 * cannot change what this migration did. `status` is one of `available` or `borrowed`; it is a string rather than a
 * database enum so a new status is a data change rather than a schema migration.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('available');
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_devices' });
      collection.unique('code', { name: 'uq_devices_code' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
