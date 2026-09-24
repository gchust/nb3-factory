import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The one business table of the overdue-todo feature.
 *
 * `expired` is the field the scheduled task writes: it is set on a record whose
 * `dueAt` has passed while `completed` is still false. `sourceKey` is a
 * nullable technical key the seed uses to stay idempotent without constraining
 * a user-chosen title; it is unique (multiple NULLs are allowed), so ordinary
 * records created from the page leave it empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240001_create_todos',

  async up({ builder }) {
    await builder.createCollection('todos', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.datetime('dueAt', { nullable: false });
      collection.boolean('completed', { nullable: false, defaultValue: false });
      collection.boolean('expired', { nullable: false, defaultValue: false });
      collection.string('sourceKey', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('sourceKey');
      collection.index('dueAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('todos');
  },
});

export default migration;
