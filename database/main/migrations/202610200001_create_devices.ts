import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The device ledger: one row per device that can be borrowed, with a unique,
 * human-readable code and its current availability.
 *
 * The status is stored as a short string rather than a database enum so the
 * application can add a state without an irreversible schema operation.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection.string('status', { length: 32 }).notNull();

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
