import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Safety inspections and training records. An inspection that found a high or
 * critical issue and is not closed blocks restoring equipment to service.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010004_create_safety_tables',

  async up({ builder }) {
    await builder.createCollection('safety_checks', (collection) => {
      collection.increments('id');
      collection.integer('labId', { nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.string('checkType', { length: 64, nullable: true });
      collection.string('result', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.string('severity', { length: 32, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'open',
      });
      collection.text('findings', { nullable: true });
      collection.datetime('checkedAt', { nullable: true });
      collection.string('checkedById', { length: 191, nullable: true });
      collection.datetime('closedAt', { nullable: true });
      collection.string('closedById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('labId');
      collection.index('status');
      collection.index('result');
      collection.index('severity');
      collection.foreignKey(['labId'], {
        references: { collection: 'laboratories', fields: ['id'] },
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('training_records', (collection) => {
      collection.increments('id');
      collection.integer('labId', { nullable: false });
      collection.integer('equipmentId', { nullable: true });
      collection.string('title', { length: 200, nullable: false });
      collection.string('trainer', { length: 200, nullable: true });
      collection.datetime('trainedAt', { nullable: true });
      collection.integer('participantCount', {
        nullable: false,
        defaultValue: 0,
      });
      collection.text('notes', { nullable: true });
      collection.string('createdById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('labId');
      collection.index('equipmentId');
      collection.foreignKey(['labId'], {
        references: { collection: 'laboratories', fields: ['id'] },
        onDelete: 'restrict',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('training_records');
    await builder.dropCollection('safety_checks');
  },
});

export default migration;
