import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `todos` table this application's scheduling walkthrough uses: an ordinary todo with a due date and two
 * flags. `overdue` is written by the "检查过期待办" Schedule's target once a todo's `dueAt` has passed while
 * `completed` is still false; it is a stored flag rather than a computed column so a completed todo keeps the value it
 * had when it was completed.
 *
 * The shape is spelled out here rather than imported from a collection definition so a later edit to the application's
 * schema cannot change what this migration did; changing the table means a new migration.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed', { defaultValue: false }).notNull();
      collection.boolean('overdue', { defaultValue: false }).notNull();

      collection.primary('id', { name: 'pk_todos' });
      // The overdue check filters on all three: dueAt before now, completed false, overdue false.
      collection.index(['completed', 'overdue', 'dueAt'], {
        name: 'idx_todos_overdue',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
