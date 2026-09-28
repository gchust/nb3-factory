import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The device list a factory integration reads: exactly the two business fields the task asks for, `code` and `name`,
 * plus the structural primary key. Self-contained history — it names every field, index and constraint itself, so a
 * later change to the resource declaration cannot change what this migration means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280001_create_devices',
  async up({ builder }) {
    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 128 }).notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('devices');
  },
});

export default migration;
