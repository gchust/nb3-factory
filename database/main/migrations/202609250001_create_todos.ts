import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The table behind the scheduled-task verification page: a todo with a due
 * time, a completion flag and an expiry flag the schedule flips.
 *
 * Self-contained on purpose — a migration states the shape it created, so a
 * later change to a Collection definition or model never rewrites history.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250001_create_todos',
  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.datetimeTz('dueAt', { nullable: false });
      collection.boolean('completed', {
        nullable: false,
        defaultValue: false,
      });
      collection.boolean('expired', { nullable: false, defaultValue: false });
      collection.datetimeTz('createdAt', { nullable: false });
      // The scheduled task filters on exactly these two state fields plus the
      // due time, so the index mirrors the query it runs every interval.
      collection.index(['completed', 'expired', 'dueAt'], {
        name: 'todos_expiry_lookup_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
