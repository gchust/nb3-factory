import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_access_counters',

  async up({ builder }) {
    await builder.createCollection('accessCounters', (collection) => {
      collection.increments('id');
      collection.string('key', { length: 64, nullable: false });
      collection.integer('count', { nullable: false, defaultValue: 0 });
      collection.datetime('updatedAt', { nullable: true });
      collection.unique('key');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('accessCounters');
  },
});

export default migration;
