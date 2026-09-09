import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609090001_create_team_todos',

  async up({ builder }) {
    await builder.createCollection('teamTodos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 100, nullable: false });
      collection.text('description', { nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.string('priority', {
        length: 32,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.date('dueDate', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('teamTodos');
  },
});

export default migration;
