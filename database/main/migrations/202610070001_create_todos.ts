import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The one table this scaffolding task needs, to prove a scheduled task runs and writes back. Four business columns
 * only, matching the requirement exactly: a title, a deadline, and the two flags the schedule maintains.
 *
 * The shape is spelled out here rather than imported from a Collection definition, so a later change to that
 * definition cannot silently change what this already-applied migration means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull().defaultTo(false);
      collection.boolean('expired').notNull().defaultTo(false);
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
