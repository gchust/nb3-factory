import { defineMigration } from '@nocobase/db';

// The only business table of this application. It is self-contained on purpose: a migration is immutable history, so
// every field, default and nullability is spelled out here rather than imported from a Collection definition that
// keeps evolving.
export default defineMigration({
  name: '20260926000001_create_todos',
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
