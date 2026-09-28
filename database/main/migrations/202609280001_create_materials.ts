import { defineMigration } from '@nocobase/db';

/**
 * The materials the internal read-only assistant answers from.
 *
 * Only a title and a body carry business content, as the requirement states.
 * `slug` is a stable identifier the assistant can cite without depending on a
 * numeric id, and `audience` records who a material is visible to: `all` for
 * every signed-in colleague, `manager` for the manager-only material. The
 * visibility rule is enforced by the application service and the API route,
 * not by this schema.
 */
const migration = defineMigration({
  name: '202609280001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('slug', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').notNull();
      collection.string('audience', { length: 16 }).notNull().defaultTo('all');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', {
        name: 'pk_materials',
      });
      collection.unique('slug', {
        name: 'uq_materials_slug',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
