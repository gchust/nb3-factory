import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610060002_create_todos',
  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull().defaultTo(false);
      collection.boolean('expired').notNull().defaultTo(false);
      collection.index('dueAt');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
