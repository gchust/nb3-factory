import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609190002_create_inspection_tasks',

  async up({ builder }) {
    await builder.createCollection('inspectionTasks', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.integer('equipmentId', { nullable: false });
      collection.integer('templateId', { nullable: false });
      collection.string('assigneeId', { length: 64, nullable: false });
      collection.datetime('plannedDate', { nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('submittedAt', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('assigneeId');
      collection.index('status');
      collection.index('plannedDate');
    });

    await builder.createCollection('inspectionResults', (collection) => {
      collection.increments('id');
      collection.integer('taskId', { nullable: false });
      collection.integer('templateItemId', { nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.text('standard', { nullable: false });
      collection.string('result', { length: 16, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['taskId', 'templateItemId']);
      collection.index('taskId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('inspectionResults');
    await builder.dropCollection('inspectionTasks');
  },
});

export default migration;
