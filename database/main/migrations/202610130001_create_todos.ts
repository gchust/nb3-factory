import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `todos` table behind the minimal todo page and the "check expired todos" schedule.
 *
 * The table is deliberately small: a title, the time a todo falls due, and two flags the schedule reads and writes.
 * `completed` is the person's own state; `expired` is what the schedule sets once `dueAt` has passed and the todo is
 * still open. The schedule never touches a completed or future-dated row, so `completed` and `dueAt` are part of the
 * scan index rather than a filter applied after the read.
 *
 * `reference` is an internal, optional key the installation seed uses to stay idempotent (`upsertOne` needs a unique
 * field to match on). It is not shown in the UI and is not part of the todo's identity to a person.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610130001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull();
      collection.boolean('expired').notNull();
      collection.string('reference', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_todos' });
      collection.unique('reference', { name: 'uq_todos_reference' });
      collection.index(['completed', 'expired', 'dueAt'], {
        name: 'idx_todos_expiry_scan',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
