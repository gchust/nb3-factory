import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `todos` table the scheduling task maintains: a title, a due time, and the two booleans the task reads
 * and writes.
 *
 * `expired` is derived, not entered: the `todos.check-expired` schedule marks every overdue, unfinished row, so the
 * seed stores it as `false` and the first real run flips the rows whose `dueAt` has passed.
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

      collection.index(['expired', 'completed', 'dueAt'], {
        name: 'idx_todos_expiry',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
