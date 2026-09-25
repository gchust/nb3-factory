import { defineMigration } from '@nocobase/db';

// The table behind the device inventory. It carries only the two business
// fields the issue asks for — the code (编号) and the name (名称) — plus an
// explicit string primary key and timestamps. Business code assigns the id, so
// the seed rows and test fixtures have stable identifiers. `code` is unique so
// the same number cannot identify two devices.
const migration = defineMigration({
  name: '202609250001_create_devices',
  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_devices' });
      collection.unique('code', { name: 'uniq_devices_code' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
