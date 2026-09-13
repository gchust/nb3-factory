import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130004_create_delivery_timesheets',

  async up({ builder }) {
    await builder.createCollection('deliveryTimesheets', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.integer('taskId', { nullable: false });
      collection.integer('projectId', { nullable: false });
      collection.string('workDate', { length: 32, nullable: false });
      collection.decimal('hours', {
        precision: 5,
        scale: 2,
        nullable: false,
      });
      collection.text('description', { nullable: false });
      collection.string('createdAt', { length: 32, nullable: false });
      collection.string('updatedAt', { length: 32, nullable: false });
      // One member may register at most one entry per task per day.
      collection.unique(['userId', 'taskId', 'workDate']);
      collection.index('taskId');
      collection.index('projectId');
      collection.index('userId');
      collection.index('workDate');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryTimesheets');
  },
});

export default migration;
