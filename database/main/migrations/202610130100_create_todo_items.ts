import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the `todoItems` table behind the `/todos` page and the Scheduler's overdue marking: a todo's title, the
 * instant it is due, whether it is done, and whether the `todos.mark-overdue` schedule has flagged it as past its
 * due time. The schedule only ever flips `overdue`; it never touches `completed` and never inserts a row.
 *
 * The shape is spelled out here rather than derived from a Collection definition, so a later change to the
 * application's model cannot silently change what this migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610130100_create_todo_items',

  async up({ builder }) {
    await builder.createCollection('todoItems', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.datetime('dueAt').notNull();
      collection.boolean('completed').notNull().defaultTo(false);
      collection.boolean('overdue').notNull().defaultTo(false);

      // The overdue marking scans by due time; the index keeps that scan proportional to the matching rows.
      collection.index('dueAt', { name: 'idx_todo_items_due_at' });
      // A todo's title is its stable identity here: the sample seed keys on it, and a duplicate title would make an
      // idempotent seed impossible. Distinct wording is a reasonable constraint for this small application.
      collection.unique('title', { name: 'uq_todo_items_title' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todoItems');
  },
});

export default migration;
