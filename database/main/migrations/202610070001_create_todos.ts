import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `todos` table the todo page reads and the scheduled expiry task updates.
 *
 * A todo is past due when `dueAt` is before now and `completed` is false. `expired` is the flag the scheduled task
 * sets once; it is stored rather than derived so a record's status cannot change when the clock moves on, and so a
 * completed record is never re-labelled by a later run. `increments('id')` supplies the primary key, so ids start at
 * 1 and every API response renders them as strings.
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
      collection.datetime('createdAt').notNull();

      collection.index('dueAt', { name: 'idx_todos_due_at' });
      collection.index('expired', { name: 'idx_todos_expired' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
