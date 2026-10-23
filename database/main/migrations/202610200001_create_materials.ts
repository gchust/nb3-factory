import { defineMigration } from '@nocobase/db';

// The internal materials library of Issue #797. One row is one material a
// contributor owns. `ownerId` is stored as a plain column rather than a
// relation: the Users plugin owns the user table, and a material must survive a
// user being disabled or removed.
const migration = defineMigration({
  name: '202610200001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('ownerName', { length: 255 }).nullable();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_materials' });
      collection.index('ownerId', { name: 'ix_materials_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
