import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The todo table behind the application's `/todos` page and its overdue schedule.
 *
 * `expired` is written by the `todos.mark-overdue` schedule so the page can show what the schedule did; it is not
 * derived from `dueAt` when a row is read, because the schedule is the only writer that owns that transition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_todo',

  async up({ builder }) {
    await builder.createCollection('todo', (collection) => {
      collection.string('id', { length: 36 }).notNull();
      collection.string('title', { length: 191 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull().defaultTo(false);
      collection.boolean('expired').notNull().defaultTo(false);

      collection.primary('id', { name: 'pk_todo' });
      // The overdue scan filters on all three columns and reads rows in due order.
      collection.index(['completed', 'expired', 'dueAt'], {
        name: 'idx_todo_overdue',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todo');
  },
});

export default migration;
