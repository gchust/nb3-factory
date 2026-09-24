import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The todo table the scheduled "检查过期待办" task operates on.
 *
 * `title` is the stable business key: the seed upserts on it, so a repeated
 * run is a no-op, and it carries a unique constraint to back that up.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.datetimeTz('deadline', { nullable: false });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.boolean('expired', { nullable: false, defaultValue: false });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.unique('title');
      collection.index(['expired', 'completed', 'deadline']);
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
