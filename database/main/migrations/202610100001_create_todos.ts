import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The todo table behind `/todos`. Its only job in this application is to give the "check overdue todos" schedule
 * something to mark: a record whose `dueAt` has passed and which is not `completed` becomes `expired`.
 *
 * The shape is spelled out here rather than imported, so a later definition cannot change what this migration did.
 * `dueAt` is an instant (`datetimeTz`), so comparing it with "now" marks the same todos regardless of the time zone
 * the server or the browser happens to be in, and the page can render the deadline in the reader's own zone.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610100001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.datetimeTz('dueAt', { nullable: false });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.boolean('expired', { nullable: false, defaultValue: false });

      // The schedule's filter is `completed = false AND expired = false AND dueAt <= now`; this index covers it.
      collection.index(['completed', 'expired', 'dueAt'], {
        name: 'idx_todos_overdue',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
