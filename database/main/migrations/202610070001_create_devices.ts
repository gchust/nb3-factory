import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `devices` table: the device ledger a mixed Chinese/English team shares (issue #701).
 *
 * A device records only its code (编号), its name (名称) and its status (状态). `code` is required and unique, `name`
 * is required. `status` is stored as the canonical English value (`available` or `borrowed`); a route validates the
 * enumeration, so adding a value later is a server change rather than a schema change.
 *
 * The schema is spelled out here rather than imported from a shared definition, so a later release cannot change what
 * this migration did.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('status', { length: 32, nullable: false });

      collection.unique('code', { name: 'uq_devices_code' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
