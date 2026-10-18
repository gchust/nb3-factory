import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `devices` table of the device ledger (设备台账).
 *
 * The ledger records only what the business asked for: a required, unique `code` (编号), a required `name` (名称),
 * and a `status` (状态) that is one of `available` (可借用) or `borrowed` (已借出). Values are fixed here rather than
 * read from a Collection definition, so a later change to the model cannot silently change what this migration did.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('status', { length: 32 }).notNull();

      collection.unique('code', { name: 'uq_devices_code' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
