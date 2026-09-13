import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_delivery_milestones',

  async up({ builder }) {
    await builder.createCollection('deliveryMilestones', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('projectId', { nullable: false });
      collection.string('plannedDate', { length: 32, nullable: true });
      collection.string('actualDate', { length: 32, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'not_started',
      });
      collection.string('createdAt', { length: 32, nullable: false });
      collection.string('updatedAt', { length: 32, nullable: false });
      collection.index('projectId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryMilestones');
  },
});

export default migration;
