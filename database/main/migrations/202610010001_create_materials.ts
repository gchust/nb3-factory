import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Business table for the service team's reference materials ("资料").
// Only a title and a body are stored. `visibility` is the record-level
// confidentiality flag enforced by the `materials.public` record access:
// `public` is readable by every signed-in colleague, anything else (the
// supervisor-only material uses `supervisor`) is not.
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_materials',
  async up({ builder }) {
    await builder.createCollection(
      'materials',
      (collection) => {
        collection.increments('id');
        collection.string('title', { length: 255 }).notNull();
        collection.text('body').notNull();
        collection
          .string('visibility', { length: 32 })
          .notNull()
          .defaultTo('public');
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', { name: 'pk_materials' });
        collection.unique('title', { name: 'uq_materials_title' });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
