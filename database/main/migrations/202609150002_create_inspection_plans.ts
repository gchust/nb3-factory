import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609150002_create_inspection_plans',

  async up({ builder }) {
    await builder.createCollection('inspectionPlans', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255 }).notNull();
      collection.string('cycle', { length: 16 }).notNull();
      collection.string('team', { length: 128 }).notNull();
      collection.datetime('startDate').notNull();
      collection.string('status', { length: 16 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_inspection_plans' });
      collection.index('team', { name: 'idx_inspection_plans_team' });
      collection.index('status', { name: 'idx_inspection_plans_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionPlans');
  },
});

export default migration;
