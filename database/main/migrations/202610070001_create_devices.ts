import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `devices` table behind the device ledger: the equipment a team lends out.
 *
 * A device records only what the ledger needs — a required `code` (编号, unique), a required `name` (名称) and a
 * required `status` (状态, `available` or `borrowed`). There are no timestamps or audit columns on purpose: the
 * requirement is that a device records only these three fields, and a later need for them is a new migration rather
 * than a field this one quietly grew.
 *
 * `status` is a plain string rather than a database enum so the accepted values live in one place, the route's zod
 * schema, and a new status is a code change instead of a dialect-specific schema change. The index makes the list's
 * status filter cheap.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('status', { length: 32, nullable: false });

      collection.unique('code', { name: 'uq_devices_code' });
      collection.index('status', { name: 'idx_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
