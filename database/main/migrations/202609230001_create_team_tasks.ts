import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609230001_create_team_tasks',

  async up({ builder }) {
    await builder.createCollection('teamTasks', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('notes', { nullable: true });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('teamTasks');
  },
});

export default migration;
