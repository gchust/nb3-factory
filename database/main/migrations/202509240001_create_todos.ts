import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The one table the scheduling demonstration needs: a todo with a deadline and
 * two booleans the scheduled check is allowed to flip.
 *
 * `dueAt` is stored as `datetimeTz` because a deadline is an absolute instant;
 * `completed` and `overdue` are the business state the scheduled task reads and
 * writes. `title` is unique so the seed can key on it and stay idempotent.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202509240001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.datetimeTz('dueAt', { nullable: false });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.boolean('overdue', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('title');
      collection.index('overdue');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
