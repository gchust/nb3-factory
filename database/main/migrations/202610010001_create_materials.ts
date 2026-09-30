import { defineMigration } from '@nocobase/db';
import type { MigrationDefinition } from '@nocobase/db';

/**
 * Internal material records for the "资料助手" assistant.
 *
 * A material is a title and a body. `confidential` is an access flag owned by the
 * application, not a user-maintained field: it decides whether the record is
 * visible to regular colleagues through both the page and the assistant.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection
        .title('Materials')
        .description(
          'Internal materials the read-only assistant answers from.',
        );
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').notNull();
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
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
