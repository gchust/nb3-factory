import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Inspection plans/tasks and the AI service-assistant conversation store. */
const migration: MigrationDefinition = defineMigration({
  name: '202609220104_create_service_inspections_and_assistant',

  async up({ builder }) {
    await builder.createCollection('serviceInspectionPlans', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('cron', { length: 64, nullable: false });
      collection.string('timezone', {
        length: 64,
        nullable: false,
        defaultValue: 'Asia/Shanghai',
      });
      collection.string('region', { length: 16 });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('lastRunAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
    });

    await builder.createCollection('serviceInspectionTasks', (collection) => {
      collection.increments('id');
      collection.integer('planId');
      collection.integer('deviceId', { nullable: false });
      collection.string('taskDate', { length: 10, nullable: false });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.string('assigneeId', { length: 64 });
      collection.text('note');
      collection.datetime('completedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['deviceId', 'taskDate']);
      collection.index('taskDate');
      collection.index('status');
      collection.index('assigneeId');
    });

    await builder.createCollection(
      'serviceAssistantConversations',
      (collection) => {
        collection.increments('id');
        collection.string('userId', { length: 64, nullable: false });
        collection.string('title', { length: 200 });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.index('userId');
      },
    );

    await builder.createCollection('serviceAssistantMessages', (collection) => {
      collection.increments('id');
      collection.integer('conversationId', { nullable: false });
      collection.string('role', { length: 16, nullable: false });
      collection.text('content', { nullable: false });
      collection.json('context');
      collection.datetime('createdAt', { nullable: false });
      collection.index('conversationId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceAssistantMessages');
    await builder.dropCollection('serviceAssistantConversations');
    await builder.dropCollection('serviceInspectionTasks');
    await builder.dropCollection('serviceInspectionPlans');
  },
});

export default migration;
