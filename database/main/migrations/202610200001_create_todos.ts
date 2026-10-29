import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The single table behind the overdue-todo scheduling test: the title, its due time, whether the work is done, and
 * whether the expiry check has marked it overdue. `expired` is intentionally separate from `completed` so the check
 * can record its result without changing the completion state the user owns.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.string('id', { length: 64 }).primary({ name: 'pk_todos' });
      collection.string('title', { length: 255 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull().defaultTo(false);
      collection.boolean('expired').notNull().defaultTo(false);
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
