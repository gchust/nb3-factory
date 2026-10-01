import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Personal todo list.
 *
 * `seedKey` carries a stable business key for the example rows a seed inserts,
 * so the seed can be idempotent without treating a user-editable title as
 * unique. It is nullable, so user-created todos leave it empty, and dialects
 * allow several NULL values under a unique index.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609290001_create_todos',
  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('notes', { nullable: true });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.string('seedKey', { length: 64, nullable: true }).unique();
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
