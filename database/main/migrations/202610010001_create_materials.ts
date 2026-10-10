import { defineMigration } from '@nocobase/db';

/**
 * Creates the `materials` Collection behind the read-only materials assistant.
 *
 * The shape is spelled out here rather than derived from any registry so a
 * later refactor cannot silently change what this migration did.
 *
 * Only `title` and `body` are content. `confidential` is access metadata: a
 * colleague may read a non-confidential material and must not learn that a
 * confidential one exists, so it is the column the `materials.viewable`
 * record-access rule filters on. `createdAt` records when the material was
 * filed and is never rewritten.
 */
const migration = defineMigration({
  name: '202610010001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').notNull();
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.index('confidential', {
        name: 'idx_materials_confidential',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
