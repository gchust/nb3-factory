import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130003_create_delivery_tasks',

  async up({ builder }) {
    await builder.createCollection('deliveryTasks', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('projectId', { nullable: false });
      collection.integer('milestoneId', { nullable: true });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'medium',
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'todo',
      });
      collection.string('plannedDate', { length: 32, nullable: true });
      collection.string('actualDate', { length: 32, nullable: true });
      collection.text('description', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.string('createdAt', { length: 32, nullable: false });
      collection.string('updatedAt', { length: 32, nullable: false });
      collection.index('projectId');
      collection.index('milestoneId');
      collection.index('assigneeId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryTasks');
  },
});

export default migration;
