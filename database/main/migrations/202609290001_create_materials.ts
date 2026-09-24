import { defineMigration } from '@nocobase/db';

// The data table behind the one-page material library. It is deliberately a
// plain table with an explicit string primary key: business code assigns the id
// (so seed rows and test fixtures have stable identifiers) and no relation is
// needed for the permission scenarios this application demonstrates.
const migration = defineMigration({
  name: '202609290001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
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
