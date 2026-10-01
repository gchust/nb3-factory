import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The single business collection of the internal material library (内部资料库).
 * Ownership is `ownerId`, written by the create route from the authenticated
 * principal; `published` and `confidential` carry the two visibility flags the
 * requirements describe.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('content').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_materials' });
      collection.index('ownerId', { name: 'idx_materials_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
