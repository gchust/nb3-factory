import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The application's single business table: a personal To-do list.
 *
 * Duplicates are allowed on purpose — the same person may legitimately add the
 * same wording twice — so `title` carries no unique constraint and the
 * table's identity stays its auto-incrementing `id`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
