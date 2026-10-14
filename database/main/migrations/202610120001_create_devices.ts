import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `devices` table: one row per device in the ledger the team lends out.
 *
 * `id` is an application-generated string, so the API can address every record by the string id the HTTP API design
 * requires without relying on the dialect's auto-increment. `reference` (编号) is the business number the team labels
 * a device with and is unique; `status` holds one of the codes the UI translates (`available` / `borrowed`) rather
 * than a translated label, so the stored data never depends on the viewer's language.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610120001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.string('id', { length: 36 }).notNull();
      collection.string('reference', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.text('remark').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_devices' });
      collection.unique('reference', { name: 'uq_devices_reference' });
      collection.index('status', { name: 'idx_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
