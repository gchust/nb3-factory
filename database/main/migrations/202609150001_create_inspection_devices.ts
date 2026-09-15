import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609150001_create_inspection_devices',

  async up({ builder }) {
    await builder.createCollection('inspectionDevices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('location', { length: 255 }).notNull();
      collection.string('type', { length: 64 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_inspection_devices' });
      collection.unique('code', { name: 'uq_inspection_devices_code' });
      collection.index('status', { name: 'idx_inspection_devices_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionDevices');
  },
});

export default migration;
