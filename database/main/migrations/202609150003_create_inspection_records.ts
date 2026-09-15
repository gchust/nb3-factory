import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609150003_create_inspection_records',

  async up({ builder }) {
    await builder.createCollection('inspectionRecords', (collection) => {
      collection.increments('id');
      collection.integer('deviceId').notNull();
      collection.integer('planId');
      collection.string('result', { length: 16 }).notNull();
      collection.text('description');
      collection.string('team', { length: 128 });
      collection.string('createdById', { length: 64 }).notNull();
      collection.string('createdByName', { length: 255 });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_inspection_records' });
      collection.index('deviceId', { name: 'idx_inspection_records_device' });
      collection.index('result', { name: 'idx_inspection_records_result' });
      collection.index('createdAt', { name: 'idx_inspection_records_created' });
      collection.index('createdById', {
        name: 'idx_inspection_records_creator',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionRecords');
  },
});

export default migration;
