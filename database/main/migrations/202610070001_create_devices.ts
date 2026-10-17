import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The equipment ledger: one row per device. `code` is the business identifier and is unique; `status` holds the
 * system value (`available` or `borrowed`), never a translated label. The display text is chosen by the interface,
 * so switching language does not rewrite stored data.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      // `increments` makes this the primary key and auto-increment column.
      collection.increments('id');
      collection.string('code', {
        length: 64,
        nullable: false,
      });
      collection.string('name', {
        length: 200,
        nullable: false,
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'available',
      });
      collection.text('notes').nullable();
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt').nullable();

      collection.unique('code', { name: 'uq_devices_code' });
      collection.index('status', { name: 'idx_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
