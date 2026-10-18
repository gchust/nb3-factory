import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `devices` table of the device ledger (设备台账): the fixed fields a device records and nothing else.
 *
 * `code` identifies a device and is unique, `name` is required, and `status` is `available` or `borrowed`. The status
 * index keeps the list's filter cheap. The table has no `createdAt`/`updatedAt`: the issue states the ledger records
 * only these three fields, so the list orders by the primary key instead of a timestamp.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection
        .string('status', { length: 16, defaultValue: 'available' })
        .notNull();

      collection.primary('id', { name: 'pk_devices' });
      collection.unique('code', { name: 'uq_devices_code' });
      collection.index('status', { name: 'idx_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
