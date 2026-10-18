import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `todos` table of the todo demo: a title, a due instant, whether the todo is done, and whether the
 * scheduled sweep has marked it expired.
 *
 * `expired` is stored rather than derived so the scheduled run leaves a record of what it did: a todo is expired only
 * when the sweep has seen it past its due time while still open. `completed` and `expired` are independent, which is
 * why the sweep filters on both and the list can show a completed todo that was never expired.
 *
 * The composite index covers exactly the sweep's filter — open, not yet marked, past due — so repeated runs stay
 * cheap as the table grows. `id` is a UUID rather than a counter: it is the identifier the HTTP API returns and that a
 * page links to, and the application's API design uses string ids throughout.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610170001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.uuid('id');
      collection.string('title', { length: 200 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull();
      collection.boolean('expired').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_todos' });
      collection.index(['completed', 'expired', 'dueAt'], {
        name: 'idx_todos_expiry_sweep',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
