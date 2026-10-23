import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A todo's due time and two independent flags: whether somebody completed it, and whether the scheduler marked it
 * expired after its due time passed. Keeping `expired` separate from a derived comparison means the flag records what
 * the schedule actually did, and a completed todo is never marked expired by that schedule.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull().defaultTo(false);
      collection.boolean('expired').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_todos' });
      collection.index(['completed', 'expired', 'dueAt'], {
        name: 'idx_todos_overdue_scan',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
