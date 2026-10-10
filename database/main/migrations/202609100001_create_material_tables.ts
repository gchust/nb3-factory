import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Internal document library (资料库).
 *
 * `materials` holds one row per document with its publication and
 * confidentiality flags plus the responsible owner. `materialShares` holds the
 * administrator-created temporary access grants that open a single draft to a
 * single reader. Both tables are spelled out here because a migration is
 * immutable history and must not depend on a living Collection definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_material_tables',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('content').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull();
      collection.boolean('confidential').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_materials' });
      collection.index('ownerId', { name: 'idx_materials_owner' });
    });

    await builder.createCollection('materialShares', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('materialId', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_material_shares' });
      collection.unique(['materialId', 'userId'], {
        name: 'uq_material_shares_material_user',
      });
      collection.index('userId', { name: 'idx_material_shares_user' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materialShares');
    await builder.dropCollection('materials');
  },
});

export default migration;
