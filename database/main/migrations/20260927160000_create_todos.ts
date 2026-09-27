import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The minimal table the overdue-todo verification needs: a title, a deadline,
 * the completion flag, and the flag the scheduled task owns.
 *
 * `dueAt` is `datetimeTz` so a deadline is an unambiguous instant and the
 * `dueAt < now` comparison does not depend on the server's local zone.
 * `title` is unique so the seed's `upsertOne` has a stable key to be idempotent
 * on.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260927160000_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.datetimeTz('dueAt', { nullable: false });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.boolean('expired', { nullable: false, defaultValue: false });
      collection.unique('title');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
