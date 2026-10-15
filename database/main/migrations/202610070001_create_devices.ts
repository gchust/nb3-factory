import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates `devices`, the shared device ledger a mixed Chinese/English team uses to find out which equipment is
 * available and which is already lent out.
 *
 * The table stores no translated text: `code` and `name` are what a person typed, and `status` is a language-neutral
 * code (`available` / `borrowed`) that the interface and the API render in the reader's own language. `notes` is
 * optional free text and is never machine-translated.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_devices',

  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection
        .string('status', { length: 16 })
        .notNull()
        .defaultTo('available');
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.unique('code', { name: 'uq_devices_code' });
      collection.index('status', { name: 'idx_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
